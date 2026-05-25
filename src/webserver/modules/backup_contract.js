// ── Backup contract ───────────────────────────────────────────────────

var BACKUP_CONFIG_VERSION = 2;
var BACKUP_FORMAT = "espcontrol.backup";

function backupConfigError(message) {
  var err = new Error(message);
  err.backupMessage = message;
  return err;
}

function backupEmptyButtonConfig() {
  return EspControlModel.emptyCardConfig();
}

function backupNormalizeButtonConfig(button) {
  return normalizeButtonConfig(EspControlModel.cloneCardConfig(button || {}));
}

function backupSerializeGrid(grid, sizes) {
  sizes = sizes || {};
  var last = -1;
  for (var i = grid.length - 1; i >= 0; i--) {
    if (grid[i] > 0) {
      last = i;
      break;
    }
  }
  if (last < 0) return "";
  return grid.slice(0, last + 1).map(function (slot) {
    if (slot <= 0) return "";
    return slot + sizeToken(sizes[slot]);
  }).join(",");
}

function backupSerializeSubpages(subpages) {
  var out = {};
  subpages = subpages || {};
  for (var key in subpages) {
    var sp = subpages[key];
    if (!sp) continue;
    var hasButtons = sp.buttons && sp.buttons.length > 0;
    var hasOrder = (sp.order && sp.order.length > 0) || (sp.grid && sp.grid.length > 0);
    if (hasButtons || hasOrder) out[key] = serializeSubpageConfig(sp);
  }
  return out;
}

function backupSource(data, slots) {
  var source = data && data.source && typeof data.source === "object" ? data.source : {};
  return {
    device: String(source.device || data.device || ""),
    slots: parseInt(source.slots, 10) || slots || 0,
  };
}

function createBackupConfig(snapshot) {
  snapshot = snapshot || {};
  var buttons = (snapshot.buttons || []).map(backupNormalizeButtonConfig);
  var slots = parseInt(snapshot.slots, 10) || buttons.length;
  return {
    version: BACKUP_CONFIG_VERSION,
    format: BACKUP_FORMAT,
    device: snapshot.device || "",
    source: {
      device: snapshot.device || "",
      slots: slots,
    },
    exported_at: snapshot.exported_at || new Date().toISOString(),
    button_order: snapshot.button_order != null
      ? String(snapshot.button_order)
      : backupSerializeGrid(snapshot.grid || [], snapshot.sizes || {}),
    button_on_color: snapshot.button_on_color || "FF8C00",
    button_off_color: snapshot.button_off_color || "313131",
    sensor_card_color: snapshot.sensor_card_color || "212121",
    buttons: buttons,
    subpages: backupSerializeSubpages(snapshot.subpages),
    settings: snapshot.settings || {},
    screen: snapshot.screen || {},
  };
}

function normalizeBackupConfig(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw backupConfigError("Invalid config file - backup must be a JSON object");
  }

  var version = parseInt(data.version, 10);
  if (!version || version < 1) {
    throw backupConfigError("Invalid config file - missing required fields");
  }
  if (version > BACKUP_CONFIG_VERSION) {
    throw backupConfigError("Backup was created by a newer version of EspControl");
  }
  if (version >= 2 && data.format !== BACKUP_FORMAT) {
    throw backupConfigError("Invalid config file - unsupported backup format");
  }
  if (!Array.isArray(data.buttons)) {
    throw backupConfigError("Invalid config file - missing required fields");
  }

  var buttons = data.buttons.map(backupNormalizeButtonConfig);
  var subpages = {};
  if (data.subpages && typeof data.subpages === "object") {
    for (var key in data.subpages) {
      var parsed = parseSubpageConfig(String(data.subpages[key] || ""));
      subpages[key] = serializeSubpageConfig(parsed);
    }
  }

  return {
    version: BACKUP_CONFIG_VERSION,
    format: BACKUP_FORMAT,
    device: String(data.device || ""),
    source: backupSource(data, buttons.length),
    exported_at: data.exported_at || "",
    button_order: String(data.button_order || ""),
    button_on_color: data.button_on_color || "FF8C00",
    button_off_color: data.button_off_color || "313131",
    sensor_card_color: data.sensor_card_color || "212121",
    buttons: buttons,
    subpages: subpages,
    settings: data.settings && typeof data.settings === "object" ? data.settings : null,
    screen: data.screen && typeof data.screen === "object"
      ? data.screen
      : (data.settings && data.settings.screen && typeof data.settings.screen === "object"
        ? data.settings.screen
        : null),
  };
}

function backupOrderUsedSlots(order, importedCount) {
  var parts = String(order || "").split(",");
  var usedSlots = [];
  var seen = {};
  for (var i = 0; i < parts.length; i++) {
    var token = parts[i].trim();
    if (!token) continue;
    var lastCh = token.charAt(token.length - 1);
    var parsedSize = sizeFromToken(lastCh);
    var num = parseInt(token, 10);
    if (isNaN(num) || num < 1 || num > importedCount || seen[num]) continue;
    seen[num] = true;
    usedSlots.push({ oldSlot: num, size: parsedSize });
  }
  return { usedSlots: usedSlots, seen: seen };
}

function backupPlaceSlotAt(grid, slot, pos, size, maxSlots) {
  grid[pos] = slot;
  if (size > 1) {
    var covered = coveredCells(pos, size, maxSlots, false);
    for (var i = 0; i < covered.length; i++) {
      if (covered[i] >= 0 && covered[i] < maxSlots) grid[covered[i]] = -1;
    }
  }
}

function planBackupImport(data, targetDevice) {
  var config = normalizeBackupConfig(data);
  targetDevice = targetDevice || {};
  var targetSlots = parseInt(targetDevice.slots, 10) || NUM_SLOTS;
  var targetDeviceId = targetDevice.device || DEVICE_ID;
  var importedCount = config.buttons.length;
  var warnings = [];
  var empty = backupEmptyButtonConfig();
  var buttons = [];
  var importedSizes = {};
  var orderStr = "";
  var spKeyMap = {};

  if (config.device && config.device !== targetDeviceId) {
    warnings.push("Config was exported from a different panel (" + config.device + ") - layout may look different");
  }
  if (importedCount !== targetSlots) {
    warnings.push("Backup has " + importedCount + " slots, current config has " + targetSlots + " - adapting");
  }

  if (importedCount !== targetSlots) {
    var orderInfo = backupOrderUsedSlots(config.button_order, importedCount);
    var usedSlots = orderInfo.usedSlots;
    var seen = orderInfo.seen;
    for (var j = 0; j < importedCount; j++) {
      var slotNum = j + 1;
      if (seen[slotNum]) continue;
      var button = config.buttons[j] || empty;
      if (button.entity || button.label || button.type) {
        usedSlots.push({ oldSlot: slotNum, size: 1 });
      }
    }

    var limit = Math.min(usedSlots.length, targetSlots);
    var slotMap = {};
    for (var u = 0; u < limit; u++) {
      var newSlot = u + 1;
      slotMap[usedSlots[u].oldSlot] = newSlot;
      buttons.push(config.buttons[usedSlots[u].oldSlot - 1] || empty);
      if (usedSlots[u].size > 1) importedSizes[newSlot] = usedSlots[u].size;
    }
    for (var fill = limit; fill < targetSlots; fill++) buttons.push(empty);

    var newGrid = [];
    for (var g = 0; g < targetSlots; g++) newGrid.push(0);
    var pos = 0;
    for (var p = 0; p < limit && pos < targetSlots; p++) {
      var ns = p + 1;
      var targetSize = importedSizes[ns] || 1;
      if (!sizeFitsAt(pos, targetSize, targetSlots)) {
        targetSize = 1;
        delete importedSizes[ns];
      }
      backupPlaceSlotAt(newGrid, ns, pos, targetSize, targetSlots);
      pos++;
      while (pos < targetSlots && newGrid[pos] === -1) pos++;
    }
    orderStr = backupSerializeGrid(newGrid, importedSizes);

    for (var key in config.subpages) {
      var oldKey = parseInt(key, 10);
      if (slotMap[oldKey]) spKeyMap[key] = slotMap[oldKey];
    }
  } else {
    for (var i = 0; i < targetSlots; i++) {
      buttons.push(i < importedCount ? config.buttons[i] : empty);
    }
    orderStr = config.button_order || "";
    for (var spKey in config.subpages) {
      var keyNum = parseInt(spKey, 10);
      if (keyNum >= 1 && keyNum <= targetSlots) spKeyMap[spKey] = keyNum;
    }
  }

  var subpages = {};
  for (var sourceKey in config.subpages) {
    var mappedKey = spKeyMap[sourceKey];
    if (!mappedKey) continue;
    var subpage = parseSubpageConfig(config.subpages[sourceKey]);
    subpage.sizes = {};
    buildSubpageGrid(subpage);
    subpages[String(mappedKey)] = subpage;
  }

  return {
    config: config,
    warnings: warnings,
    importedCount: importedCount,
    buttons: buttons.map(backupNormalizeButtonConfig),
    button_order: orderStr,
    importedSizes: importedSizes,
    subpages: subpages,
    settings: config.settings,
    screen: config.screen,
  };
}
