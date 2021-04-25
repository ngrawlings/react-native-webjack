export type DecoderConfig = {
    sampleRate:number,
    baud:number,
    freqLow:number,
    freqHigh:number,
    softmodem:boolean
};

type STATE = {
    current  : number,
    PREAMBLE : number,
    START    : number,
    DATA     : number,
    STOP     : number,

    bitCounter : number,  // counts up to 8 bits
    byteBuffer : number,  // where the 8 bits get assembled
    wordBuffer : number[], // concat received chars

    lastTransition : number,
    lastBitState : number,
    t : number, // sample counter, no reset currently -> will overflow
    c : number
}

export class Decoder {

    csvContent:string = '';

    sampleRate:number = 44100;

    baud:number = 0;
    freqLow:number = 0;
    freqHigh:number = 0;
    
    samplesPerBit:number = 0;
    preambleLength:number = 0;

    cLowReal:Float32Array = new Float32Array(0)
    cLowImag:Float32Array = new Float32Array(0)
    cHighReal:Float32Array = new Float32Array(0)
    cHighImag:Float32Array = new Float32Array(0)

    sinusLow:Float32Array = new Float32Array(0)
    sinusHigh:Float32Array = new Float32Array(0)
    cosinusLow:Float32Array = new Float32Array(0)
    cosinusHigh:Float32Array = new Float32Array(0)


    state:STATE = {
      current  : 0,
      PREAMBLE : 1,
      START    : 2,
      DATA     : 3,
      STOP     : 4,

      bitCounter : 0,  // counts up to 8 bits
      byteBuffer : 0,  // where the 8 bits get assembled
      wordBuffer : [], // concat received chars

      lastTransition : 0,
      lastBitState : 0,
      t : 0, // sample counter, no reset currently -> will overflow
      c : 0  // counter for the circular correlation arrays
    }

    constructor(config:DecoderConfig) {
        this.setProfile(config)
    }

    setProfile(config:DecoderConfig) {
        this.baud = config.baud;
        this.freqLow = config.freqLow;
        this.freqHigh = config.freqHigh;
  
        this.samplesPerBit = Math.ceil(this.sampleRate/this.baud);
        this.preambleLength = Math.ceil(this.sampleRate*40/1000/this.samplesPerBit);
  
  
        this.cLowReal = new Float32Array(this.samplesPerBit/2);
        this.cLowImag = new Float32Array(this.samplesPerBit/2);
        this.cHighReal = new Float32Array(this.samplesPerBit/2);
        this.cHighImag = new Float32Array(this.samplesPerBit/2);
  
        this.sinusLow = new Float32Array(this.samplesPerBit/2);
        this.sinusHigh = new Float32Array(this.samplesPerBit/2);
        this.cosinusLow = new Float32Array(this.samplesPerBit/2);
        this.cosinusHigh = new Float32Array(this.samplesPerBit/2);
  
        (function initCorrelationArrays(decoder:Decoder){
          var phaseIncLow = 2*Math.PI * (decoder.freqLow/decoder.sampleRate);
          var phaseIncHigh = 2*Math.PI * (decoder.freqHigh/decoder.sampleRate);
          for(var i = 0; i < decoder.samplesPerBit/2; i++){
            decoder.sinusLow[i] = Math.sin(phaseIncLow * i);
            decoder.sinusHigh[i] = Math.sin(phaseIncHigh * i);
            decoder.cosinusLow[i] = Math.cos(phaseIncLow * i);
            decoder.cosinusHigh[i] = Math.cos(phaseIncHigh * i);
          }
        })(this);
      }

      reset() {
        this.state = {
            current  : 0,
            PREAMBLE : 1,
            START    : 2,
            DATA     : 3,
            STOP     : 4,
      
            bitCounter : 0,  // counts up to 8 bits
            byteBuffer : 0,  // where the 8 bits get assembled
            wordBuffer : [], // concat received chars
      
            lastTransition : 0,
            lastBitState : 0,
            t : 0, // sample counter, no reset currently -> will overflow
            c : 0  // counter for the circular correlation arrays
          }
      }

      normalize(samples:Float32Array){
        let max = 0;
        for (let i=0; i<samples.length; i++) {
            if (samples[i]>max)
                max = samples[i];
        }

        for (var i = 0; i < samples.length; i++){
          samples[i] /= max;
        }
      }
  
      sum(array:Float32Array){
        var s = 0;
        for(var i = 0; i < array.length; i++){
          s += array[i];
        }
        return s;
      }
  
      smoothing(samples:Float32Array, n:number){
        for(var i = n; i < samples.length - n; i++){
          for(var o = -n; o <= n; o++){
            samples[i] += samples[i+o];
          }
          samples[i] /= (n*2)+1;
        }
      }
  
      demod(smpls:Float32Array){
        var samples = smpls;
        var symbols = [];
        var cLow, cHigh;
  
        this.normalize(samples);
  
        // correlation
        var s = this.state.c;
        for(var i = 0; i < samples.length; i++){
          this.cLowReal[s] = samples[i] * this.cosinusLow[s];
          this.cLowImag[s] = samples[i] * this.sinusLow[s];
          this.cHighReal[s] = samples[i] * this.cosinusHigh[s];
          this.cHighImag[s] = samples[i] * this.sinusHigh[s];
  
          cLow = Math.sqrt( Math.pow( this.sum(this.cLowReal), 2) + Math.pow( this.sum(this.cLowImag), 2) );
          cHigh = Math.sqrt( Math.pow( this.sum(this.cHighReal), 2) + Math.pow( this.sum(this.cHighImag), 2) );
          samples[i] = cHigh - cLow;
  
          s++;
          if (s == this.samplesPerBit/2)
            s = 0;
        }
        this.state.c = s;
  
        this.smoothing(samples, 1);
  
        // discriminate bitlengths
        for(var i = 1; i < samples.length; i++){
          
          if ((samples[i] * samples[i-1] < 0) || (samples[i-1] == 0)){
            var bits = Math.round((this.state.t - this.state.lastTransition)/ this.samplesPerBit);
            this.state.lastTransition = this.state.t;
            symbols.push(bits);
          }
          this.state.t++;
        }
        this.state.t++;
        return symbols;
      }
  
      addBitNTimes(bit:boolean, n:number) {
        if (this.state.bitCounter + n > 8)
          throw 'byteBuffer too small';
        for (var b = 0; b < n; b++){
          this.state.bitCounter++;
          this.state.byteBuffer >>>= 1;
          if (bit)
            this.state.byteBuffer |= 128;
          if (this.state.bitCounter == 8) {
            this.state.wordBuffer.push(this.state.byteBuffer);
            this.state.byteBuffer = 0;
          }
        }
      }

      decode(samples:Float32Array){
        // start of time measurement
        // var a = performance.now();

        let sequences:any[] = [];
        var bitlengths = this.demod(samples);
  
        var nextState = this.state.PREAMBLE;
  
        for(var i = 0; i < bitlengths.length ; i++) {
          var symbols = bitlengths[i];
          
          switch (this.state.current){
  
            case this.state.PREAMBLE:
              if (symbols >= 12 && symbols <= this.preambleLength + 20){
              // if (symbols >= preambleLength -3  && symbols <= preambleLength + 20) {
                nextState = this.state.START;
                this.state.lastBitState = 0;
                this.state.byteBuffer = 0;
                this.state.wordBuffer = [];
              }
              break;
  
            case this.state.START:
              //console.log('demod -> START');
              this.state.bitCounter = 0;
              if (symbols == 1)
                nextState = this.state.DATA;
              else if (symbols > 1 && symbols <= 9){
                nextState = symbols == 9 ? this.state.STOP : this.state.DATA;
                this.addBitNTimes(false, symbols - 1);
              } 
              else 
                nextState = this.state.PREAMBLE;
              break;
  
            case this.state.DATA:
              //console.log('DATA');
              var bits_total = symbols + this.state.bitCounter;
              var bit = this.state.lastBitState ^ 1;
  
              if (bits_total > 11) {
                nextState = this.state.PREAMBLE;
              } else if (bits_total == 11){ // all bits high, stop bit, push bit, preamble
                this.addBitNTimes(true, symbols - 3);
                nextState = this.state.START;
                //console.log('>emit< ' + this.state.wordBuffer[0].toString(2));
                sequences.push(this.state.wordBuffer);
                this.state.wordBuffer = [];
              } else if (bits_total == 10) { // all bits high, stop bit, push bit, no new preamble
                this.addBitNTimes(true, symbols - 2);
                nextState = this.state.PREAMBLE;
                //console.log('|emit| ' + this.state.wordBuffer[0].toString(2));
                sequences.push(this.state.wordBuffer);
                this.state.wordBuffer = [];
              } else if (bits_total == 9) { // all bits high, stop bit, no push bit
                this.addBitNTimes(true, symbols - 1);
                nextState = this.state.START;
              } else if (bits_total == 8) {
                this.addBitNTimes(bit==1, symbols);
                nextState = this.state.STOP;
                this.state.lastBitState = bit;
              } else {
                this.addBitNTimes(bit==1, symbols);
                nextState = this.state.DATA;
                this.state.lastBitState = bit;
              }
  
              if (symbols == 0){ // 0 always indicates a misinterpreted symbol
                nextState = this.state.PREAMBLE;
                console.log('#demod error#');
              }
              break;
  
            case this.state.STOP:
              //console.log(' STOP');
              if (symbols == 1) {
                nextState = this.state.START;
              } else if (symbols == 3) {
                nextState = this.state.START;
                //console.log('>>emit<< ' + this.state.wordBuffer[0].toString(2));
                sequences.push(this.state.wordBuffer);
                this.state.wordBuffer = [];
              } else if (symbols >= 2) {  
                nextState = this.state.PREAMBLE;
                //console.log('||emit|| ' + this.state.wordBuffer[0].toString(2));
                sequences.push(this.state.wordBuffer);
                this.state.wordBuffer = [];
              } else
                nextState = this.state.PREAMBLE;
  
              break;
  
            default:
              nextState = this.state.PREAMBLE;
              this.state.bitCounter = 0;
              this.state.byteBuffer = 0;
          }
          this.state.current = nextState;

          
        }

        let total_len = 0;
        for (let i=0; i<sequences.length; i++) {
            total_len += sequences[i].length;
        }

        let ret = Buffer.alloc(total_len+this.state.wordBuffer.length);

        let buffer_offset = 0;
        for (let i=0; i<sequences.length; i++) {
            for (let x=0; x<sequences[i].length; x++) {
                ret[buffer_offset+x] = sequences[i][x];
            }
            buffer_offset += sequences[i].length;
        }

        for (let x=0; x<this.state.wordBuffer.length; x++) {
            ret[buffer_offset+x] = this.state.wordBuffer[x];
        }

        return ret;
      }

}