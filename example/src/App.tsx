import { encode } from 'punycode';
import * as React from 'react';

import { StyleSheet, PermissionsAndroid, View, Text, Button, TextInput } from 'react-native';

import RawPcm from 'react-native-raw-pcm';
import { Webjack, EVENT, HammingCodes } from 'react-native-webjack';

import '../shim'

export default function App() {
  let [message, setMessage] = React.useState("");
  const [text, onChangeText] = React.useState("");

  const lines:Array<string> = new Array<string>()

  const send = () => {
    appendMessage("-> "+text)
    let b = Buffer.from(text);
    Webjack.send(b)
  }

  const appendMessage = (msg:string) => {
    console.log('appendMessage: '+msg)
    lines.push(msg)
    setMessage(lines.join("\n"))
    while (lines.length>12) {
      lines.splice(0, 1)
    }
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
            let pcm_bytes = Buffer.alloc(pcm.length*2);
            let val = Buffer.alloc(2);
            for (let i=0; i<pcm.length; i++) {
              val.writeInt16BE(pcm[i]*32767);
              pcm_bytes[i*2] = val[0];
              pcm_bytes[(i*2)+1] = val[1];
            }

            appendMessage("Transmitting: "+pcm_bytes.length);

            RawPcm.playback(pcm_bytes.toString('base64'));

            return pcm.length
          },

          onReceive(bytes:Uint8Array) {
            let msg = ''
            for (let i=0; i<bytes.length; i++)
              msg += String.fromCharCode(bytes[i])

            console.log("onReceive: "+msg)
            appendMessage("<- "+msg)
          },

          onError(error:string) {
            console.log(error)
            appendMessage("Error: "+error)
          },

          onEvent(event:EVENT) {
            console.log(event)
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

      const randomBytes = (count:number) => {
        let ret = Buffer.alloc(count)
        for (let i=0; i<count; i++) {
          ret[i] = Math.random()*0xFF
        }
        return ret
      }
      // Test and fnd a Hamming code failure
      let code;
      while(true) {
        code = HammingCodes.encode(randomBytes(30)) 
        console.log(code)
        if (HammingCodes.check(Buffer.from(code)) != -1)
          break; 
      }

      console.log('Failed code:', code)
      let enc = new Uint8Array([53, 238, 255, 151, 161, 52, 211, 112, 120, 128, 52, 202, 98, 200, 89, 247, 95, 177, 66, 147, 34, 52, 137, 227, 73, 91, 220, 154, 22, 11, 177, 0])
      let check = HammingCodes.check(Buffer.from(enc))
      if (HammingCodes.check(Buffer.from(enc)) != -1)
        console.log("Code Failed: "+check)
      else 
        console.log("Check ok")

    })();  
  }, []);

  return (
    <View style={styles.container}>
      <View style={{flex:1, flexDirection:'column', width:'100%'}}>
      <Text>{message}</Text>
      </View>
      <View style={{flex:1, flexDirection:'column', width:'100%'}}>
      <TextInput
        style={styles.input}
        onChangeText={onChangeText}
        value={text}
      />
      </View>
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
    height: '100%',
    width: '100%',
    margin: 2,
    borderWidth: 1,
  }
});
