//import { NativeModules } from 'react-native';

import type { EncoderConfig } from './Config'

import { Encoder } from './Encoder'
import { Decoder } from './Decoder'
import { TwoWayAudioSocket, Events, EVENT } from './TwoWayAudioSocket'
import { HammingCodes } from './HammingCodes'

let encoder_config:EncoderConfig = {
  sampleRate: 44100,
  baud: 1225,
  freqLow:4900,
  freqHigh:7350,
  softmodem:true
};

let encoder:Encoder = new Encoder(encoder_config);
let decoder:Decoder = new Decoder(encoder_config);
let two_way_audio_socket:TwoWayAudioSocket|null = null;

let Webjack = {
  createSocket: (events:Events) => { return new TwoWayAudioSocket(events) },
  init: (events:Events) => { two_way_audio_socket = new TwoWayAudioSocket(events) },
  encode: (data:Uint8Array) => { return encoder.modulate(data); },
  decode: (data:Float32Array) => { return decoder.decode(data); },
  process: (data:Float32Array) => { if (two_way_audio_socket != null) { two_way_audio_socket.processPCM(data) } },
  send:(data:Uint8Array) => { if (two_way_audio_socket != null) { two_way_audio_socket.appendToDataQueue(data); two_way_audio_socket.transmitDataQueue() } },
  stop:() => { if (two_way_audio_socket != null) { two_way_audio_socket.stop(); two_way_audio_socket = null } },
  transmissionFinished:() => { if (two_way_audio_socket != null) { two_way_audio_socket.transmissionFinished() } }
};

export {
  Webjack,
  EncoderConfig,
  Encoder,
  Decoder,
  TwoWayAudioSocket,
  Events,
  EVENT,
  HammingCodes
}
