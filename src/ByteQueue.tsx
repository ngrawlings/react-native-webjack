export class ByteQueue {

    buffers:Uint8Array[] = []
    first_buffer_position:number = 0

    length() {
        let count = 0
        for (let i=0; i<this.buffers.length; i++) {
            count += this.buffers[i].length;
        }
        return count-this.first_buffer_position
    }

    append(buf:Uint8Array) {
        this.buffers.push(buf)
    }

    get(count:number) {
        let ret:Uint8Array = this.peek(count)
        this.drop(ret.length)

        return ret
    }

    peek(count:number) {
        if (this.buffers.length == 0)
            return new Uint8Array(0)

        let available = this.length()
        if (available<count)
            count = available

        let ret:Uint8Array = new Uint8Array(count)
        let buffer_index = 1
        let ret_pos = this.buffers[0].length - this.first_buffer_position

        if (count < ret_pos) {
            ret.set(this.buffers[0].subarray(this.first_buffer_position, this.first_buffer_position+count), 0)
            return ret
        } else {
            ret.set(this.buffers[0].subarray(this.first_buffer_position, this.buffers[0].length), 0)
        }

        while (ret_pos < count) {
            if (count-ret_pos < this.buffers[buffer_index].length) {
                ret.set(this.buffers[buffer_index].subarray(0, count-ret_pos), ret_pos)
                this.first_buffer_position = count-ret_pos;
                ret_pos += count-ret_pos
                buffer_index++
            } else {
                ret.set(this.buffers[buffer_index], ret_pos);
                ret_pos += this.buffers[buffer_index].length;
                buffer_index++
            }
        }

        return ret
    }

    drop(count:number) {
        if (this.length() < count)
            count = this.length()

        this.first_buffer_position += count;

        while (this.buffers.length>0 && this.first_buffer_position >= this.buffers[0].length) {
            this.first_buffer_position -= this.buffers[0].length
            this.buffers.splice(0, 1)
        }

        if (this.first_buffer_position < 0)
            throw "Bytes were lost in buffer drop, this is a serious bug"
    }

    clear() {
        this.buffers = []
        this.first_buffer_position = 0
    }

    getByte(index:number) {
        let buffer_index = 0
        index += this.first_buffer_position

        while (this.buffers.length > buffer_index && index >= 0) {
            if (index < this.buffers[buffer_index].length)
                return this.buffers[buffer_index][index]

            index -= this.buffers[buffer_index].length
            buffer_index++
        }

        return 0
    }

    setByte(index:number, b:number) {
        let buffer_index = 0
        index += this.first_buffer_position

        while (this.buffers.length > buffer_index && index >= 0) {
            if (index < this.buffers[buffer_index].length) {
                this.buffers[buffer_index][index] = b
                return
            }

            index -= this.buffers[buffer_index].length
            buffer_index++
        }
    }

    findCharacter(byte:number) {
        let pos = 0;

        for (let i=0; i<this.buffers.length; i++) {
            let start = 0;
            if (i==0)
                start = this.first_buffer_position

            for (let x=start; x<this.buffers[i].length; x++) {
                if (this.buffers[i][x] == byte) 
                    return pos+x
            }

            if (i==0) {
                pos += this.buffers[0].length - this.first_buffer_position
            } else {
                pos += this.buffers[i].length
            }
        }

        return -1
    }

    dumpBuffers() {
        for (let i=0; i<this.buffers.length; i++) {
            console.log(this.buffers[i])
        }
    }

}
