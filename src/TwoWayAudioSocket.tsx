import { Encoder } from './Encoder'
import { Decoder } from './Decoder'
import { ByteQueue } from './ByteQueue'

const md5 = require('md5')

export type STATE = 'idle'|'master'|'slave'

const MAX_PACKET_SIZE = 1024

export interface Events {
    sendPCM(pcm:Float32Array):number;
    onReceive(bytes:Uint8Array):void;
}

export class TwoWayAudioSocket {

    state:STATE = 'idle'
    //master_state:MASTER_COMMAND = 'invalid'
    //slave_state:SLAVE_COMMAND = 'invalid'

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
    in_session = false
    last_packet = 0;

    constructor(events:Events) {
        this.events = events

        setInterval(() => {
            if (this.in_session && this.last_packet < Date.now()-2000) {
                this.state = 'idle'
            }
        }, 1000)
    }

    private resendPacket() {
        if (this.pending_packet != null)
            this.events.sendPCM(this.encoder.modulate(this.pending_packet))
    }

    private sendStatusPacket(packet:string, flags:Uint8Array|null, resend:boolean) {
        const that = this

        console.log(this.state+" sendStatusPacket "+packet)

        this.expected_receive = Date.now()

        let packet_bytes =  new Uint8Array(3+(flags != null ? flags.length : 0));
        packet_bytes[0] = "[".charCodeAt(0)
        packet_bytes[1] = packet.charCodeAt(0)
        if (flags != null && flags.length>0)
            packet_bytes.set(flags, 2)
        packet_bytes[packet_bytes.length-1] = "]".charCodeAt(0)

        this.events.sendPCM(this.encoder.modulate(packet_bytes))

        if (resend) {
            function hasReplay() {
                if (that.expected_receive != 0 && that.expected_receive < Date.now()-1000) {
                    that.sendStatusPacket(packet, flags, resend)
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
            let packet_bytes =  new Uint8Array(send_bytes.length+3);
            packet_bytes[0] = "[".charCodeAt(0)
            packet_bytes[1] = "p".charCodeAt(0)
            packet_bytes.set(send_bytes, 2)
            packet_bytes[packet_bytes.length-1] = "]".charCodeAt(0)

            this.pending_packet = packet_bytes

            this.events.sendPCM(this.encoder.modulate(packet_bytes))

            return true
        }
        return false
    }

    processPCM(pcm:Float32Array) {
        let bytes = this.decoder.decode(pcm);

        if (bytes.length>0) {
            this.expected_receive = 0;

            console.log(this.state+' processPCM', bytes)
            this.input_buffer.append(bytes);
            this.process();
        }
    }

    private process() {
        while (this.input_buffer.length() > 0) {
            if (String.fromCharCode(this.input_buffer.getByte(0))[0] == '[') {
                // Packet is in sync
                console.log(this.state+' packet in sync')

                let offset = this.input_buffer.findCharacter("]".charCodeAt(0))
                console.log(this.state+' packet close offset '+offset)
                if (offset > -1) {
                    // Full packet found
                    let packet = this.input_buffer.get(offset+1);
                    console.log(this.state+' extracted packet ', packet)

                    this.processPacket(packet)
                } else 
                    return

            } else {
                // Packet is not insync
                // Try resync
                console.log(this.state+' packet not insync')
                
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

        console.log(this.state+' processPacket', packet)

        function isArrayEqual(arr1:Uint8Array, arr2:Uint8Array) {
            if (arr1.length != arr2.length)
                return false

            for (let i=0; i<arr1.length; i++) {
                if (arr1[i] != arr2[i])
                    return false
            }

            return true
        }

        if (packet[0] == "[".charCodeAt(0) && packet[packet.length-1] == "]".charCodeAt(0)) {
            if (packet[1] == "e".charCodeAt(0)) {
                this.state = 'idle'
            } else if (this.state == 'master') {
                if (packet[1] == "s".charCodeAt(0)) {

                    // Peer accepted slave status
                    // set master status and send pending packets
                    console.log(this.state+" sendPacket")
                    this.sendPacket();

                } else if (packet[1] == "h".charCodeAt(0)) {

                    console.log(this.state+" checking hash")

                    // Received a sent packet hash accept or reject [a][r]
                    let hash = md5(that.pending_packet)
                    const hashbytes = new Uint8Array(hash.match(/.{1,2}/g).map((byte:any) => parseInt(byte, 16)));
                    const reportedhashbytes = packet.subarray(2, 18);

                    if (isArrayEqual(hashbytes, reportedhashbytes)) {
                        console.log(this.state+" accepting packet")

                        // The hash matched, send next packet or terminate
                        that.pending_packet = null

                        if (that.output_buffer.length() > 0) {
                            this.sendStatusPacket('a', null, false)
                            this.sendPacket()
                        } else {
                            this.sendStatusPacket('t', null, true) // terminate master slave state
                        }
                    } else {
                        console.log(this.state+" rejecting packet")

                        // The hash did not match, reject and resend
                        this.sendStatusPacket('r', null, false)
                        this.resendPacket()
                    }

                } else if (packet[1] == "f".charCodeAt(0)) {
                    // slave acknowledged being freed
                    this.state = 'idle'

                    console.log(this.state+" going to idle")
                }
            } else if (this.state == 'slave') {
                if (packet[1] == "p".charCodeAt(0)) {

                    // Receive packet, replay with packet hash [h]
                    this.pending_packet = packet
                    let hash = md5(packet)
                    const hashbytes = new Uint8Array(hash.match(/.{1,2}/g).map((byte:any) => parseInt(byte, 16)));

                    // Build packet hash confirmation packet
                    this.sendStatusPacket('h', hashbytes, true)

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

                    console.log(this.state+" going to idle")
                    this.state = 'idle'
                    this.sendStatusPacket('f', null, false)
                }
            } else {
                if (packet[1] == "m".charCodeAt(0)) {
                    // Peer is asking for master status
                    // set slave status reply with slave [s]
                    this.state = 'slave'

                    this.in_session = true
                    this.last_packet = Date.now()

                    this.sendStatusPacket('s', null, true)

                } else {
                    this.sendStatusPacket('e', null, false)
                }
            }
        } else {
            throw this.state+' Invalid Packet'
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

            this.in_session = true
            this.last_packet = Date.now()
            
            this.sendStatusPacket('m', null, true)
        }
    }

    transmitReset() {
        this.state = 'idle'
        this.sendStatusPacket('e', null, false)
    }

}