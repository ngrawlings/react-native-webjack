import * as React from 'react'
import { StyleSheet, PermissionsAndroid, View, Text, Button, TextInput } from 'react-native';

export default function InfiniteStream(props: any) {
    return (
        <View style={styles.container}>

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
  