export type EncoderConfig = {
    sampleRate:number,
    baud:number,
    freqLow:number,
    freqHigh:number,
    softmodem:boolean
}

export default {
    sampleRate: 44100,
    baud: 1225,
    freqLow:4900,
    freqHigh:7350,
    softmodem:true
}
