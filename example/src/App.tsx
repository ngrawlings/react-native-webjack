import * as React from 'react';

import { StyleSheet, PermissionsAndroid, View, Text, Button, TextInput } from 'react-native';

import RawPcm from 'react-native-raw-pcm';
import Webjack from 'react-native-webjack';

import '../shim'

export default function App() {
  let [message, setMessage] = React.useState("");
  const [text, onChangeText] = React.useState("");

  const send = () => {
    let b = Buffer.from(text);
    Webjack.send(b)
  }

  React.useEffect(() => {
    (async () => {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.RECORD_AUDIO,
        {
          title: "Audio Transfer",
          message: "Allow access to the microphone",
          buttonNeutral: "Ask Me Later",
          buttonNegative: "Cancel",
          buttonPositive: "OK"
        }
      );
      if (granted === PermissionsAndroid.RESULTS.GRANTED) {
        Webjack.init({

          sendPCM(pcm:Float32Array) {
            console.log('sendPCM')

            let pcm_bytes = Buffer.alloc(pcm.length*2);
            let val = Buffer.alloc(2);
            for (let i=0; i<pcm.length; i++) {
              val.writeInt16BE(pcm[i]*32767);
              pcm_bytes[i*2] = val[0];
              pcm_bytes[(i*2)+1] = val[1];
            }

            RawPcm.playback(pcm_bytes.toString('base64'));

            return pcm.length
          },

          onReceive(bytes:Uint8Array) {
            let msg = ''
            for (let i=0; i<bytes.length; i++)
              msg += String.fromCharCode(bytes[i])

            console.log(msg)
            setMessage(msg)
          }

        })

        RawPcm.on('data', (data:string) => {
          let buffer = Buffer.from(data, "base64");
          let arr = new Int16Array(buffer.length/2)
          let flt = new Float32Array(arr.length);
          
          for (let i=0; i<arr.length; i++) {
            arr[i] = buffer[i*2]<<8 | buffer[(i*2)+1];
          }

          for (let i=0; i<flt.length; i++) {
            flt[i] = arr[i];
            flt[i] /= (32767/8)
            if (flt[i] > 1) flt[i] = 1;
            else if (flt[i] < -1) flt[i] = -1;
          }
          //console.log(flt);

          // Feed the pcm data into the 2 way comm system
          Webjack.process(flt)

        });
        RawPcm.record();
      }
      
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Text>{message}</Text>
      <TextInput
        style={styles.input}
        onChangeText={onChangeText}
        value={text}
      />
      <Button onPress={send} title="Send"/>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  box: {
    width: 60,
    height: 60,
    marginVertical: 20,
  },
  input: {
    height: 40,
    margin: 12,
    borderWidth: 1,
  }
});
