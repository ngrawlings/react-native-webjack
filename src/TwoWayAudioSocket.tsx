import { Encoder } from './Encoder'
import { Decoder } from './Decoder'
import { ByteQueue } from './ByteQueue'

const md5 = require('md5')

export type STATE = 'idle'|'master'|'slave'

const MAX_PACKET_SIZE = 1024

export interface Events {
    sendPCM(pcm:Float32Array):number;
    onReceive(bytes:Uint8Array):void;
    onError(error:string):void;
}

export class TwoWayAudioSocket {

    state:STATE = 'idle'

    encoder:Encoder = new Encoder({
        sampleRate: 44100,
        baud: 1225,
        freqLow:4900,
        freqHigh:7350,
        softmodem:true
    })

    decoder:Decoder = new Decoder({
        sampleRate: 44100,
        baud: 1225,
        freqLow:4900,
        freqHigh:7350,
        softmodem:true
    })

    output_buffer:ByteQueue = new ByteQueue()
    input_buffer:ByteQueue = new ByteQueue()

    pending_packet:Uint8Array|null = null;

    packet_byte_stream:ByteQueue = new ByteQueue()

    events:Events

    expected_receive = 0
    last_packet = 0;

    monitor

    constructor(events:Events) {
        this.events = events

        this.monitor = setInterval(() => {
            if (this.state == 'master' && this.last_packet < Date.now()-2000) {
                this.state = 'idle'
                this.transmitDataQueue()
            } else if (this.state == 'idle' && (this.pending_packet != null || this.output_buffer.length() > 0)) {
                this.transmitDataQueue()
            }
        }, 1000)
    }

    private resendPacket() {
        if (this.pending_packet != null)
            this.events.sendPCM(this.encoder.modulate(this.pending_packet))
    }

    private sendStatusPacket(packet:string, flag:number, data:Uint8Array|null, resend:boolean) {
        const that = this

        this.expected_receive = Date.now()

        let packet_bytes =  new Uint8Array(4+(data != null ? data.length : 0));
        packet_bytes[0] = "[".charCodeAt(0)
        packet_bytes[1] = packet.charCodeAt(0)
        packet_bytes[2] = flag

        if (data != null && data.length>0)
            packet_bytes.set(data, 3)

        packet_bytes[packet_bytes.length-1] = "]".charCodeAt(0)

        this.events.sendPCM(this.encoder.modulate(packet_bytes))

        if (resend) {
            function hasReplay() {
                if (that.expected_receive != 0 && that.expected_receive < Date.now()-1000) {
                    that.sendStatusPacket(packet, flag, data, resend)
                } else {
                    that.expected_receive = 0
                }
            }
            setTimeout(hasReplay, 1000)
        }
    }

    private sendPacket() {
        if (this.state == 'master' && this.pending_packet == null) {
            let send_bytes = this.output_buffer.get(MAX_PACKET_SIZE)
            let packet_bytes =  new Uint8Array(send_bytes.length+5);
            packet_bytes[0] = "[".charCodeAt(0)
            packet_bytes[1] = "p".charCodeAt(0)
            packet_bytes[2] = (send_bytes.length>>8)&0xFF
            packet_bytes[3] = (send_bytes.length)&0xFF
            packet_bytes.set(send_bytes, 4)
            packet_bytes[packet_bytes.length-1] = "]".charCodeAt(0)

            this.pending_packet = packet_bytes

            this.events.sendPCM(this.encoder.modulate(packet_bytes))

            return true
        } else if (this.state == 'master' && this.pending_packet != null) {
            this.events.sendPCM(this.encoder.modulate(this.pending_packet))
            return true;
        }
        return false
    }

    processPCM(pcm:Float32Array) {
        let bytes = this.decoder.decode(pcm);

        if (bytes.length>0) {
            this.expected_receive = 0;
            this.input_buffer.append(bytes);
            this.process();
        }
    }

    private process() {
        while (this.input_buffer.length() >= 4) {
            if (String.fromCharCode(this.input_buffer.getByte(0))[0] == '[') {
                // Packet is in sync

                if (typeof this.input_buffer.getByte(1) === 'undefined') {
                    console.log('packet type is undefined')
                    this.input_buffer.dumpBuffers()
                    return;
                }

                let type = String.fromCharCode(this.input_buffer.getByte(1))
                let packet;

                if (type == 'p') {
                    
                    let len = (this.input_buffer.getByte(2)<<8)&0xFF
                    len |= this.input_buffer.getByte(3)&0xFF

                    if (this.input_buffer.length() >= len+5)
                        packet = this.input_buffer.get(len+5);
                    else
                        return

                } else if (type == 'h') {

                    if (this.input_buffer.length() >= 20)
                        packet = this.input_buffer.get(20);
                    else
                        return

                } else {

                    if (this.input_buffer.length() >= 4)
                        packet = this.input_buffer.get(4);
                    else   
                        return
                }

                if (String.fromCharCode(packet[packet.length-1]) != ']') {
                    console.log("Data streem corruption, reseting state");
                    this.state = 'idle';
                    this.input_buffer.clear()
                    this.sendStatusPacket('e', 0, null, false)
                }

                this.processPacket(packet)

            } else {

                // Packet is not insync
                // Try resync
                let offset = this.input_buffer.findCharacter("[".charCodeAt(0))
                if (offset != -1) {
                    this.input_buffer.get(offset)
                } else {
                    this.input_buffer.clear()
                }

            }
        }
    }

    private processPacket(packet:Uint8Array) {
        const that = this

        function isArrayEqual(arr1:Uint8Array, arr2:Uint8Array) {
            if (arr1.length != arr2.length)
                return false

            for (let i=0; i<arr1.length; i++) {
                if (arr1[i] != arr2[i])
                    return false
            }

            return true
        }

        this.last_packet = Date.now()

        if (packet[0] == "[".charCodeAt(0) && packet[packet.length-1] == "]".charCodeAt(0)) {
            if (packet[1] == "e".charCodeAt(0)) {
                this.state = 'idle'
            } else if (this.state == 'master') {
                if (packet[1] == "s".charCodeAt(0)) {

                    // Peer accepted slave status
                    // set master status and send pending packets
                    this.sendPacket();

                } else if (packet[1] == "h".charCodeAt(0)) {

                    // Received a sent packet hash accept or reject [a][r]
                    let hash = md5(that.pending_packet)
                    const hashbytes = new Uint8Array(hash.match(/.{1,2}/g).map((byte:any) => parseInt(byte, 16)));
                    const reportedhashbytes = packet.subarray(3, 19);

                    if (isArrayEqual(hashbytes, reportedhashbytes)) {
                        // The hash matched, send next packet or terminate
                        that.pending_packet = null

                        if (that.output_buffer.length() > 0) {
                            this.sendStatusPacket('a', 0, null, false)
                            this.sendPacket()
                        } else {
                            this.sendStatusPacket('t', 0, null, true) // terminate master slave state
                        }
                    } else {
                        // The hash did not match, reject and resend
                        this.sendStatusPacket('r', 0, null, false)
                        this.resendPacket()
                    }

                } else if (packet[1] == "f".charCodeAt(0)) {
                    // slave acknowledged being freed
                    this.state = 'idle'
                }
            } else if (this.state == 'slave') {
                if (packet[1] == "p".charCodeAt(0)) {

                    // Receive packet, replay with packet hash [h]
                    this.pending_packet = packet
                    let hash = md5(packet)
                    const hashbytes = new Uint8Array(hash.match(/.{1,2}/g).map((byte:any) => parseInt(byte, 16)));

                    // Build packet hash confirmation packet
                    this.sendStatusPacket('h', 0, hashbytes, true)

                } else if (packet[1] == "a".charCodeAt(0)) {
                    // Accepted packet hash, move on to next packet
                    if (that.pending_packet != null) {
                        let packet_bytes = that.pending_packet.subarray(2, that.pending_packet.length-1);
                        that.pending_packet = null

                        this.events.onReceive(packet_bytes)
                    }

                } else if (packet[1] == "r".charCodeAt(0)) {
                    // Rejected packet hash, drop packet
                    that.pending_packet = null

                } else if (packet[1] == "t".charCodeAt(0)) {
                    // Master/slave status terminated
                    if (that.pending_packet != null) {
                        let packet_bytes = that.pending_packet.subarray(2, that.pending_packet.length-1);
                        that.pending_packet = null

                        this.events.onReceive(packet_bytes)
                    }

                    this.state = 'idle'
                    this.sendStatusPacket('f', 0, null, false)
                } else if (packet[1] == "m".charCodeAt(0)) {
                    this.sendStatusPacket('s', 0, null, true)
                }
            } else {
                if (packet[1] == "m".charCodeAt(0)) {
                    // Peer is asking for master status
                    // set slave status reply with slave [s]
                    this.state = 'slave'
                    this.sendStatusPacket('s', 0, null, true)
                } else if (packet[1] != "f".charCodeAt(0) && packet[1] != "t".charCodeAt(0)) {
                    console.log('idle, unrecognised command '+String.fromCharCode(packet[1]))
                    this.sendStatusPacket('e', 0, null, false) 
                }
            }
        } else {
            this.events.onError('Invalid Packet')
        }
    }

    appendToDataQueue(bytes:Uint8Array) {
        this.output_buffer.append(bytes)
    }

    getState() {
        return this.state
    }

    transmitDataQueue() {
        if (this.state == 'idle') {
            this.state = 'master'

            this.last_packet = Date.now()
            
            this.sendStatusPacket('m', 0, null, true)
        }
    }

    transmitReset() {
        this.state = 'idle'
        this.sendStatusPacket('e', 0, null, false)
    }

    stop() {
        clearInterval(this.monitor)
        this.output_buffer.clear()
        this.input_buffer.clear()
    }

}