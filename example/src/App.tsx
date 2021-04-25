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
        let pcm = Webjack.encode(b);

        //console.log(pcm);

        let pcm_bytes = Buffer.alloc(pcm.length*2);
        let val = Buffer.alloc(2);
        for (let i=0; i<pcm.length; i++) {
          val.writeInt16BE(pcm[i]*32767);
          pcm_bytes[i*2] = val[0];
          pcm_bytes[(i*2)+1] = val[1];
        }

        //console.log(pcm_bytes.toString('hex'));

        RawPcm.playback(pcm_bytes.toString('base64'));


    //let dec = Webjack.decode(pcm);
    //console.log(dec);
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

          let dec = Webjack.decode(flt);

          if (dec.length>0)
            setMessage(dec.toString());

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
