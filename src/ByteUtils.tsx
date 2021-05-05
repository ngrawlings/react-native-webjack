export class ByteUtils {

    static bytesToShort(bytes:Uint8Array) {
        return (bytes[0]<<8 | bytes[1]&0xFF)
    }

    static shortToBytes(val:number) {
        let ret = new Uint8Array(2)
        ret[0] = (val>>8)&0xFF
        ret[1] = val&0xFF

        return ret
    }

    static bytesToInt(bytes:Uint8Array) {
        return (bytes[0]<<24 | bytes[1]<<16 | bytes[2]<<8 |bytes[3]&0xFF)
    }

    static intToBytes(val:number) {
        let ret = new Uint8Array(4)
        ret[0] = (val>>24)&0xFF
        ret[1] = (val>>16)&0xFF
        ret[2] = (val>>8)&0xFF
        ret[3] = val&0xFF

        return ret
    }

}