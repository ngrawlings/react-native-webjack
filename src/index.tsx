import { NativeModules } from 'react-native';

type WebjackType = {
  multiply(a: number, b: number): Promise<number>;
};

const { Webjack } = NativeModules;

export default Webjack as WebjackType;
