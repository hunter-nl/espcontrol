export interface DeviceConfig {
  slots: number;
  cols: number;
  rows: number;
  screenSize: string;
  [key: string]: unknown;
}

declare const __ESPCONTROL_DEVICE_ID__: string;
declare const __ESPCONTROL_DEVICE_CONFIG__: DeviceConfig;

export const deviceId = __ESPCONTROL_DEVICE_ID__;
export const deviceConfig = __ESPCONTROL_DEVICE_CONFIG__;
