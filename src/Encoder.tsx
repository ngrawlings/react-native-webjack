import { Resampler } from './Resampler'

import type { EncoderConfig }  from './Config'

export class Encoder {

    encoder = this;

    sampleRate = 44100;
    targetSampleRate:number = 44100;
    
    baud:number = 0;
    freqLow:number = 0;
    freqHigh:number = 0;

    samplesPerBit:number = 0;
    preambleLength:number = 0;
    pushbitLength:number = 0;

    bitBufferLow:Float32Array = new Float32Array(this.samplesPerBit);
    bitBufferHigh:Float32Array = new Float32Array(this.samplesPerBit);

    softmodem:boolean = false;

    constructor(config:EncoderConfig) {
        this.setProfile(config);
    }

    setProfile(config:EncoderConfig) {
        this.baud = config.baud;
        this.freqLow = config.freqLow;
        this.freqHigh = config.freqHigh;
  
        this.samplesPerBit = Math.ceil(this.sampleRate/this.baud);
        this.preambleLength = Math.ceil(this.sampleRate*40/1000/this.samplesPerBit);
        this.pushbitLength =  config.softmodem ? 1 : 2;
  
        this.bitBufferLow = new Float32Array(this.samplesPerBit);
        this.bitBufferHigh = new Float32Array(this.samplesPerBit);
      
        this.softmodem = config.softmodem;
  
        (function generateBitBuffers(wj:Encoder){
          var phaseIncLow = 2 * Math.PI * wj.freqLow / wj.sampleRate;
          var phaseIncHigh = 2 * Math.PI * wj.freqHigh / wj.sampleRate;
          
          for (var i=0; i < wj.samplesPerBit; i++) {
            wj.bitBufferLow.set( [Math.cos(phaseIncLow*i)], i);
            wj.bitBufferHigh.set( [Math.cos(phaseIncHigh*i)], i);
          }
        })(this);
        console.log("new encoder profile: ",  config);
    }

    modulate(data:Uint8Array) {
        const that = this
        var bufferLength = (this.preambleLength + 10*(data.length) + this.pushbitLength)*this.samplesPerBit;
        var samples = new Float32Array(bufferLength);
  
        var i = 0;
        function pushBits(bit:boolean, n:number){
          for (var k = 0; k < n; k++){
            samples.set(bit ? that.bitBufferHigh : that.bitBufferLow, i);
            i += that.samplesPerBit;
          }
        }
  
        pushBits(true, this.preambleLength);
        for (var x = 0; x < data.length; x++) {
          var c = (data[x] << 1) | 0x200;
          for (var b = 0; b < 10; b++, c >>= 1)
            pushBits((c&1) == 1, 1);
        }
        pushBits(true, 1);
        if (!this.softmodem)
          pushBits(false, 1);
  
        //if (args.debug) console.log("gen. audio length: " +samples.length);
        var resampler = new Resampler({inRate: this.sampleRate, outRate: this.targetSampleRate, inputBuffer: samples});
        resampler.resample(samples.length);
        var resampled = resampler.getOutputBuffer();
        // console.log(samples);
        //if (args.debug) console.log("resampled audio length: " + resampled.length);
        // console.log(resampled);
  
        return resampled;
      }

};