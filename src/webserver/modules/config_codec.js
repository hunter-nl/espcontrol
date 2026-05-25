// ── Subpage helpers ────────────────────────────────────────────────────

function normalizeButtonConfig(b) {
  if (b) b.options = b.options || "";
  if (b && isBrightnessSliderType(b.type) && b.sensor) {
    b.sensor = "";
  }
  if (b && isFanCardType(b.type)) {
    b.sensor = "";
    b.unit = "";
    b.precision = "";
    b.options = "";
    if (!b.icon || b.icon === "Auto") b.icon = fanCardDefaultIcon(b.type);
    if (b.type === "fan_switch") {
      if (!b.icon_on || b.icon_on === "Auto") b.icon_on = "Fan";
    } else {
      b.icon_on = "Auto";
    }
  }
  if (b && b.type === "weather_forecast") {
    var weatherAlias = cardContractMigrationAlias(b.type);
    b.type = weatherAlias && weatherAlias.type || "weather";
    b.precision = weatherAlias && weatherAlias.precision || "tomorrow";
    if (b.label === "Weather") b.label = "";
  }
  if (b && b.type === "text_sensor") {
    var textSensorAlias = cardContractMigrationAlias(b.type);
    b.type = textSensorAlias && textSensorAlias.type || "sensor";
    b.precision = textSensorAlias && textSensorAlias.precision || "text";
    b.entity = "";
    b.label = "";
    b.unit = "";
    b.icon_on = "Auto";
    if (!b.icon) b.icon = "Auto";
  }
  if (b && b.type === "media") {
    if (b.sensor === "controls") {
      if (!b.icon || b.icon === "Speaker") b.icon = "Auto";
      b.sensor = "play_pause";
    } else if (!b.sensor) {
      b.sensor = "play_pause";
    }
    if (["play_pause", "previous", "next", "volume", "position", "now_playing"].indexOf(b.sensor) < 0) {
      b.sensor = "play_pause";
    }
    if (b.sensor === "previous" && b.label === "Skip Previous") b.label = "Previous";
    if (b.sensor === "next" && b.label === "Skip Next") b.label = "Next";
    if (b.sensor === "volume") {
      if (!b.label || b.label === "Media") b.label = "Volume";
      b.icon = "Auto";
    }
    if (b.sensor === "position" && (!b.label || b.label === "Track")) b.label = "Position";
    if (b.sensor === "now_playing") {
      b.precision = b.precision === "progress" || b.precision === "play_pause" ? b.precision : "";
    } else if ((b.sensor === "play_pause" || b.sensor === "position") && b.precision === "state") {
      b.precision = "state";
    } else {
      b.precision = "";
    }
  }
  if (b && b.type === "climate") {
    b.sensor = "";
    b.unit = "";
    if (!b.icon) b.icon = "Thermostat";
    if (!b.icon_on) b.icon_on = "Auto";
    b.precision = normalizeClimatePrecisionConfig(b.precision);
    b.options = normalizeClimateOptions(b.options);
  }
  if (b && b.type === "garage") {
    if (b.sensor !== "open" && b.sensor !== "close") b.sensor = "";
    b.unit = "";
    b.precision = "";
    if (b.sensor === "open" || b.sensor === "close") b.icon_on = "Auto";
    b.options = normalizeGarageOptions(b.options, b.sensor);
  }
  if (b && b.type === "alarm") {
    b.sensor = "";
    b.unit = "";
    b.precision = "";
    b.icon_on = "Auto";
    if (!b.icon || b.icon === "Auto") b.icon = "Security";
    b.options = normalizeAlarmOptions(b.options);
  }
  if (b && b.type === "alarm_action") {
    b.sensor = alarmActionInfo(b.sensor) ? b.sensor : "away";
    b.unit = "";
    b.precision = "";
    b.icon_on = "Auto";
    if (!b.label) b.label = alarmActionInfo(b.sensor).label;
    if (!b.icon || b.icon === "Auto" || b.icon === alarmActionLegacyIcon(b.sensor)) {
      b.icon = alarmActionInfo(b.sensor).icon;
    }
    b.options = normalizeAlarmOptions(b.options);
  }
  if (b && b.type === "light_switch") {
    b.sensor = "";
    b.unit = "";
    b.precision = "";
    b.options = "";
  }
  if (b && b.type === "option_select") {
    b.type = "action";
    b.sensor = ACTION_CARD_OPTION_SELECT_ACTION;
    b.unit = "";
    b.precision = "";
    b.icon_on = "Auto";
    b.options = "";
    if (!b.icon || b.icon === "Auto" || b.icon === "Chevron Down") b.icon = "Flash";
  }
  if (b && actionCardIsOptionSelect(b)) {
    b.sensor = ACTION_CARD_OPTION_SELECT_ACTION;
    b.unit = "";
    b.precision = "";
    b.icon_on = "Auto";
    b.options = "";
    if (!b.icon || b.icon === "Auto" || b.icon === "Chevron Down") b.icon = "Flash";
  }
  if (b && !b.type) {
    b.options = normalizeSwitchConfirmationOptions(b.options);
  } else if (b && b.type === "sensor") {
    b.options = normalizeSensorOptions(b.options, b.precision);
  } else if (b && b.type === "door_window") {
    b.entity = "";
    b.unit = "";
    b.precision = normalizeDoorWindowSubtype(b.precision);
    if (!b.icon || b.icon === "Auto") b.icon = doorWindowClosedIcon(b.precision);
    if (!b.icon_on || b.icon_on === "Auto") b.icon_on = doorWindowOpenIcon(b.precision);
    b.options = normalizeDoorWindowOptions(b.options);
  } else if (b && b.type !== "action" && b.type !== "alarm" && b.type !== "alarm_action" && b.type !== "climate" && b.type !== "garage" && !cardLargeNumbersSupported(b)) {
    b.options = "";
  }
  return b;
}

function isBrightnessSliderType(type) {
  return cardContractIsBrightnessSliderType(type);
}

function isFanCardType(type) {
  return cardContractIsFanCardType(type);
}

function isOptionSelectType(type) {
  return cardContractIsOptionSelectType(type);
}

function fanCardDefaultIcon(type) {
  return cardContractFanDefaultIcon(type);
}

var SENSOR_LARGE_NUMBERS_OPTION = "large_numbers";
var SENSOR_ACTIVE_COLOR_OPTION = "active_color";
var SWITCH_CONFIRM_OFF_OPTION = "confirm_off";
var SWITCH_CONFIRM_ON_OPTION = "confirm_on";
var SWITCH_CONFIRM_MESSAGE_OPTION = "confirm_message";
var SWITCH_CONFIRM_YES_OPTION = "confirm_yes";
var SWITCH_CONFIRM_NO_OPTION = "confirm_no";
var SWITCH_CONFIRM_DEFAULT_MESSAGE = "Turn off this device?";
var SWITCH_CONFIRM_ON_DEFAULT_MESSAGE = "Turn on this device?";
var SWITCH_CONFIRM_BOTH_DEFAULT_MESSAGE = "Toggle this device?";
var SWITCH_CONFIRM_DEFAULT_YES = "Yes";
var SWITCH_CONFIRM_DEFAULT_NO = "No";
var ALARM_PIN_ARM_OPTION = "pin_arm";
var ALARM_PIN_DISARM_OPTION = "pin_disarm";
var ALARM_ACTIONS_OPTION = "actions";
var ALARM_ICON_DISPLAY_OPTION = "icon_display";
var ALARM_LABEL_DISPLAY_OPTION = "label_display";
var GARAGE_LABEL_DISPLAY_OPTION = "label_display";
var CLIMATE_LABEL_DISPLAY_OPTION = "label_display";
var CLIMATE_NUMBER_DISPLAY_OPTION = "number_display";
var ALARM_ACTIONS = [
  { value: "away", label: "Arm Away", service: "alarm_control_panel.alarm_arm_away", icon: "Shield Lock" },
  { value: "home", label: "Arm Home", service: "alarm_control_panel.alarm_arm_home", icon: "Shield Home" },
  { value: "disarm", label: "Disarm", service: "alarm_control_panel.alarm_disarm", icon: "Shield Off" },
];
var ALARM_DEFAULT_ACTIONS = ["away", "home", "disarm"];

function alarmActionLegacyIcon(value) {
  if (value === "away") return "Security";
  if (value === "home") return "Home";
  if (value === "disarm") return "Lock Open";
  return "";
}

function alarmActionIconIsGenerated(value, icon) {
  var info = alarmActionInfo(value);
  return !!info && (icon === info.icon || icon === alarmActionLegacyIcon(value));
}

function configOptionEnabled(options, name) {
  var parts = String(options || "").split(",");
  for (var i = 0; i < parts.length; i++) {
    if (parts[i] === name) return true;
  }
  return false;
}

function setConfigOption(options, name, enabled) {
  var parts = String(options || "").split(",");
  var out = [];
  var found = false;
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (!part) continue;
    if (part === name) {
      found = true;
      if (enabled) out.push(part);
    } else if (out.indexOf(part) < 0) {
      out.push(part);
    }
  }
  if (enabled && !found) out.push(name);
  return out.join(",");
}

function configOptionValue(options, name) {
  var prefix = name + "=";
  var parts = String(options || "").split(",");
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (part.indexOf(prefix) === 0) return decodeConfigField(part.substring(prefix.length));
  }
  return "";
}

function setConfigOptionValue(options, name, value) {
  var prefix = name + "=";
  var parts = String(options || "").split(",");
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var part = parts[i];
    if (!part || part.indexOf(prefix) === 0) continue;
    if (out.indexOf(part) < 0) out.push(part);
  }
  value = String(value || "").trim();
  if (value) out.push(prefix + encodeConfigField(value));
  return out.join(",");
}

function cardContractOptionSpec(type, name) {
  var options = cardContractOptions(type);
  for (var i = 0; i < options.length; i++) {
    if (options[i].name === name) return options[i];
  }
  return null;
}

function cardContractOptionSupportedFor(type, name, context) {
  var spec = cardContractOptionSpec(type, name);
  if (!spec) return false;
  var rule = spec.supportedWhen || {};
  if (rule.never) return false;
  context = context || {};
  var precision = context.precision || "";
  if (rule.precision && rule.precision.indexOf(precision) < 0) return false;
  if (rule.precisionNot && rule.precisionNot.indexOf(precision) >= 0) return false;
  return true;
}

function cardContractOptionDefaultValue(type, name, fallback) {
  var spec = cardContractOptionSpec(type, name);
  return spec && typeof spec.defaultValue === "string" ? spec.defaultValue : fallback;
}

function switchConfirmationModeStorage() {
  var spec = cardContractOptionSpec("", "confirmation_mode");
  return spec && spec.storage && spec.storage.length >= 2
    ? spec.storage
    : [SWITCH_CONFIRM_OFF_OPTION, SWITCH_CONFIRM_ON_OPTION];
}

function cardLargeNumbersSupported(b) {
  if (!b) return false;
  if (typeof BUTTON_TYPES !== "undefined") {
    var typeDef = BUTTON_TYPES[b.type || ""];
    var large = typeDef && typeDef.cardMetadata && typeDef.cardMetadata.largeNumbers;
    if (large) {
      return typeof large.supported === "function" ? !!large.supported(b) : large.supported !== false;
    }
  }
  return cardContractLargeNumbersSupported(b.type, b.precision);
}

function cardLargeNumbersEnabled(b) {
  return !!(b && cardLargeNumbersSupported(b) &&
    configOptionEnabled(b.options, SENSOR_LARGE_NUMBERS_OPTION));
}

function sensorLargeNumbersEnabled(b) {
  return cardLargeNumbersEnabled(b);
}

function setSensorLargeNumbersEnabled(b, enabled) {
  if (!b) return "";
  b.options = setConfigOption(b.options, SENSOR_LARGE_NUMBERS_OPTION, enabled);
  return b.options;
}

function sensorActiveColorEnabled(b) {
  return !!(b && b.type === "sensor" &&
    configOptionEnabled(b.options, SENSOR_ACTIVE_COLOR_OPTION));
}

function setSensorActiveColorEnabled(b, enabled) {
  if (!b) return "";
  b.options = setConfigOption(b.options, SENSOR_ACTIVE_COLOR_OPTION, enabled);
  return b.options;
}

function normalizeSensorOptions(options, precision) {
  var out = "";
  if (configOptionEnabled(options, SENSOR_LARGE_NUMBERS_OPTION) &&
      cardContractOptionSupportedFor("sensor", SENSOR_LARGE_NUMBERS_OPTION, { precision: precision })) {
    out = setConfigOption(out, SENSOR_LARGE_NUMBERS_OPTION, true);
  }
  if (configOptionEnabled(options, SENSOR_ACTIVE_COLOR_OPTION) &&
      cardContractOptionSupportedFor("sensor", SENSOR_ACTIVE_COLOR_OPTION, { precision: precision })) {
    out = setConfigOption(out, SENSOR_ACTIVE_COLOR_OPTION, true);
  }
  return out;
}

function normalizeDoorWindowSubtype(value) {
  value = String(value || "").trim();
  return value === "window" ? "window" : "door";
}

function doorWindowClosedIcon(subtype) {
  return normalizeDoorWindowSubtype(subtype) === "window" ? "Window Closed" : "Door";
}

function doorWindowOpenIcon(subtype) {
  return normalizeDoorWindowSubtype(subtype) === "window" ? "Window Open" : "Door Open";
}

function doorWindowActiveColorEnabled(b) {
  return !!(b && b.type === "door_window" &&
    configOptionEnabled(b.options, SENSOR_ACTIVE_COLOR_OPTION));
}

function setDoorWindowActiveColorEnabled(b, enabled) {
  if (!b) return "";
  b.options = setConfigOption(b.options, SENSOR_ACTIVE_COLOR_OPTION, enabled);
  return b.options;
}

function normalizeDoorWindowOptions(options) {
  var out = "";
  if (configOptionEnabled(options, SENSOR_ACTIVE_COLOR_OPTION)) {
    out = setConfigOption(out, SENSOR_ACTIVE_COLOR_OPTION, true);
  }
  return out;
}

function switchConfirmationEnabled(b) {
  return !!switchConfirmationMode(b);
}

function switchConfirmationMode(b) {
  var options = b && b.options;
  var storage = switchConfirmationModeStorage();
  var confirmOff = configOptionEnabled(options, storage[0]);
  var confirmOn = configOptionEnabled(options, storage[1]);
  if (confirmOff && confirmOn) return "both";
  if (confirmOn) return "on";
  if (confirmOff) return "off";
  return "";
}

function switchConfirmationDefaultMessageForMode(mode) {
  var spec = cardContractOptionSpec("", SWITCH_CONFIRM_MESSAGE_OPTION);
  var defaults = spec && spec.defaultValueByMode || {};
  if (mode && defaults[mode]) return defaults[mode];
  return cardContractOptionDefaultValue("", SWITCH_CONFIRM_MESSAGE_OPTION, SWITCH_CONFIRM_DEFAULT_MESSAGE);
}

function switchConfirmationMessage(b) {
  return configOptionValue(b && b.options, SWITCH_CONFIRM_MESSAGE_OPTION) ||
    switchConfirmationDefaultMessageForMode(switchConfirmationMode(b));
}

function switchConfirmationYesText(b) {
  return configOptionValue(b && b.options, SWITCH_CONFIRM_YES_OPTION) ||
    cardContractOptionDefaultValue("", SWITCH_CONFIRM_YES_OPTION, SWITCH_CONFIRM_DEFAULT_YES);
}

function switchConfirmationNoText(b) {
  return configOptionValue(b && b.options, SWITCH_CONFIRM_NO_OPTION) ||
    cardContractOptionDefaultValue("", SWITCH_CONFIRM_NO_OPTION, SWITCH_CONFIRM_DEFAULT_NO);
}

function normalizeSwitchConfirmationOptions(options) {
  var mode = switchConfirmationMode({ options: options });
  if (!mode) return "";
  var out = "";
  var storage = switchConfirmationModeStorage();
  out = setConfigOption(out, storage[0], mode === "off" || mode === "both");
  out = setConfigOption(out, storage[1], mode === "on" || mode === "both");
  var msg = configOptionValue(options, SWITCH_CONFIRM_MESSAGE_OPTION);
  var yes = configOptionValue(options, SWITCH_CONFIRM_YES_OPTION);
  var no = configOptionValue(options, SWITCH_CONFIRM_NO_OPTION);
  if (msg && msg !== switchConfirmationDefaultMessageForMode(mode)) {
    out = setConfigOptionValue(out, SWITCH_CONFIRM_MESSAGE_OPTION, msg);
  }
  if (yes && yes !== cardContractOptionDefaultValue("", SWITCH_CONFIRM_YES_OPTION, SWITCH_CONFIRM_DEFAULT_YES)) {
    out = setConfigOptionValue(out, SWITCH_CONFIRM_YES_OPTION, yes);
  }
  if (no && no !== cardContractOptionDefaultValue("", SWITCH_CONFIRM_NO_OPTION, SWITCH_CONFIRM_DEFAULT_NO)) {
    out = setConfigOptionValue(out, SWITCH_CONFIRM_NO_OPTION, no);
  }
  return out;
}

function setSwitchConfirmationOptions(b, mode, message, yesText, noText) {
  if (!b) return "";
  mode = mode === true ? "off" : mode;
  mode = mode === "on" || mode === "both" || mode === "off" ? mode : "";
  var out = "";
  var storage = switchConfirmationModeStorage();
  out = setConfigOption(out, storage[0], mode === "off" || mode === "both");
  out = setConfigOption(out, storage[1], mode === "on" || mode === "both");
  if (mode) {
    if (message && message !== switchConfirmationDefaultMessageForMode(mode)) {
      out = setConfigOptionValue(out, SWITCH_CONFIRM_MESSAGE_OPTION, message);
    }
    if (yesText && yesText !== cardContractOptionDefaultValue("", SWITCH_CONFIRM_YES_OPTION, SWITCH_CONFIRM_DEFAULT_YES)) {
      out = setConfigOptionValue(out, SWITCH_CONFIRM_YES_OPTION, yesText);
    }
    if (noText && noText !== cardContractOptionDefaultValue("", SWITCH_CONFIRM_NO_OPTION, SWITCH_CONFIRM_DEFAULT_NO)) {
      out = setConfigOptionValue(out, SWITCH_CONFIRM_NO_OPTION, noText);
    }
  }
  b.options = out;
  return b.options;
}

function normalizeGarageLabelDisplayMode(value) {
  value = String(value || "").trim();
  var spec = cardContractOptionSpec("garage", GARAGE_LABEL_DISPLAY_OPTION);
  var values = spec && spec.values ? spec.values : ["label", "status"];
  return values.indexOf(value) >= 0 ? value : "label";
}

function normalizeGarageOptions(options, mode) {
  var labelMode = normalizeGarageLabelDisplayMode(
    configOptionValue(options, GARAGE_LABEL_DISPLAY_OPTION));
  if (garageCommandMode(mode)) return "";
  return labelMode === "status"
    ? setConfigOptionValue("", GARAGE_LABEL_DISPLAY_OPTION, labelMode)
    : "";
}

function garageLabelDisplayMode(b) {
  if (garageCommandMode(b && b.sensor)) return "label";
  return normalizeGarageLabelDisplayMode(
    configOptionValue(b && b.options, GARAGE_LABEL_DISPLAY_OPTION));
}

function setGarageLabelDisplayMode(b, mode) {
  if (!b) return "";
  b.options = setConfigOptionValue(
    b.options,
    GARAGE_LABEL_DISPLAY_OPTION,
    normalizeGarageLabelDisplayMode(mode) === "status" ? "status" : ""
  );
  b.options = normalizeGarageOptions(b.options, b.sensor);
  return b.options;
}

function normalizeClimateLabelDisplayMode(value) {
  value = String(value || "").trim();
  return ["label", "status", "actual", "target"].indexOf(value) >= 0 ? value : "label";
}

function normalizeClimateNumberDisplayMode(value) {
  value = String(value || "").trim();
  if (value === "icon") return "icon";
  return value === "actual" ? "actual" : "target";
}

function normalizeClimateOptions(options) {
  var labelMode = normalizeClimateLabelDisplayMode(
    configOptionValue(options, CLIMATE_LABEL_DISPLAY_OPTION));
  var numberMode = normalizeClimateNumberDisplayMode(
    configOptionValue(options, CLIMATE_NUMBER_DISPLAY_OPTION));
  var out = "";
  if (labelMode !== "label") {
    out = setConfigOptionValue(out, CLIMATE_LABEL_DISPLAY_OPTION, labelMode);
  }
  if (numberMode !== "target") {
    out = setConfigOptionValue(out, CLIMATE_NUMBER_DISPLAY_OPTION, numberMode);
  }
  return out;
}

function climateLabelDisplayMode(b) {
  return normalizeClimateLabelDisplayMode(
    configOptionValue(b && b.options, CLIMATE_LABEL_DISPLAY_OPTION));
}

function setClimateLabelDisplayMode(b, mode) {
  if (!b) return "";
  var normalized = normalizeClimateLabelDisplayMode(mode);
  b.options = setConfigOptionValue(
    b.options,
    CLIMATE_LABEL_DISPLAY_OPTION,
    normalized === "label" ? "" : normalized
  );
  b.options = normalizeClimateOptions(b.options);
  return b.options;
}

function climateNumberDisplayMode(b) {
  return normalizeClimateNumberDisplayMode(
    configOptionValue(b && b.options, CLIMATE_NUMBER_DISPLAY_OPTION));
}

function setClimateNumberDisplayMode(b, mode) {
  if (!b) return "";
  var normalized = normalizeClimateNumberDisplayMode(mode);
  b.options = setConfigOptionValue(
    b.options,
    CLIMATE_NUMBER_DISPLAY_OPTION,
    normalized === "target" ? "" : normalized
  );
  b.options = normalizeClimateOptions(b.options);
  return b.options;
}

function alarmActionInfo(value) {
  for (var i = 0; i < ALARM_ACTIONS.length; i++) {
    if (ALARM_ACTIONS[i].value === value) return ALARM_ACTIONS[i];
  }
  return null;
}

function alarmActionValues() {
  return ALARM_DEFAULT_ACTIONS.slice();
}

function alarmPinRequired(b, mode) {
  var option = mode === "disarm" ? ALARM_PIN_DISARM_OPTION : ALARM_PIN_ARM_OPTION;
  return configOptionValue(b && b.options, option) !== "0";
}

function setAlarmPinRequired(b, mode, required) {
  if (!b) return "";
  var option = mode === "disarm" ? ALARM_PIN_DISARM_OPTION : ALARM_PIN_ARM_OPTION;
  b.options = setConfigOptionValue(b.options, option, required ? "" : "0");
  b.options = normalizeAlarmOptions(b.options);
  return b.options;
}

function normalizeAlarmActionList(value) {
  var raw = String(value || "");
  if (!raw) return ALARM_DEFAULT_ACTIONS.slice();
  var parts = raw.split("|");
  var out = [];
  for (var i = 0; i < parts.length; i++) {
    var action = parts[i];
    if (!alarmActionInfo(action) || out.indexOf(action) >= 0) continue;
    out.push(action);
  }
  return out.length ? out : ALARM_DEFAULT_ACTIONS.slice();
}

function alarmVisibleActions(b) {
  return normalizeAlarmActionList(configOptionValue(b && b.options, ALARM_ACTIONS_OPTION));
}

function alarmActionsAreDefault(actions) {
  actions = actions || [];
  if (actions.length !== ALARM_DEFAULT_ACTIONS.length) return false;
  for (var i = 0; i < ALARM_DEFAULT_ACTIONS.length; i++) {
    if (actions[i] !== ALARM_DEFAULT_ACTIONS[i]) return false;
  }
  return true;
}

function setAlarmVisibleActions(b, actions) {
  if (!b) return "";
  var normalized = normalizeAlarmActionList((actions || []).join("|"));
  b.options = setConfigOptionValue(
    b.options,
    ALARM_ACTIONS_OPTION,
    alarmActionsAreDefault(normalized) ? "" : normalized.join("|")
  );
  b.options = normalizeAlarmOptions(b.options);
  return b.options;
}

function normalizeAlarmIconDisplayMode(value) {
  return String(value || "").trim() === "static" ? "static" : "status";
}

function normalizeAlarmLabelDisplayMode(value) {
  return String(value || "").trim() === "name" ? "name" : "status";
}

function alarmIconDisplayMode(b) {
  return normalizeAlarmIconDisplayMode(
    configOptionValue(b && b.options, ALARM_ICON_DISPLAY_OPTION));
}

function setAlarmIconDisplayMode(b, mode) {
  if (!b) return "";
  var normalized = normalizeAlarmIconDisplayMode(mode);
  b.options = setConfigOptionValue(
    b.options,
    ALARM_ICON_DISPLAY_OPTION,
    normalized === "status" ? "" : normalized
  );
  b.options = normalizeAlarmOptions(b.options);
  return b.options;
}

function alarmLabelDisplayMode(b) {
  return normalizeAlarmLabelDisplayMode(
    configOptionValue(b && b.options, ALARM_LABEL_DISPLAY_OPTION));
}

function setAlarmLabelDisplayMode(b, mode) {
  if (!b) return "";
  var normalized = normalizeAlarmLabelDisplayMode(mode);
  b.options = setConfigOptionValue(
    b.options,
    ALARM_LABEL_DISPLAY_OPTION,
    normalized === "status" ? "" : normalized
  );
  b.options = normalizeAlarmOptions(b.options);
  return b.options;
}

function normalizeAlarmOptions(options) {
  var out = "";
  if (configOptionValue(options, ALARM_PIN_ARM_OPTION) === "0") {
    out = setConfigOptionValue(out, ALARM_PIN_ARM_OPTION, "0");
  }
  if (configOptionValue(options, ALARM_PIN_DISARM_OPTION) === "0") {
    out = setConfigOptionValue(out, ALARM_PIN_DISARM_OPTION, "0");
  }
  var rawActions = configOptionValue(options, ALARM_ACTIONS_OPTION);
  if (rawActions) {
    var actions = normalizeAlarmActionList(rawActions);
    if (!alarmActionsAreDefault(actions)) {
      out = setConfigOptionValue(out, ALARM_ACTIONS_OPTION, actions.join("|"));
    }
  }
  var iconMode = normalizeAlarmIconDisplayMode(
    configOptionValue(options, ALARM_ICON_DISPLAY_OPTION));
  if (iconMode !== "status") {
    out = setConfigOptionValue(out, ALARM_ICON_DISPLAY_OPTION, iconMode);
  }
  var labelMode = normalizeAlarmLabelDisplayMode(
    configOptionValue(options, ALARM_LABEL_DISPLAY_OPTION));
  if (labelMode !== "status") {
    out = setConfigOptionValue(out, ALARM_LABEL_DISPLAY_OPTION, labelMode);
  }
  return out;
}

function parseClimatePrecisionConfig(value) {
  var raw = String(value || "");
  var parts = raw.split(":");
  var precision = parts[0] || "";
  if (precision === "0") precision = "";
  if (["", "1", "2", "3"].indexOf(precision) < 0) precision = "";
  var min = parts.length > 1 ? sanitizeClimateRangeValue(parts[1]) : "";
  var max = parts.length > 2 ? sanitizeClimateRangeValue(parts[2]) : "";
  return { precision: precision, min: min, max: max };
}

function sanitizeClimateRangeValue(value) {
  var text = String(value || "").trim();
  if (!text) return "";
  var num = Number(text);
  if (!isFinite(num)) return "";
  return String(Math.round(num * 10) / 10).replace(/\.0$/, "");
}

function climatePrecisionConfig(precision, min, max) {
  var p = ["", "1", "2", "3"].indexOf(String(precision || "")) >= 0 ? String(precision || "") : "";
  var lo = sanitizeClimateRangeValue(min);
  var hi = sanitizeClimateRangeValue(max);
  if (!lo && !hi) return p;
  return (p || "0") + ":" + lo + ":" + hi;
}

function normalizeClimatePrecisionConfig(value) {
  var parsed = parseClimatePrecisionConfig(value);
  return climatePrecisionConfig(parsed.precision, parsed.min, parsed.max);
}

function buttonConfigChangedByNormalize(raw) {
  var before = EspControlModel.cloneCardConfig(raw || {});
  var after = normalizeButtonConfig(EspControlModel.cloneCardConfig(before));
  return EspControlModel.cardConfigChanged(before, after);
}

function trimConfigFields(fields) {
  return EspControlModel.trimConfigFields(fields);
}

function buttonConfigFields(b) {
  var type = b && b.type || "";
  var isActionOptionSelect = !!(b && (actionCardIsOptionSelect(b) || isOptionSelectType(type)));
  if (isActionOptionSelect) type = "action";
  var sensor = isActionOptionSelect ? ACTION_CARD_OPTION_SELECT_ACTION :
    (isBrightnessSliderType(type) || type === "climate" || type === "light_switch" || type === "alarm" || isFanCardType(type)) ? "" : (b && b.sensor || "");
  var unit = (isActionOptionSelect || type === "climate" || type === "light_switch" || type === "alarm" || type === "alarm_action" || isFanCardType(type)) ? "" : (b && b.unit || "");
  var icon = b && b.icon || "Auto";
  if (isActionOptionSelect && (!icon || icon === "Auto" || icon === "Chevron Down")) icon = "Flash";
  if (type === "alarm" && (!icon || icon === "Auto")) icon = "Security";
  if (type === "alarm_action" && (!icon || icon === "Auto")) icon = (alarmActionInfo(sensor) || ALARM_ACTIONS[0]).icon;
  if (isFanCardType(type) && (!icon || icon === "Auto")) icon = fanCardDefaultIcon(type);
  var iconOn = (isActionOptionSelect || type === "alarm" || type === "alarm_action" || (isFanCardType(type) && type !== "fan_switch")) ? "Auto" : (b && b.icon_on || "Auto");
  if (type === "fan_switch" && (!iconOn || iconOn === "Auto")) iconOn = "Fan";
  var precision = (isActionOptionSelect || type === "light_switch" || type === "alarm" || type === "alarm_action" || isFanCardType(type)) ? "" : (b && b.precision || "");
  if (type === "climate") precision = normalizeClimatePrecisionConfig(precision);
  if (type === "door_window") precision = normalizeDoorWindowSubtype(precision);
  var options = b && b.options || "";
  if (type === "") {
    options = normalizeSwitchConfirmationOptions(options);
  } else if (type === "alarm" || type === "alarm_action") {
    options = normalizeAlarmOptions(options);
  } else if (type === "garage") {
    options = normalizeGarageOptions(options, sensor);
  } else if (type === "climate") {
    options = normalizeClimateOptions(options);
  } else if (type === "sensor") {
    options = normalizeSensorOptions(options, precision);
  } else if (type === "door_window") {
    options = normalizeDoorWindowOptions(options);
  } else if (isActionOptionSelect || isFanCardType(type)) {
    options = "";
  } else if (type !== "action" && type !== "alarm_action" && type !== "garage" && !cardLargeNumbersSupported({ type: type, precision: precision })) {
    options = "";
  }
  if (type === "door_window") {
    b = b || {};
    b.entity = "";
    unit = "";
    if (!icon || icon === "Auto") icon = doorWindowClosedIcon(precision);
    if (!iconOn || iconOn === "Auto") iconOn = doorWindowOpenIcon(precision);
  }
  if (!type && !sensor) {
    unit = "";
    precision = "";
  }
  return trimConfigFields([
    type === "door_window" ? "" : (b && b.entity || ""),
    b && b.label || "",
    icon,
    iconOn,
    sensor,
    unit,
    type,
    precision,
    options,
  ]);
}

function encodeConfigField(value) {
  return EspControlModel.encodeConfigField(value);
}

function decodeConfigField(value) {
  return EspControlModel.decodeConfigField(value);
}

function legacyButtonConfigSafe(fields) {
  return EspControlModel.legacyButtonConfigSafe(fields);
}

function serializeButtonConfig(b) {
  var fields = buttonConfigFields(b || {});
  if (legacyButtonConfigSafe(fields)) return fields.join(";");
  return "~" + fields.map(encodeConfigField).join(",");
}

function parseRawButtonConfig(str) {
  return EspControlModel.parseRawButtonConfig(str);
}

function parseButtonConfig(str) {
  return normalizeButtonConfig(parseRawButtonConfig(str));
}

function hasLegacySliderDirection(b) {
  return !!(b && isBrightnessSliderType(b.type) && b.sensor);
}

function buttonConfigHasLegacySliderDirection(str) {
  return hasLegacySliderDirection(parseRawButtonConfig(str || ""));
}

function buttonConfigNeedsMigration(str) {
  return buttonConfigChangedByNormalize(parseRawButtonConfig(str || ""));
}

function parseBackOrderToken(value) {
  return EspControlModel.parseBackOrderToken(value);
}

function backOrderToken(baseToken, label) {
  return EspControlModel.backOrderToken(baseToken, label);
}

function backLabelFromOrder(order) {
  return EspControlModel.backLabelFromOrder(order);
}

function parseSubpageOrder(orderStr) {
  return EspControlModel.parseSubpageOrder(orderStr);
}

function subpageOrderForSerialize(sp) {
  return EspControlModel.subpageOrderForSerialize((sp && sp.order) || [], sp && sp.backLabel);
}

function subpageSerializedOrder(sp) {
  if (!sp) return [];
  if (sp.order && sp.order.length) return subpageOrderForSerialize(sp);
  if (sp.grid && sp.grid.length) return serializeSubpageGrid(sp);
  return [];
}

function parseSubpageConfig(str, raw) {
  var parsed = EspControlModel.parseRawSubpageConfig(str, subpageTypeFromCode);
  if (raw) return parsed;
  parsed.buttons = parsed.buttons.map(function (button) {
    return normalizeButtonConfig(button);
  });
  return parsed;
}

function subpageTypeCode(type) {
  return cardContractSubpageTypeCode(type);
}

function subpageTypeFromCode(code) {
  return cardContractSubpageTypeFromCode(code);
}

function encodeSubpageField(value) {
  return encodeConfigField(value);
}

function decodeSubpageField(value) {
  return decodeConfigField(value);
}

function parseCompactSubpageConfig(str, raw) {
  var parsed = EspControlModel.parseCompactSubpageConfig(str, subpageTypeFromCode);
  if (raw) return parsed;
  parsed.buttons = parsed.buttons.map(function (button) {
    return normalizeButtonConfig(button);
  });
  return parsed;
}

function subpageConfigHasLegacySliderDirection(str) {
  var sp = parseSubpageConfig(str, true);
  for (var i = 0; i < sp.buttons.length; i++) {
    if (hasLegacySliderDirection(sp.buttons[i])) return true;
  }
  return false;
}

function subpageConfigNeedsMigration(str) {
  var sp = parseSubpageConfig(str, true);
  for (var i = 0; i < sp.buttons.length; i++) {
    if (buttonConfigChangedByNormalize(sp.buttons[i])) return true;
  }
  return false;
}

function serializeSubpageConfig(sp) {
  var order = subpageSerializedOrder(sp);
  var legacy = legacySubpageConfigSafe(sp) ? serializeLegacySubpageConfig(sp) : "";
  var compact = serializeCompactSubpageConfig(sp);
  return EspControlModel.chooseSerializedSubpageConfig(
    order,
    sp && sp.buttons ? sp.buttons.length : 0,
    legacy,
    compact
  );
}

function subpageLegacyButtonFields(b) {
  var fields = buttonConfigFields(b || {});
  if (fields.length > 1 && fields[fields.length - 1] === "Auto") {
    while (fields.length > 1 && (fields[fields.length - 1] === "Auto" || !fields[fields.length - 1])) fields.pop();
  }
  return fields;
}

function subpageCompactButtonFields(b) {
  var fields = buttonConfigFields(b || {});
  var compact = [
    subpageTypeCode(fields[6] || ""),
    encodeSubpageField(fields[0]),
    encodeSubpageField(fields[1]),
    fields[2] && fields[2] !== "Auto" ? encodeSubpageField(fields[2]) : "",
    fields[3] && fields[3] !== "Auto" ? encodeSubpageField(fields[3]) : "",
    encodeSubpageField(fields[4]),
    encodeSubpageField(fields[5]),
    encodeSubpageField(fields[7]),
    encodeSubpageField(fields[8]),
  ];
  while (compact.length > 1 && !compact[compact.length - 1]) compact.pop();
  return compact;
}

function legacySubpageConfigSafe(sp) {
  var fields = ((sp && sp.buttons) || []).map(subpageLegacyButtonFields);
  return EspControlModel.legacySubpageFieldsSafe(fields);
}

function serializeLegacySubpageConfig(sp) {
  if (!sp) return "";
  return EspControlModel.serializeLegacySubpageConfig(
    subpageSerializedOrder(sp),
    ((sp && sp.buttons) || []).map(subpageLegacyButtonFields)
  );
}

function serializeCompactSubpageConfig(sp) {
  if (!sp || !sp.buttons || sp.buttons.length === 0) return "";
  return EspControlModel.serializeCompactSubpageConfig(
    subpageSerializedOrder(sp),
    sp.buttons.map(subpageCompactButtonFields)
  );
}

function applySubpageRaw(slot) {
  var raw = state.subpageRaw[slot];
  var combined = (raw ? raw.main : "") + (raw ? raw.ext : "") +
    (raw ? raw.ext2 : "") + (raw ? raw.ext3 : "");
  var pending = state.subpageSavePending[slot];
  if (pending) {
    if (combined !== pending) {
      if (state.editingSubpage === slot) scheduleRender();
      return;
    }
    delete state.subpageSavePending[slot];
  }
  var local = state.subpages[slot];
  var localHasData = local && (
    (local.buttons && local.buttons.length > 0) ||
    (local.order && local.order.length > 0)
  );
  if (state.editingSubpage === slot && localHasData) {
    var localSerialized = serializeSubpageConfig(local);
    if (combined !== localSerialized) {
      scheduleRender();
      return;
    }
  }
  if (combined) {
    var migrateConfig = subpageConfigNeedsMigration(combined);
    var sp = parseSubpageConfig(combined);
    sp.sizes = sp.sizes || {};
    buildSubpageGrid(sp);
    state.subpages[slot] = sp;
    if (migrateConfig) scheduleSliderSubpageMigration(slot);
  } else {
    delete state.subpages[slot];
  }
  if (state.editingSubpage === slot) {
    scheduleRender();
  }
}

function getSubpage(homeSlot) {
  if (!state.subpages[homeSlot]) {
    state.subpages[homeSlot] = { order: [], buttons: [], grid: [], sizes: {}, backLabel: "Back" };
  } else if (!state.subpages[homeSlot].backLabel) {
    state.subpages[homeSlot].backLabel = backLabelFromOrder(state.subpages[homeSlot].order);
  }
  return state.subpages[homeSlot];
}

function buildSubpageGrid(sp) {
  var result = EspControlModel.buildSubpageGrid(sp, NUM_SLOTS, GRID_COLS);
  sp.grid = result.grid;
  sp.sizes = result.sizes;
  return sp.grid;
}

function serializeSubpageGrid(sp) {
  return EspControlModel.serializeSubpageGrid(sp.grid, sp.sizes || {}, sp.backLabel || "Back");
}

function enterSubpage(homeSlot) {
  state.editingSubpage = homeSlot;
  state.subpageSelectedSlots = [];
  state.subpageLastClicked = -1;
  var sp = getSubpage(homeSlot);
  buildSubpageGrid(sp);
  renderPreview();
  renderButtonSettings();
}

function exitSubpage() {
  state.editingSubpage = null;
  state.subpageSelectedSlots = [];
  state.subpageLastClicked = -1;
  renderPreview();
  renderButtonSettings();
}

function saveSubpageConfig(homeSlot) {
  var sp = getSubpage(homeSlot);
  sp.order = serializeSubpageGrid(sp);
  saveSubpageEntity(homeSlot);
}

function subpageFirstFreeSlot(sp) {
  var used = {};
  sp.grid.forEach(function (s) { if (s > 0) used[s] = true; });
  for (var i = 1; i <= sp.buttons.length + 1; i++) {
    if (!used[i]) return i;
  }
  return sp.buttons.length + 1;
}

function bindTextPost(input, postName, opts) {
  input.addEventListener("blur", function () {
    if (opts && opts.onBlur) opts.onBlur(this.value);
    postText(postName, this.value);
    if (opts && opts.rerender) renderPreview();
  });
  input.addEventListener("keydown", function (e) { if (e.key === "Enter") this.blur(); });
}
