#!/usr/bin/env node
"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const MODEL_JS = path.join(ROOT, "src", "webserver", "modules", "model_generated.js");

function loadModel() {
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(MODEL_JS, "utf8"), sandbox, { filename: MODEL_JS });
  assert(sandbox.EspControlModel, "EspControlModel was not exported");
  return sandbox.EspControlModel;
}

const model = loadModel();

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

assert.deepStrictEqual(plain(model.parseGridOrder("1,2d,3w", 8, 4)), {
  grid: [1, 2, 3, -1, 0, -1, 0, 0],
  sizes: { 2: 2, 3: 3 },
}, "grid order parsing preserves size tokens and spans");
assert.strictEqual(
  model.serializeGridOrder([1, 2, 3, -1, 0, -1, 0, 0], { 2: 2, 3: 3 }),
  "1,2d,3w",
  "grid serialization preserves sparse spanned layout"
);

assert.deepStrictEqual(plain(model.parseSubpageOrder("1,B=Return%3AHome,2d")), {
  order: ["1", "B", "2d"],
  backLabel: "Return:Home",
}, "subpage order parsing decodes back labels");
const subpageGrid = model.buildSubpageGrid({
  order: ["1", "B", "2w"],
  buttons: [{ label: "One" }, { label: "Two" }],
  sizes: {},
}, 8, 4);
assert.deepStrictEqual(plain(subpageGrid.grid), [1, -2, 2, -1, 0, 0, 0, 0], "subpage grid includes explicit back button");
assert.deepStrictEqual(plain(subpageGrid.sizes), { 2: 3 }, "subpage grid preserves button sizes");
assert.deepStrictEqual(
  plain(
  model.serializeSubpageGrid(subpageGrid.grid, subpageGrid.sizes, "Return"),
  ),
  ["1", "B=Return", "2w"],
  "subpage grid serializes back label and size tokens"
);

const layoutPlan = model.planBackupButtonLayout([
  { entity: "light.kitchen", label: "Kitchen" },
  { entity: "weather.home", label: "Weather", type: "weather" },
  { entity: "climate.hall", label: "Hall", type: "climate" },
  {},
], "2w,1,3", 2, 4);
assert.strictEqual(layoutPlan.importedCount, 4, "backup layout records source slot count");
assert.deepStrictEqual(plain(layoutPlan.slotMap), { 1: 2, 2: 1 }, "backup layout maps old slots to new slots");
assert.strictEqual(layoutPlan.button_order, "1w", "backup layout serializes adapted order");
assert.deepStrictEqual(plain(layoutPlan.importedSizes), { 1: 3 }, "backup layout keeps fitting size tokens");
assert.strictEqual(layoutPlan.buttons[0].entity, "weather.home", "backup layout follows saved order first");
assert.strictEqual(layoutPlan.buttons[1].entity, "light.kitchen", "backup layout fills target slots in order");

assert.strictEqual(model.normalizeTemperatureUnit("fahrenheit"), "\u00B0F", "temperature unit normalization");
assert.strictEqual(model.normalizeScheduleWakeTimeout(1), 10, "wake timeout minimum");
assert.strictEqual(model.normalizeScheduleClockBrightness(0), 10, "schedule clock brightness fallback");
assert.deepStrictEqual(
  plain(model.normalizeBackupScreenSettings({
    brightness_day: "88",
    brightness_night: "55",
    automatic_brightness: false,
    schedule_enabled: true,
    schedule_on_hour: 7,
    schedule_off_hour: 22,
    schedule_mode: "clock",
    schedule_wake_timeout: 30,
  }, {
    scheduleWakeBrightness: 70,
    scheduleDimmedBrightness: 12,
    scheduleClockBrightness: 40,
  })),
  {
    brightnessDayVal: 88,
    brightnessNightVal: 55,
    automaticBrightnessEnabled: false,
    scheduleEnabled: true,
    scheduleOnHour: 7,
    scheduleOffHour: 22,
    scheduleMode: "clock",
    scheduleWakeTimeout: 30,
    scheduleWakeBrightness: 70,
    scheduleDimmedBrightness: 12,
    scheduleClockBrightness: 40,
  },
  "backup screen settings normalize with current-value fallbacks"
);

const panelSettings = model.normalizeBackupPanelSettings({
  temperature_unit: "centigrade",
  clock_format: "24h",
  ntp_server_1: "pool.ntp.org",
  month_names: "Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec",
  screensaver_mode: "timer",
  screensaver_action: "Screen Dimmed",
  clock_brightness_day: 44,
  clock_brightness_night: 22,
  screen_rotation: "90",
}, {
  timezone: "UTC (GMT+0)",
  clockFormat: "12h",
  clockFormatOptions: ["12h", "24h"],
  developerExperimentalFeatures: false,
  ntpDefaults: ["0.pool.ntp.org", "1.pool.ntp.org", "2.pool.ntp.org"],
  ntpServer1: "0.pool.ntp.org",
  ntpServer2: "1.pool.ntp.org",
  ntpServer3: "2.pool.ntp.org",
  monthNames: model.MONTH_NAME_DEFAULTS,
  screenRotationOptions: ["0", "90", "180", "270"],
});
assert.strictEqual(panelSettings.temperatureUnit, "\u00B0C", "panel temperature unit normalizes");
assert.strictEqual(panelSettings.clockFormat, "24h", "panel clock format validates against options");
assert.strictEqual(panelSettings.ntpServer1, "pool.ntp.org", "panel NTP server imports");
assert.strictEqual(panelSettings.monthNames[0], "Jan", "panel month names import");
assert.strictEqual(panelSettings.screensaverMode, "timer", "panel screensaver mode imports");
assert.strictEqual(panelSettings.screensaverAction, "dim", "panel screensaver action imports");
assert.strictEqual(panelSettings.clockBrightnessDay, 44, "panel day clock brightness imports");
assert.strictEqual(panelSettings.clockBrightnessNight, 22, "panel night clock brightness imports");
assert.strictEqual(panelSettings.screenRotation, "90", "panel rotation validates against options");

console.log("Model contract tests passed.");
