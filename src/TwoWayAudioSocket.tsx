import default_config from './Config'
import { Encoder } from './Encoder'
import { Decoder } from './Decoder'
import { ByteQueue } from './ByteQueue'
import { HammingCodes } from './HammingCodes'
import { ByteUtils } from './ByteUtils'

export type STATE = 'idle'|'master'|'slave'

const MAX_PACKET_SIZE = 512

export interface EVENT { type: string, params: any }

export interface Events {
    sendPCM(pcm:Float32Array):number;
    onReceive(bytes:Uint8Array):void;
    onError(error:string):void;
    onEvent(event:EVENT): void;
}

export class TwoWayAudioSocket {

    state:STATE = 'idle'

    encoder:Encoder
    decoder:Decoder

    output_buffer:ByteQueue = new ByteQueue()
    input_buffer:ByteQueue = new ByteQueue()

    packet_byte_stream:ByteQueue = new ByteQueue()

    events:Events

    expected_receive = 0
    last_packet = 0;

    outgoing_block = 0
    incoming_block = -1

    monitor:any

    constructor(events:Events) {
        this.events = events

        this.encoder = new Encoder(default_config)
        this.decoder = new Decoder(default_config)

        this.monitor = setInterval(() => {
            if (this.state == 'master' && this.last_packet < Date.now()-2000) {
                this.state = 'idle'
                this.events.onEvent({ type: "state", params: { value: this.state } })
                this.transmitDataQueue()
            }
        }, 1000)
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

            // Calculate how long it will take to play packet
            let duration = (packet_bytes.length/44100)*1000
            setTimeout(hasReplay, duration+100)
        }
    }

    private sendPacket() {
        if (this.state == 'master') {
            let blocks = Math.floor(this.output_buffer.length()/32)
            if (this.output_buffer.length()%32)
                blocks++;

            if (blocks > MAX_PACKET_SIZE/32)
                blocks = Math.floor(MAX_PACKET_SIZE/32)

            let send_bytes = new Uint8Array(blocks*32)
            let bytes = this.output_buffer.peek(blocks*30)

            for (let i=0; i<blocks; i++) {
                let blk = bytes.subarray(i*30, (i+1)*30)

                if (blk.length < 30) {
                    let tmp = new Uint8Array(30);
                    tmp.set(blk, 0)
                    blk = tmp
                }

                send_bytes.set(HammingCodes.encode(blk), i*32)
            }
            
            let packet_bytes =  new Uint8Array(send_bytes.length+7)
            packet_bytes[0] = "[".charCodeAt(0)
            packet_bytes[1] = "p".charCodeAt(0)
            packet_bytes.set(ByteUtils.shortToBytes(send_bytes.length/32), 2)  
            packet_bytes.set(ByteUtils.shortToBytes(this.outgoing_block), 4)  // Outgoing block numnber, short overlaps every 65536 blocks, This needs to be fixed later
            packet_bytes.set(send_bytes, 6)
            packet_bytes[packet_bytes.length-1] = "]".charCodeAt(0)

            this.events.sendPCM(this.encoder.modulate(packet_bytes))

            return true
        } 
        return false
    }

    processPCM(pcm:Float32Array) {
        let bytes = this.decoder.decode(pcm);

        if (bytes.length>0) {
            this.appendBytes(bytes)
        }
    }

    appendBytes(bytes:Uint8Array) {
        this.expected_receive = 0;
        this.input_buffer.append(bytes);
        this.process();
    }

    private process() {
        while (this.input_buffer.length() >= 4) {
            if (String.fromCharCode(this.input_buffer.getByte(0))[0] == '[') {
                // Packet is in sync

                if (typeof this.input_buffer.getByte(1) === 'undefined') {
                    console.log('packet type is undefined')
                    this.input_buffer.dumpBuffers()
                    this.events.onError("desync_buffer")
                    return;
                }

                let type = String.fromCharCode(this.input_buffer.getByte(1))
                let packet

                console.log(this.state+' '+type)

                if (type == 'p') {

                    let len = (this.input_buffer.getByte(2)<<8)&0xFF
                    len |= this.input_buffer.getByte(3)&0xFF
                    len *= 32 // Convert from block coutn to byte length

                    if (this.input_buffer.length() >= len+7)
                        packet = this.input_buffer.get(len+7)
                    else
                        return

                } else {

                    if (type == 'a' && this.input_buffer.length() >= 6)
                        packet = this.input_buffer.get(6)
                    else if (this.input_buffer.length() >= 4)
                        packet = this.input_buffer.get(4)
                    else   
                        return
                }

                if (String.fromCharCode(packet[packet.length-1]) != ']') {
                    console.log("Data streem corruption, reseting state");
                    this.state = 'idle';
                    this.input_buffer.clear()
                    this.sendStatusPacket('e', this.output_buffer.length()/30 > 255 ? 255 : Math.floor(this.output_buffer.length()/30), null, false)
                    this.events.onError("corruption")
                    this.events.onEvent({ type: "state", params: { value: this.state } })
                    return
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
                    this.events.onError("buffer_desync")
                }

            }
        }
    }

    private processPacket(packet:Uint8Array) {
        this.last_packet = Date.now()

        if (packet[0] == "[".charCodeAt(0) && packet[packet.length-1] == "]".charCodeAt(0)) {
            if (packet[1] == "e".charCodeAt(0)) {
                this.state = 'idle'
                this.events.onEvent({ type: "state", params: { value: this.state } })

                let blocks = Math.floor(this.output_buffer.length()/30)
                if (blocks > packet[2]) {
                    this.transmitDataQueue()
                } else {
                    this.sendStatusPacket('r', 0, null, true);
                }
            } else if (this.state == 'master') {
                if (packet[1] == 's'.charCodeAt(0)) {

                    // Peer accepted slave status
                    // set master status and send pending packets
                    this.sendPacket();

                } else if (packet[1] == 'a'.charCodeAt(0)) {

                    let start_block = ByteUtils.bytesToShort(packet.subarray(3, 5))
                    console.log('accepting', packet, start_block)

                    let accepted_blocks = packet[2]
                    
                    if (accepted_blocks>0) {
                        console.log("start block: "+start_block+" -> "+(start_block+accepted_blocks)+' accepted')

                        let blk_count = (start_block+accepted_blocks) - this.outgoing_block

                        this.outgoing_block += blk_count
                        this.outgoing_block %= 0xFFFF

                        this.output_buffer.drop(30*accepted_blocks) // drop 30 bytes per accepted block
                        
                        this.events.onEvent({
                            type: "output_buffer",
                            params: {
                                length: this.output_buffer.length()
                            }
                        })

                    }

                    if (this.output_buffer.length() > 0)
                        this.sendPacket()
                    else 
                        this.sendStatusPacket('t', 0, null, true)

                } else if (packet[1] == "f".charCodeAt(0)) {
                    // slave acknowledged being freed
                    this.state = 'idle'
                    this.events.onEvent({ type: "state", params: { value: this.state } })
                }
            } else if (this.state == 'slave') {
                if (packet[1] == "p".charCodeAt(0)) {

                    // Receive packet, replay with packet hash [h]
                    let first_block = ByteUtils.bytesToShort(packet.subarray(4, 6))
                    let packet_bytes = packet.subarray(6, packet.length-1)
                    let blocks = 0

                    // If next block act as usual, TODO: if past block accept with noop
                    if ((this.incoming_block+1) >= first_block) {
                        while (packet_bytes.length>0) {
                            if (((this.incoming_block+1) & 0xFFFF) == (first_block+blocks & 0xFFFF)) {
                                let block:Uint8Array|null = packet_bytes.slice(0, 32)
                                packet_bytes = packet_bytes.slice(32)

                                if (this.incoming_block >= (first_block+blocks)) {
                                    blocks++
                                    continue
                                }

                                let unpacked = HammingCodes.decode(block)
                                if (unpacked == null) {
                                    console.log('block corrupted ', HammingCodes.unpack(block))
                                    this.sendStatusPacket('a', blocks, packet.subarray(4, 6), true)
                                    return
                                }

                                if (unpacked.length>0)
                                    this.events.onReceive(unpacked)
                                    
                                this.incoming_block++
                            }

                            blocks++  
                        }
                        this.incoming_block %= 0xFFFF
                    } 
                    
                    // Build packet hash confirmation packet
                    this.sendStatusPacket('a', blocks, packet.subarray(4, 6), true)

                } else if (packet[1] == "t".charCodeAt(0)) {
                    // Master/slave status terminated
                    this.state = 'idle'
                    this.events.onEvent({ type: "state", params: { value: this.state } })
                    this.sendStatusPacket('f', 0, null, false)

                } else if (packet[1] == "m".charCodeAt(0)) {
                    this.sendStatusPacket('s', 0, null, true)
                }
            } else {
                if (packet[1] == "m".charCodeAt(0)) {
                    // Peer is asking for master status
                    // set slave status reply with slave [s]
                    this.state = 'slave'
                    this.events.onEvent({ type: "state", params: { value: this.state } })
                    this.sendStatusPacket('s', 0, null, true)

                } else if (packet[1] == "r".charCodeAt(0)) {

                    if (this.output_buffer.length() > 0) {
                        this.transmitDataQueue()
                    }

                } else if (packet[1] != "f".charCodeAt(0) && packet[1] != "t".charCodeAt(0)) {

                    console.log('idle, unrecognised command '+String.fromCharCode(packet[1]))
                    this.sendStatusPacket('e', this.output_buffer.length()/30 > 255 ? 255 : Math.floor(this.output_buffer.length()/30), null, false) 

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
            this.events.onEvent({ type: "state", params: { value: this.state } })

            this.last_packet = Date.now()
            
            this.sendStatusPacket('m', 0, null, true)
        }
    }

    transmitReset() {
        this.state = 'idle'
        this.events.onEvent({ type: "state", params: { value: this.state } })
        this.sendStatusPacket('e', this.output_buffer.length()/30 > 255 ? 255 : Math.floor(this.output_buffer.length()/30), null, false)
    }

    transmissionFinished() {
        this.state = 'idle'
        this.events.onEvent({ type: "state", params: { value: this.state } })
        this.sendStatusPacket('t', 0, null, false)
    }

    stop() {
        clearInterval(this.monitor)
        this.output_buffer.clear()
        this.input_buffer.clear()
    }

}