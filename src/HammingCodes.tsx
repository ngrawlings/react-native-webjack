
import { BitStore } from './BitStore'

export class HammingCodes {

    static getByteParity(byte:number, bit_start:number, bit_count:number, bit_step:number) {
        let s = 0
        byte <<= bit_start

        for (let i=bit_start; i<bit_start+bit_count; i+=bit_step) {
            s = (s^(byte&0x80))&0x80
            byte <<= bit_step
        }

        return s>>7
    }

    static encode(payload:Uint8Array) {
        if (payload.length != 30)
            throw "payload should be exactly 30 bytes long"

        let bitstore:BitStore = new BitStore()

        bitstore.appendBytes(payload)
        bitstore.appendBytes(new Uint8Array(32-payload.length))

        // Shift data to make room for parity bits
        bitstore.shiftBitsRight(0)
        for (let i=1; i<=128; i<<=1)
            bitstore.shiftBitsRight(i)

        // All parity bits are current set to zero
        let c0=0, c1=0
        let rows:number[] = []

        let bq = bitstore.getBytes()

        for (let i=0; i<32; i+=2) {
            let b0 = bq.getByte(i)
            let b1 = bq.getByte(i+1)

            rows.push(this.getByteParity(b0^b1, 0, 8 ,1))

            c0 = (c0^b0)&(c0|b0)
            c1 = (c1^b1)&(c1|b1)
        }

        let parity = new Uint8Array(9)

        // Check 8 collumn, check all bits of c1
        parity[1] = this.getByteParity(c0, 1, 8, 2) ^ this.getByteParity(c1, 1, 8, 2)
        parity[2] = this.getByteParity(c0, 2, 2, 1) ^ this.getByteParity(c0, 6, 2, 1) ^ this.getByteParity(c1, 2, 2, 1) ^ this.getByteParity(c1, 6, 2, 1)
        parity[3] = this.getByteParity(c0, 4, 4, 1) ^ this.getByteParity(c1, 4, 4, 1)
        parity[4] = this.getByteParity(c1, 0, 8, 1)
        parity[5] = (rows[1]^rows[3]^rows[5]^rows[7]^rows[9]^rows[11]^rows[13]^rows[15])&0xFF
        parity[6] = (rows[2]^rows[3]^rows[6]^rows[7]^rows[10]^rows[11]^rows[14]^rows[15])&0xFF
        parity[7] = (rows[4]^rows[5]^rows[6]^rows[7]^rows[12]^rows[13]^rows[14]^rows[15])&0xFF
        parity[8] = (rows[8]^rows[9]^rows[10]^rows[11]^rows[12]^rows[13]^rows[14]^rows[15])&0xFF

        for (let i=1, x=1; i<9; i++, x*=2) {
            parity[0] = (parity[0]^parity[i])&(parity[0]|parity[i])
            if (parity[i]>0) {
                bitstore.setBit(x, true)
            }
        }
        if (parity[0])
            bitstore.setBit(0, true)
    
        return bitstore.getBytes().get(32)
    }

    static check(payload:Uint8Array|BitStore) {
        let len = (payload instanceof BitStore ? payload.length() : payload.length)
        if (len != 32)
            throw "payload should be exactly 32 bytes long"

        let bitstore:BitStore
        if (payload instanceof Uint8Array) {
            bitstore = new BitStore()
            bitstore.appendBytes(payload)
        } else {
            bitstore = payload
        }

        let c0=0, c1=0
        let rows:number[] = []

        let bq = bitstore.getBytes()

        for (let i=0; i<32; i+=2) {
            let b0 = bq.getByte(i)
            let b1 = bq.getByte(i+1)

            rows.push(this.getByteParity(b0^b1, 0, 8 ,1))

            c0 = (c0^b0)&(c0|b0)
            c1 = (c1^b1)&(c1|b1)
        }

        let parity = new Uint8Array(9)

        // Check 8 collumn, check all bits of c1
        parity[0] = (bitstore.getBit(0)?1:0)^(bitstore.getBit(1)?1:0)^(bitstore.getBit(2)?1:0)^(bitstore.getBit(4)?1:0)^(bitstore.getBit(8)?1:0)^(bitstore.getBit(16)?1:0)^(bitstore.getBit(32)?1:0)^(bitstore.getBit(64)?1:0)^(bitstore.getBit(128)?1:0)
        parity[1] = this.getByteParity(c0, 1, 8, 2) ^ this.getByteParity(c1, 1, 8, 2)
        parity[2] = this.getByteParity(c0, 2, 2, 1) ^ this.getByteParity(c0, 6, 2, 1) ^ this.getByteParity(c1, 2, 2, 1) ^ this.getByteParity(c1, 6, 2, 1)
        parity[3] = this.getByteParity(c0, 4, 4, 1) ^ this.getByteParity(c1, 4, 4, 1)
        parity[4] = this.getByteParity(c1, 0, 8, 1)
        parity[5] = (rows[1]^rows[3]^rows[5]^rows[7]^rows[9]^rows[11]^rows[13]^rows[15])&0xFF
        parity[6] = (rows[2]^rows[3]^rows[6]^rows[7]^rows[10]^rows[11]^rows[14]^rows[15])&0xFF
        parity[7] = (rows[4]^rows[5]^rows[6]^rows[7]^rows[12]^rows[13]^rows[14]^rows[15])&0xFF
        parity[8] = (rows[8]^rows[9]^rows[10]^rows[11]^rows[12]^rows[13]^rows[14]^rows[15])&0xFF
            
        let error = false
        let bit = 0
        for (let i=1, x=1; i<9; i++, x*=2) {
            if (parity[i]>0) {
                error = true
                bit |= x
            }
        }

        if (!error && parity[0]!=0)
            return 0;

        return error ? bit : -1
    }

    static decode(payload:Uint8Array) {
        let bitstore:BitStore = new BitStore()
        bitstore.appendBytes(payload)

        let error_bit = HammingCodes.check(bitstore)

        if (error_bit > 0) {
            console.log('error found in packet '+error_bit)
            bitstore.setBit(error_bit, !bitstore.getBit(error_bit))

            //Check again to make sure it has been corrected and it is not a multi bit corruption
            error_bit = HammingCodes.check(bitstore)
            if (error_bit != -1) {
                console.log('packet still contains errors')
                return null
            }

        } else if (error_bit == 0) {
            return null; // Bit Zero does not check out, causing a lot of false errors at this time
        }

        let ret = new Uint8Array(30)
        let bits = []
        let byte_index = 0;

        for (let i=0; i<256; i++) {
            if (i==0 || i==1 || i==2 || i==4 || i==8 || i==16 || i==32 || i==64 || i==128)
                continue;

            bits.push(i)

            if (bits.length == 8) {
                ret[byte_index++] = bitstore.extractByte(bits)
                bits = []
            }
        }

        return ret
    }

    static unpack(payload:Uint8Array) {
        let bitstore:BitStore = new BitStore()
        bitstore.appendBytes(payload)

        let ret = new Uint8Array(30)
        let bits = []
        let byte_index = 0;

        for (let i=0; i<256; i++) {
            if (i==0 || i==1 || i==2 || i==4 || i==8 || i==16 || i==32 || i==64 || i==128)
                continue;

            bits.push(i)

            if (bits.length == 8) {
                ret[byte_index++] = bitstore.extractByte(bits)
                bits = []
            }
        }

        return ret
    }

}
