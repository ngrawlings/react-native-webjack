//import { NativeModules } from 'react-native';

import { Encoder, EncoderConfig } from './Encoder'
import { Decoder, DecoderConfig } from './Decoder'
import { TwoWayAudioSocket, Events } from './TwoWayAudioSocket'

let encoder_config:EncoderConfig = {
  sampleRate: 44100,
  baud: 1225,
  freqLow:4900,
  freqHigh:7350,
  softmodem:true
};

let decoder_cofig:DecoderConfig = {
  sampleRate: 44100,
  baud: 1225,
  freqLow:4900,
  freqHigh:7350,
  softmodem:true
}

let encoder:Encoder = new Encoder(encoder_config);
let decoder:Decoder = new Decoder(decoder_cofig);
let two_way_audio_socket:TwoWayAudioSocket|null = null;

let Webjack = {
  init: (events:Events) => { two_way_audio_socket = new TwoWayAudioSocket(events)},
  encode: (data:Uint8Array) => { return encoder.modulate(data); },
  decode: (data:Float32Array) => { return decoder.decode(data); },
  send:(data:Uint8Array) => { if (two_way_audio_socket != null) { two_way_audio_socket.appendToDataQueue(data); two_way_audio_socket.transmitDataQueue() } }
};

export default Webjack;
