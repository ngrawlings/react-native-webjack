import { ByteQueue } from './ByteQueue'

export class BitStore {

    bytes:ByteQueue = new ByteQueue()
    read_bit_offset = 0;
    write_bit_offset = -1;

    private generateHighMask(bits:number) {
        let mask= 0;
        for (let i=0; i<bits; i++) {
            mask >>= 1
            mask |= 0x80
        }
        return mask
    }

    private generateLowMask(bits:number) {
        let mask= 0;
        for (let i=0; i<bits; i++) {
            mask <<= 1
            mask |= 0x1
        }
        return mask
    }

    private shiftLeft(bytes:Uint8Array, shift:number) {
        bytes[0] <<= shift
        for (let i=1; i<bytes.length; i++) {
            bytes[i-1] |= bytes[i]>>(8-shift)
            bytes[i] <<= shift
        }
        return bytes
    }

    length() {
        return this.bytes.length()
    }

    clear() {
        this.bytes.clear()
        this.read_bit_offset = 0
        this.write_bit_offset = 0
    }

    appendBytes(bytes:Uint8Array) {
        this.bytes.append(bytes)
    }

    appendBit(bit:boolean) {
        this.write_bit_offset++
        this.write_bit_offset %= 8;

        if (this.write_bit_offset==0)
            this.bytes.append(new Uint8Array(1))
        
        let blen = this.bytes.length()
        let byte = this.bytes.getByte(blen-1);

        if (byte != null) {
            if (bit)
                byte |= 1<<(7-this.write_bit_offset)
            else
                byte &= byte^(1<<(7-this.write_bit_offset))

            this.bytes.setByte(blen-1, byte)
        }
    }

    getBits(count:number) {
        let byte_count = Math.floor(count/8)
        let bit_shift = count%8

        let get_count = byte_count
        if (this.read_bit_offset > 0 || bit_shift > 0)
            get_count++

        if (this.read_bit_offset + bit_shift > 8)
            get_count++

        let bytes = this.bytes.peek(get_count)
        bytes = this.shiftLeft(bytes, this.read_bit_offset)

        this.bytes.drop(byte_count+(this.read_bit_offset+bit_shift>=8?1:0));
        this.read_bit_offset = (this.read_bit_offset+bit_shift)%8

        bytes[byte_count] &= this.generateHighMask(bit_shift)

        return bytes.slice(0, byte_count+(bit_shift>0?1:0))
    }

    getBit(index:number) {
        index += this.read_bit_offset

        let byte_index = Math.floor(index/8)
        let bit_pos = index%8

        let byte = this.bytes.getByte(byte_index)

	return ((byte >> (7-bit_pos))&0x1) == 1
    }

    shiftBitsRight(index:number) {
        let byte_index = Math.floor(index / 8)
        let bit_index = index % 8

        let current_byte = this.bytes.getByte(byte_index)
        let high_bit = current_byte & 0x01
        let low_bit
        let length = this.bytes.length();

        current_byte = (current_byte & 0xFF^(0x01<<(7-bit_index)))
        this.bytes.setByte(byte_index, current_byte)

        for (let i=++byte_index; i<length; i++) {
            current_byte = this.bytes.getByte(i)
            low_bit = current_byte & 0x01
            current_byte = high_bit<<7 | current_byte>>1
	        this.bytes.setByte(i, current_byte)
            high_bit = low_bit
        }
    }

    extractByte(indexes:Uint8Array) {
        if (indexes.length != 8)
            throw "8 indexes required to create a byte"

        let ret = 0
        for (let i=0; i<8; i++) {
            if (this.getBit(indexes[i]))
                ret |= 0x01<<(7-i)
        }

        return ret
    }

}
