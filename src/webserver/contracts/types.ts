export type SavedConfigField =
  | "entity"
  | "label"
  | "icon"
  | "icon_on"
  | "sensor"
  | "unit"
  | "type"
  | "precision"
  | "options";

export type CardConfig = Record<SavedConfigField, string>;

export interface CardOptionSpec {
  name: string;
  label: string;
  kind?: "choice" | "flag" | "text";
  values?: readonly string[];
  defaultValue?: string;
  defaultValueByMode?: Readonly<Record<string, string>>;
  storage?: readonly string[];
  hidden?: boolean;
  migration?: "drop";
  supportedWhen?: {
    precision?: readonly string[];
    precisionNot?: readonly string[];
    entityDomains?: readonly string[];
    never?: boolean;
  };
}

export interface CardTypeSpec {
  label: string;
  allowInSubpage: boolean;
  default: CardConfig;
  domains: readonly string[];
  pickerKey?: string;
  experimental?: "developer";
  hidden?: boolean;
  options?: readonly CardOptionSpec[];
}

export interface GridLayout {
  slots: number;
  cols: number;
  rows: number;
  grid: readonly number[];
  sizes: Readonly<Record<string, number>>;
}

export interface SubpageConfig {
  order: readonly string[];
  buttons: readonly CardConfig[];
  backLabel?: string;
  grid?: readonly number[];
  sizes?: Readonly<Record<string, number>>;
}

export interface PanelSettings {
  button_on_color: string;
  button_off_color: string;
  sensor_card_color: string;
  temperature_unit: string;
  clock_bar: boolean;
  network_status_icon: boolean;
  timezone: string;
  clock_format: string;
  screensaver_mode: string;
  screen_rotation: string;
}

export interface DeviceProfile {
  slots: number;
  layout: {
    cols: number;
    rows: number;
    firmwareGrid: string;
    portraitCols?: number;
  };
  rotation?: {
    enabled: boolean;
    options: readonly string[];
    displayOffset?: number;
    rotateWidthCompensation?: boolean;
  };
  web: {
    screen: {
      width: string;
      aspect: string;
    };
    portrait?: {
      cols: number;
      rows: number;
      screen: {
        width: string;
        aspect: string;
      };
    };
  };
  firmware: {
    build: {
      chip: string;
    };
    fonts: Readonly<Record<string, string>>;
    display?: Readonly<Record<string, string | number | boolean>>;
    package: {
      firmwareVersion: string;
      substitutions: Readonly<Record<string, string>>;
      deviceFontPackageKey?: string;
      networkCoprocessor?: boolean;
      ethernetSelectable?: boolean;
    };
  };
}

export interface BackupConfig {
  version: number;
  format?: string;
  device?: string;
  source?: {
    device: string;
    slots: number;
  };
  button_order: string;
  buttons: readonly Partial<CardConfig>[];
  subpages?: Readonly<Record<string, string | SubpageConfig>>;
  settings?: Partial<PanelSettings>;
  screen?: Readonly<Record<string, string | number | boolean>>;
}
