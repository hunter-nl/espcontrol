#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { loadBundledWebSource } = require("./web_source");

const ROOT = path.resolve(__dirname, "..");
const SOURCE = path.join(ROOT, "src", "webserver", "www.js");
const DEVICE_MANIFEST = path.join(ROOT, "devices", "manifest.json");
const WEB_OUTPUT_DIR = path.join(ROOT, "docs", "public", "webserver");
const ALL_ROTATIONS = ["0", "90", "180", "270"];

function createWebSandbox() {
  const domEvents = [];
  const sandbox = {
    __ESPCONTROL_TEST_HOOKS__: {},
    console: { log() {}, warn() {}, error() {} },
    setTimeout,
    clearTimeout,
    requestAnimationFrame(fn) { return setTimeout(fn, 0); },
    document: {
      readyState: "loading",
      activeElement: null,
      addEventListener(type, listener) {
        domEvents.push({ type, listener });
      },
    },
  };
  sandbox.__domEvents = domEvents;
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  return sandbox;
}

function loadHooks() {
  const sandbox = createWebSandbox();
  vm.createContext(sandbox);
  vm.runInContext(loadBundledWebSource(), sandbox, { filename: SOURCE });
  return sandbox.__ESPCONTROL_TEST_HOOKS__.config;
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function assertGeneratedRotationOptions(slug, generated, key, options) {
  assert(
    generated.includes(`${key}:${JSON.stringify(options)}`),
    `${slug}: generated web UI must include ${key} ${JSON.stringify(options)}`
  );
}

const hooks = loadHooks();
assert(hooks, "web test hooks were not exported");

const manifest = JSON.parse(fs.readFileSync(DEVICE_MANIFEST, "utf8"));
for (const slug of Object.keys(manifest.devices || {})) {
  const webOutput = path.join(WEB_OUTPUT_DIR, slug, "www.js");
  const generated = fs.readFileSync(webOutput, "utf8");
  const sandbox = createWebSandbox();
  vm.createContext(sandbox);
  vm.runInContext(generated, sandbox, { filename: webOutput });
  assert(
    sandbox.__ESPCONTROL_TEST_HOOKS__.config,
    `${slug}: generated web UI must export the same test hooks used by local checks`
  );
  assert(
    sandbox.__domEvents.some((event) => event.type === "DOMContentLoaded" && typeof event.listener === "function"),
    `${slug}: generated web UI must register DOMContentLoaded startup wiring`
  );
}

for (const [slug, device] of Object.entries(manifest.devices || {})) {
  if (!device.rotation || !device.rotation.enabled) continue;
  const webOutput = path.join(WEB_OUTPUT_DIR, slug, "www.js");
  const generated = fs.readFileSync(webOutput, "utf8");
  const featureConfig = generated.match(/features:\{[^}]*\}/)?.[0] || "";
  assert(
    /features:\{[^}]*screenRotation:!0/.test(generated),
    `${slug}: generated web UI must expose screen rotation when rotation is enabled`
  );
  assert.deepStrictEqual(device.rotation.options, ALL_ROTATIONS, `${slug}: normal rotation options`);
  assert.strictEqual(device.rotation.experimentalOptions, undefined, `${slug}: no hidden rotation options`);
  assertGeneratedRotationOptions(slug, featureConfig, "screenRotationOptions", ALL_ROTATIONS);
  assert(
    !featureConfig.includes("screenRotationExperimentalOptions"),
    `${slug}: generated web UI must not hide rotation options behind the dev flag`
  );
}

const button = {
  entity: "light.kitchen",
  label: "Kitchen",
  icon: "Auto",
  icon_on: "Lightbulb",
  sensor: "",
  unit: "",
  type: "",
  precision: "",
  options: "",
};

const encoded = hooks.serializeButtonConfig(button);
assert.strictEqual(encoded, "light.kitchen;Kitchen;Auto;Lightbulb");
assert.deepStrictEqual(plain(hooks.parseButtonConfig(encoded)), button);

const confirmationButton = {
  entity: "switch.printer",
  label: "3D Printer",
  icon: "Printer 3D",
  icon_on: "Printer 3D",
  sensor: "",
  unit: "",
  type: "",
  precision: "",
  options: "confirm_off,confirm_message=Stop the print?,confirm_yes=Power Down,confirm_no=Keep On",
};
const confirmationRoundTrip = hooks.parseButtonConfig(hooks.serializeButtonConfig(confirmationButton));
assert.deepStrictEqual(plain(confirmationRoundTrip), confirmationButton);
assert.strictEqual(hooks.switchConfirmationEnabled(confirmationRoundTrip), true);
assert.strictEqual(hooks.switchConfirmationMode(confirmationRoundTrip), "off");
assert.strictEqual(hooks.switchConfirmationMessage(confirmationRoundTrip), "Stop the print?");
assert.strictEqual(hooks.switchConfirmationYesText(confirmationRoundTrip), "Power Down");
assert.strictEqual(hooks.switchConfirmationNoText(confirmationRoundTrip), "Keep On");
const confirmationOnRoundTrip = hooks.parseButtonConfig(hooks.serializeButtonConfig({
  entity: "switch.printer",
  label: "3D Printer",
  icon: "Printer 3D",
  icon_on: "Printer 3D",
  sensor: "",
  unit: "",
  type: "",
  precision: "",
  options: "confirm_on",
}));
assert.strictEqual(hooks.switchConfirmationMode(confirmationOnRoundTrip), "on");
assert.strictEqual(hooks.switchConfirmationMessage(confirmationOnRoundTrip), "Turn on this device?");
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("alarm", false, false), true);
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("alarm", true, false), true);
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("alarm", true, true), true);
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("alarm_action", false, false), false);
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("alarm_action", false, true), false);
assert(
  hooks.buttonTypePreviewFor("alarm", { label: "Alarm", icon: "Security", type: "alarm" }).iconHtml.includes("mdi-shield-off"),
  "alarm preview defaults to the status icon"
);
assert(
  hooks.buttonTypePreviewFor("alarm", { label: "Alarm", icon: "Alarm", type: "alarm", options: "icon_display=static" }).iconHtml.includes("mdi-bell-ring"),
  "alarm preview uses the selected Alarm icon"
);
assert.deepStrictEqual(Array.from(hooks.alarmCardTypeOptionValues(false)), ["control_panel", "away", "home", "disarm"]);
assert.deepStrictEqual(Array.from(hooks.alarmCardTypeOptionValues(true)), ["control_panel", "away", "home", "disarm"]);
assert.deepStrictEqual(Array.from(hooks.alarmVisibleActions(hooks.parseButtonConfig(
  "alarm_control_panel.house;House;Security;Auto;;;alarm;;actions=away%7Cdisarm"
))), ["away", "disarm"]);
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("fan_speed", false, false), false);
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("fan_speed", true, false), true);
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("fan_speed", true, true), true);
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("fan_switch", true, false), false);
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("fan_oscillate", true, true), false);
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("option_select", false, false), false);
assert.strictEqual(hooks.buttonTypeVisibleInPickerForExperimental("option_select", false, true), false);
assert(
  hooks.buttonTypePickerKeysForExperimental(false, false, "fan_speed").includes("fan_speed"),
  "saved fan cards remain represented while hidden"
);

assert.strictEqual(hooks.normalizeTemperatureUnit("fahrenheit"), "\u00b0F");
assert.strictEqual(hooks.normalizeTemperatureUnit("centigrade"), "\u00b0C");
const climatePreviewButton = {
  entity: "climate.home",
  label: "Home",
  icon: "Thermostat",
  icon_on: "Auto",
  sensor: "",
  unit: "",
  type: "climate",
  precision: "",
  options: "",
};
const climatePreviewC = hooks.buttonTypePreviewFor("climate", climatePreviewButton, {
  temperatureUnit: "\u00b0C",
});
assert.strictEqual(climatePreviewC.buttonClass, "sp-climate-temp-card", "climate temperature preview uses temperature card class");
assert(climatePreviewC.iconHtml.includes("\u00b0C"), "climate preview uses Celsius unit");
const climatePreviewF = hooks.buttonTypePreviewFor("climate", climatePreviewButton, {
  temperatureUnit: "\u00b0F",
});
assert(climatePreviewF.iconHtml.includes("\u00b0F"), "climate preview uses Fahrenheit unit");
const climatePreviewAuto = hooks.buttonTypePreviewFor("climate", climatePreviewButton, {
  temperatureUnit: "Auto",
  timezone: "America/New_York (GMT-5)",
});
assert(climatePreviewAuto.iconHtml.includes("\u00b0F"), "climate preview follows Auto timezone unit");
const climateLabelPreview = hooks.buttonTypePreviewFor("climate", {
  ...climatePreviewButton,
  options: "label_display=actual",
}, {
  temperatureUnit: "\u00b0F",
});
assert(climateLabelPreview.labelHtml.includes("21\u00b0F"), "climate actual label includes the configured unit");
const climateIconPreview = hooks.buttonTypePreviewFor("climate", {
  ...climatePreviewButton,
  options: "number_display=icon",
}, {
  temperatureUnit: "\u00b0C",
});
assert(climateIconPreview.iconHtml.includes("mdi-thermostat"), "climate icon mode preview uses the selected icon");
assert.strictEqual(climateIconPreview.buttonClass, undefined, "climate icon mode uses a standard card wrapper");
assert(!climateIconPreview.iconHtml.includes("sp-climate-card-icon"), "climate icon mode uses standard card icon layout");
assert(!climateIconPreview.iconHtml.includes("\u00b0C"), "climate icon mode preview does not show a large temperature");

function previewSensorValue(preview) {
  return (preview.iconHtml.match(/sp-sensor-value[^>]*>([^<]*)/) || [])[1] || "";
}

const datePreview = hooks.buttonTypePreviewFor("calendar", {
  type: "calendar",
  precision: "",
  options: "",
});
assert(datePreview.labelHtml.includes("mdi-calendar-month"), "date preview uses the calendar badge");
assert(datePreview.iconHtml.includes("sp-sensor-preview"), "date preview uses the shared sensor preview");

const dateTimePreview = hooks.buttonTypePreviewFor("calendar", {
  type: "calendar",
  precision: "datetime",
  options: "large_numbers",
}, {
  cardSize: 4,
  clockFormat: "24h",
});
assert(dateTimePreview.iconHtml.includes("sp-sensor-preview-large"), "date/time preview supports large numbers");
assert(previewSensorValue(dateTimePreview).includes(":"), "date/time preview renders a time value");

const timezonePreview = hooks.buttonTypePreviewFor("timezone", {
  entity: "America/New_York (GMT-5)",
  type: "timezone",
  options: "",
}, {
  clockFormat: "24h",
});
assert(timezonePreview.labelHtml.includes("New York"), "world clock preview uses the city label");
assert(timezonePreview.labelHtml.includes("mdi-map-clock"), "world clock preview uses the map clock badge");

const timezoneSamples = [
  "UTC (GMT+0)",
  "Pacific/Kiritimati (GMT+14)",
  "America/New_York (GMT-5)",
  "Pacific/Honolulu (GMT-10)",
];
assert(timezoneSamples.some((timezone) => {
  const button = { entity: timezone, type: "timezone", options: "" };
  const clock24 = previewSensorValue(hooks.buttonTypePreviewFor("timezone", button, { clockFormat: "24h" }));
  const clock12 = previewSensorValue(hooks.buttonTypePreviewFor("timezone", button, { clockFormat: "12h" }));
  return clock24 !== clock12;
}), "world clock preview follows 12/24-hour formatting");

const weatherCurrentPreview = hooks.buttonTypePreviewFor("weather", {
  entity: "weather.forecast_home",
  type: "weather",
  precision: "",
});
assert(weatherCurrentPreview.iconHtml.includes("mdi-weather-cloudy"), "weather current preview uses the current-condition icon");
assert(weatherCurrentPreview.labelHtml.includes("mdi-weather-cloudy"), "weather current preview uses the weather badge");

const weatherForecastPreview = hooks.buttonTypePreviewFor("weather", {
  entity: "weather.forecast_home",
  label: "Garden",
  type: "weather",
  precision: "today",
  options: "large_numbers",
}, {
  cardSize: 4,
  temperatureUnit: "\u00b0F",
});
assert(weatherForecastPreview.iconHtml.includes("sp-forecast-value"), "weather forecast preview uses forecast value styling");
assert(weatherForecastPreview.iconHtml.includes("sp-sensor-preview-large"), "weather forecast preview supports large numbers");
assert(weatherForecastPreview.iconHtml.includes("\u00b0F"), "weather forecast preview uses the selected temperature unit");
assert(weatherForecastPreview.labelHtml.includes("Garden"), "weather forecast preview uses the custom label");

assert.strictEqual(hooks.normalizeScreensaverAction("Screen Dimmed"), "dim");
assert.strictEqual(hooks.previewHtmlValue({ labelHtml: "" }, "labelHtml", "fallback"), "");
assert.strictEqual(hooks.previewHtmlValue({}, "labelHtml", "fallback"), "fallback");
const backOnlySubpage = hooks.parseSubpageConfig(",,,,B");
hooks.buildSubpageGrid(backOnlySubpage);
assert.deepStrictEqual(plain(backOnlySubpage.buttons), []);
assert.strictEqual(backOnlySubpage.grid[4], -2);
assert.deepStrictEqual(plain(hooks.serializeSubpageGrid(backOnlySubpage)), ["", "", "", "", "B"]);
assert.strictEqual(hooks.serializeSubpageConfig(backOnlySubpage), ",,,,B");
assert.strictEqual(hooks.networkPreviewIconSlug("wifi", 24), "wifi-strength-1");
assert.strictEqual(hooks.networkPreviewIconSlug("wifi", 25), "wifi-strength-2");
assert.strictEqual(hooks.networkPreviewIconSlug("wifi", 50), "wifi-strength-3");
assert.strictEqual(hooks.networkPreviewIconSlug("wifi", 75), "wifi-strength-4");
assert.strictEqual(hooks.networkPreviewIconSlug("ethernet", 0), "ethernet");
assert.strictEqual(hooks.displayFirmwareVersion("v1.11.1"), "v1.11.1");
assert.strictEqual(hooks.displayFirmwareVersion("dev"), "Dev build");
assert.strictEqual(hooks.displayFirmwareVersion("0.0.0"), "Dev build");
assert.strictEqual(hooks.displayFirmwareVersion("main"), "Dev build");
assert.strictEqual(hooks.displayFirmwareVersion(""), "Version unknown");
assert.strictEqual(hooks.firmwareVersionFromMetadata({ firmware_version: "v1.12.0" }), "v1.12.0");
assert.strictEqual(hooks.firmwareVersionFromMetadata({ project_version: "v1.12.1" }), "v1.12.1");
assert.strictEqual(hooks.firmwareVersionFromMetadata({ version: "dev" }), "dev");
const publicManifest = {
  version: "v1.12.0",
  builds: [{
    chipFamily: "ESP32-P4",
    ota: {
      path: "guition-esp32-p4-jc1060p470.ota.bin",
      md5: "0123456789abcdef0123456789abcdef",
      release_url: "https://github.com/jtenniswood/espcontrol/releases/tag/v1.12.0",
    },
  }],
};
assert.deepStrictEqual(plain(hooks.firmwareInfoFromPublicManifest(publicManifest)), {
  latest_version: "v1.12.0",
  release_url: "https://github.com/jtenniswood/espcontrol/releases/tag/v1.12.0",
  ota_url: "https://jtenniswood.github.io/espcontrol/firmware/guition-esp32-p4-jc1060p470/guition-esp32-p4-jc1060p470.ota.bin",
  ota_filename: "guition-esp32-p4-jc1060p470.ota.bin",
  ota_md5: "0123456789abcdef0123456789abcdef",
});
assert.strictEqual(
  hooks.firmwareInfoFromPublicManifest({
    version: "v1.12.0",
    builds: [{ chipFamily: "ESP32-S3", ota: { path: "wrong-device.ota.bin" } }],
  }),
  null
);
assert.strictEqual(hooks.firmwareVersionLabelFor("", true), "Checking version...");
assert.strictEqual(hooks.firmwareVersionLabelFor("", false), "Version unknown");
assert.deepStrictEqual(plain(hooks.entityDetailPaths("text_sensor", hooks.entityLookupNames("firmware_version"))), [
  "/text_sensor/Firmware%3A%20Version?detail=all",
  "/text_sensor/firmware__version?detail=all",
  "/text_sensor/firmware_version?detail=all",
  "/text_sensor/firmware_version_sensor?detail=all",
]);
assert.deepStrictEqual(plain(hooks.entityLookupNames("firmware_version")), [
  "Firmware: Version",
  "firmware__version",
  "firmware_version",
  "firmware_version_sensor",
]);
assert.strictEqual(hooks.firmwareUpdateControlsVisibleFor("wifi", true), true);
assert.strictEqual(hooks.firmwareUpdateControlsVisibleFor("wifi", false), false);
assert.strictEqual(hooks.firmwareUpdateControlsVisibleFor("ethernet", true), true);
assert.strictEqual(
  hooks.firmwareVersionAfterUpdateInfo("Dev", { state: "NO UPDATE", latest_version: "v1.11.1" }).version,
  "v1.11.1"
);
assert.strictEqual(
  hooks.firmwareVersionAfterUpdateInfo("Dev", { state: "UPDATE AVAILABLE", latest_version: "v1.11.1" }).version,
  "Dev build"
);
assert.strictEqual(
  hooks.firmwareVersionAfterUpdateInfo("v1.10.0", { state: "NO UPDATE", latest_version: "v1.11.1" }).version,
  "v1.10.0"
);
assert.deepStrictEqual(plain(hooks.firmwareStateAfterPublicManifest("Dev", publicManifest)), {
  version: "Dev build",
  latest: "v1.12.0",
  updateState: "",
  releaseUrl: "https://github.com/jtenniswood/espcontrol/releases/tag/v1.12.0",
  updateAvailable: false,
  installAvailable: true,
});
assert.strictEqual(
  hooks.firmwareStateAfterPublicManifest("v1.12.0", publicManifest).installAvailable,
  false
);

console.log("Web UI smoke tests passed.");
