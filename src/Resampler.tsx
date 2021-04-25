
export type ResamplerConfig = {
    inRate:number,
    outRate:number,
    inputBuffer:Float32Array
};

export class Resampler {

    fromSampleRate:number;
    toSampleRate:number;
    inputBuffer:Float32Array;
    outputBuffer:Float32Array = new Float32Array(0);
    ratioWeight:number;
    lastWeight:number = 0;
    lastOutput:Float32Array = new Float32Array(0);
    tailExists:boolean = false;
    resampleFunction:Function;

    constructor(config:ResamplerConfig) {
        this.fromSampleRate = config.inRate
        this.toSampleRate = config.outRate
        this.inputBuffer = config.inputBuffer

        if (typeof this.inputBuffer != "object") {
            throw(new Error("inputBuffer is not an object."));
        }
          
        if (this.fromSampleRate > 0 && this.toSampleRate > 0) {
            if (this.fromSampleRate == this.toSampleRate) {
                this.resampleFunction = this.bypassResampler;        //Resampler just returns what was passed through.
                this.ratioWeight = 1;
                this.outputBuffer = this.inputBuffer;
            }
            else {
                this.initializeBuffers();
                this.ratioWeight = this.fromSampleRate / this.toSampleRate;
                if (this.fromSampleRate < this.toSampleRate) {
                    this.resampleFunction = this.linearInterpolationFunction;
                    this.lastWeight = 1;
                } else {
                    this.resampleFunction = this.compileMultiTapFunction;
                    this.tailExists = false;
                    this.lastWeight = 0;
                }
            }
        } else {
            throw(new Error("Invalid settings specified for the resampler."));
        }
    }

    linearInterpolationFunction(bufferLength:number) {
        var outputOffset = 0;
        if (bufferLength > 0) {
          var weight = this.lastWeight;
          var firstWeight = 0;
          var secondWeight = 0;
          var sourceOffset = 0;
          var outputOffset = 0;
  
          weight -= 1;
          for (bufferLength -= 1, sourceOffset = Math.floor(weight); sourceOffset < bufferLength;) {
            secondWeight = weight % 1;
            firstWeight = 1 - secondWeight; 
            this.outputBuffer[outputOffset++] = (this.inputBuffer[sourceOffset] * firstWeight)
             + (this.inputBuffer[sourceOffset + 1] * secondWeight); 
            weight += this.ratioWeight;
            sourceOffset = Math.floor(weight);
          } 
          this.lastOutput[0] = this.inputBuffer[sourceOffset++]; 
          this.lastWeight = weight % 1;
        }
        return outputOffset;
      }
  
      compileMultiTapFunction(bufferLength:number) {
        var outputOffset = 0;
        if (bufferLength > 0) {
          var weight = 0; 
          var output0 = 0; 
          var actualPosition = 0;
          var amountToNext = 0;
          var alreadyProcessedTail = !this.tailExists;
          this.tailExists = false;
          var currentPosition = 0;
          do {
            if (alreadyProcessedTail) {
              weight = this.ratioWeight;
              output0 = 0;
            }
            else {
              weight = this.lastWeight;
              output0 = this.lastOutput[0];
              alreadyProcessedTail = true;
            }
            while (weight > 0 && actualPosition < bufferLength) {
              amountToNext = 1 + actualPosition - currentPosition;
              if (weight >= amountToNext) {
                output0 += this.inputBuffer[actualPosition++] * amountToNext;
                currentPosition = actualPosition;
                weight -= amountToNext;
              }
              else {
                output0 += this.inputBuffer[actualPosition] * weight;
                currentPosition += weight;
                weight = 0;
                break;
              }
            }
            if (weight <= 0) {
              this.outputBuffer[outputOffset++] = output0 / this.ratioWeight;
            }
            else {
              this.lastWeight = weight;
              this.lastOutput[0] = output0;
              this.tailExists = true;
              break;
            }
          } while (actualPosition < bufferLength);
        }
        return outputOffset;
      }
  
      bypassResampler(upTo:number) {
        return upTo;
      }

      initializeBuffers() {
        const that = this;
        var outputBufferSize = Math.ceil(this.inputBuffer.length * this.toSampleRate / this.fromSampleRate / 1.000000476837158203125) + 1;
        try {
          this.outputBuffer = new Float32Array(outputBufferSize);
          this.lastOutput = new Float32Array(1);
        }
        catch (error) {
            that.outputBuffer = new Float32Array(0);
            that.lastOutput = new Float32Array(0);
        }
      }
  
      resample(bufferLength:number){
        return this.resampleFunction(bufferLength);
      }
  
      getOutputBuffer(){
        return this.outputBuffer;
      }

}