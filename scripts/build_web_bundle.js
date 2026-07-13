#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");
const { loadBundledWebSource } = require("./web_source");

const ROOT = path.resolve(__dirname, "..");
const CONFIG_START = "__DEVICE_CONFIG_START__";
const CONFIG_END = "__DEVICE_CONFIG_END__";

function replaceDeviceConfig(source) {
  const pattern = new RegExp(
    `(^[^\\n]*${CONFIG_START}[^\\n]*\\n)(.*?)(^[^\\n]*${CONFIG_END}[^\\n]*$)`,
    "ms",
  );
  const match = source.match(pattern);
  if (!match) throw new Error("Device config markers are missing from the web entry");
  const replacement = "  var DEVICE_ID = deviceId;\n  var CFG = deviceConfig;\n";
  const directImports = `import { deviceId, deviceConfig } from "./src/webserver/device_config.ts";
import * as EspControlModel from "./src/webserver/model/index.ts";
import {
  configOptionEnabled,
  configOptionValue,
  setConfigOption,
  setConfigOptionValue,
} from "./src/webserver/model/config_primitives.ts";
import {
  CARD_CONFIG_FIELDS,
  CARD_CONTRACT_BRIGHTNESS_SLIDER_TYPES,
  CARD_CONTRACT_CARDS,
  CARD_CONTRACT_FAN_DEFAULT_ICONS,
  CARD_CONTRACT_FAN_DEFAULT_ICON_ON,
  CARD_CONTRACT_LARGE_NUMBERS,
  CARD_CONTRACT_MIGRATION_ALIASES,
  CARD_CONTRACT_OPTION_NAMES,
  CARD_CONTRACT_OPTION_SELECT_ACTION,
  CARD_CONTRACT_OPTION_SELECT_ACTIONS,
  CARD_CONTRACT_SUBPAGE_TYPES_BY_CODE,
  CARD_CONTRACT_SUBPAGE_TYPE_CODES,
  cardContractAllowInSubpage,
  cardContractCard,
  cardContractCardKeys,
  cardContractCardLabel,
  cardContractDefaultConfig,
  cardContractDomains,
  cardContractFanDefaultIcon,
  cardContractFanDefaultIconOn,
  cardContractHidden,
  cardContractIsBrightnessSliderType,
  cardContractIsFanCardType,
  cardContractIsOptionSelectAction,
  cardContractIsOptionSelectType,
  cardContractLargeNumbersSupported,
  cardContractMigrationAlias,
  cardContractOptionName,
  cardContractOptions,
  cardContractPickerKey,
  cardContractSubpageTypeCode,
  cardContractSubpageTypeFromCode,
} from "./src/webserver/generated/card_contract.ts";
`;
  return `${directImports}${
    source.slice(0, match.index + match[1].length)
  }${replacement}${source.slice(match.index + match[1].length + match[2].length)}`;
}

async function bundleDevice(slug, config) {
  const result = await esbuild.build({
    bundle: true,
    define: {
      __ESPCONTROL_DEVICE_ID__: JSON.stringify(slug),
      __ESPCONTROL_DEVICE_CONFIG__: JSON.stringify(config),
    },
    format: "iife",
    logLevel: "silent",
    minify: true,
    platform: "browser",
    stdin: {
      contents: replaceDeviceConfig(loadBundledWebSource()),
      loader: "js",
      resolveDir: ROOT,
      sourcefile: "src/webserver/entry.js",
    },
    target: "es2020",
    write: false,
  });
  if (result.outputFiles.length !== 1) throw new Error(`${slug}: esbuild returned an unexpected output set`);
  return result.outputFiles[0].text;
}

async function main() {
  const request = JSON.parse(fs.readFileSync(0, "utf8"));
  if (!request.outputDir || !request.devices) throw new Error("Expected outputDir and devices");
  for (const [slug, config] of Object.entries(request.devices)) {
    const outputPath = path.join(request.outputDir, slug, "www.js");
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, await bundleDevice(slug, config));
  }
}

main().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exit(1);
});
