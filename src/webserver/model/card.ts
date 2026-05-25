import type { CardConfig, SavedConfigField } from "../contracts/types";

export type DraftCardConfig = CardConfig & {
  _whenOnActive?: unknown;
  _whenOnMode?: unknown;
};

export const CARD_CONFIG_FIELDS: readonly SavedConfigField[] = [
  "entity",
  "label",
  "icon",
  "icon_on",
  "sensor",
  "unit",
  "type",
  "precision",
  "options",
];

export function emptyCardConfig(type?: string): CardConfig {
  return {
    entity: "",
    label: "",
    icon: "Auto",
    icon_on: "Auto",
    sensor: "",
    unit: "",
    type: type || "",
    precision: "",
    options: "",
  };
}

export function cloneCardConfig(src?: Partial<CardConfig> & Partial<DraftCardConfig>): DraftCardConfig {
  const button: DraftCardConfig = {
    entity: src?.entity || "",
    label: src?.label || "",
    icon: src?.icon || "Auto",
    icon_on: src?.icon_on || "Auto",
    sensor: src?.sensor || "",
    unit: src?.unit || "",
    type: src?.type || "",
    precision: src?.precision || "",
    options: src?.options || "",
  };
  if (src && Object.prototype.hasOwnProperty.call(src, "_whenOnActive")) {
    button._whenOnActive = src._whenOnActive;
  }
  if (src && Object.prototype.hasOwnProperty.call(src, "_whenOnMode")) {
    button._whenOnMode = src._whenOnMode;
  }
  return button;
}

export function copyCardConfig(
  target: Partial<CardConfig> & Partial<DraftCardConfig>,
  src?: Partial<CardConfig> & Partial<DraftCardConfig>,
): DraftCardConfig {
  const button = cloneCardConfig(src);
  for (const field of CARD_CONFIG_FIELDS) {
    target[field] = button[field];
  }
  target._whenOnActive = button._whenOnActive;
  target._whenOnMode = button._whenOnMode;
  return target as DraftCardConfig;
}
