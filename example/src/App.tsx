import * as React from 'react';

import { StyleSheet, View } from 'react-native';

//import AudioTransfer from './components/AudioTransfer'
import InfiniteStream from './components/InfiniteStream'

import '../shim'

export default function App() {

  return (
    <View style={styles.container}>
      <InfiniteStream style={{flex:1, flexDirection:'column', width:'100%'}} />
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
