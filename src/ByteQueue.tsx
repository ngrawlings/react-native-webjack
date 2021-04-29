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
        let available = this.length()
        if (available<count)
            count = available

        let ret:Uint8Array = new Uint8Array(count)
        let ret_pos = this.buffers[0].length - this.first_buffer_position

        if (count < ret_pos) {
            ret.set(this.buffers[0].subarray(this.first_buffer_position, this.first_buffer_position+count), 0);
            this.first_buffer_position += count;

            return ret;
        } else {
            ret.set(this.buffers[0].subarray(this.first_buffer_position, this.buffers[0].length), 0);
            this.first_buffer_position = 0;
            this.buffers.shift();
        }

        while (ret_pos < count) {
            if (count-ret_pos < this.buffers[0].length) {
                ret.set(this.buffers[0].subarray(0, count-ret_pos), ret_pos);
                this.first_buffer_position = count-ret_pos;
                ret_pos += count-ret_pos;
            } else {
                ret.set(this.buffers[0], ret_pos);
                ret_pos += this.buffers[0].length;
                this.buffers.shift();
            }
        }

        return ret
    }

    clear() {
        this.buffers = []
        this.first_buffer_position = 0
    }

    getByte(index:number) {
        let buffer_index = 0
        index += this.first_buffer_position

        while (index > 0) {
            if (index <= this.buffers[buffer_index].length)
                break

            index -= this.buffers[buffer_index].length
            buffer_index++
        }
        return this.buffers[buffer_index][index]
    }

    findSequence(bytes:Uint8Array) {
        let pos = 0;

        for (let i=0; i<this.buffers.length; i++) {
            let start = 0;
            if (i==0)
                start = this.first_buffer_position

            for (let x=start; x<this.buffers[i].length-bytes.length; i++) {
                let found = true

                for (let z=0; z<bytes.length; z++) {
                    if (this.buffers[i][x+z] != bytes[z]) {
                        found = false
                        break;
                    }
                }

                if (found == true)
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

}