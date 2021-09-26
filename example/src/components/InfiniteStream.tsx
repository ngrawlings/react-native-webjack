import * as React from 'react'
import { StyleSheet, PermissionsAndroid, View, Text, Button, TextInput } from 'react-native';

import * as Webjack from 'react-native-webjack'

let rx:Webjack.TwoWayAudioSocket|null = null
let tx:Webjack.TwoWayAudioSocket|null = null

export default function InfiniteStream(props: any) {

    React.useEffect(() => {
        (async () => {
            console.log("InfiniteStream")

            rx = Webjack.Webjack.createSocket({
                sendPCM(pcm:Float32Array) {
                    console.log()

                    let decoder_cofig:Webjack.EncoderConfig = {
                        sampleRate: 44100,
                        baud: 1225,
                        freqLow:4900,
                        freqHigh:7350,
                        softmodem:true
                      }
            
                    let decoder:Webjack.Decoder = new Webjack.Decoder(decoder_cofig);
                    let bytes = decoder.decode(pcm)

                    tx?.appendBytes(bytes)
                    return pcm.length
                },
        
                onReceive(bytes:Uint8Array) {
                    console.log(bytes)
                },
        
                onError(error:string) {
                    console.log(error)
                },
        
                onEvent(event:Webjack.EVENT) {
                    console.log(event)
                }
            })

            tx = Webjack.Webjack.createSocket({
                sendPCM(pcm:Float32Array) {
                    rx?.processPCM(pcm)
                    return pcm.length
                },
        
                onReceive(bytes:Uint8Array) {
                    //rx?.appendToDataQueue(bytes)
                    //rx?.transmitDataQueue()
                },

                onError(error:string) {
                    console.log(error)
                },

                onEvent(event:Webjack.EVENT) {
                    console.log(event)
                }
            })

            const loop = () => {
                console.log("Trasmintting")
                tx?.appendToDataQueue(Buffer.from("123456789012345678901234567890"))
                tx?.transmitDataQueue()
                setTimeout(loop, 100)
            }
            setTimeout(loop, 100)

        })()
    }, [])

    return (
        <View style={styles.container}>
            <Button onPress={() => {}} title="Send"/>
        </View>
    )
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
  