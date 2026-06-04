// ── Clock (minute-aligned) ─────────────────────────────────────────────

function getTzId(tz) {
  var idx = tz.indexOf(" (");
  return idx > 0 ? tz.substring(0, idx) : tz;
}

function formatGmtOffset(minutes) {
  var sign = minutes >= 0 ? "+" : "-";
  var abs = Math.abs(minutes);
  var h = Math.floor(abs / 60);
  var m = abs % 60;
  return "GMT" + sign + h + (m ? ":" + String(m).padStart(2, "0") : "");
}

function timezoneOffsetMinutes(tzId, date) {
  try {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tzId,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit"
    }).formatToParts(date);
    var values = {};
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type !== "literal") values[parts[i].type] = parts[i].value;
    }
    var localAsUtc = Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
      Number(values.hour),
      Number(values.minute),
      Number(values.second)
    );
    return Math.round((localAsUtc - date.getTime()) / 60000);
  } catch (_) {
    return null;
  }
}

function formatTimezoneOption(opt) {
  var tzId = getTzId(opt);
  var offset = timezoneOffsetMinutes(tzId, new Date());
  if (offset == null || !isFinite(offset)) return opt;
  return tzId + " (" + formatGmtOffset(offset) + ")";
}

function appendTimezoneOption(select, opt) {
  var o = document.createElement("option");
  o.value = opt;
  o.textContent = formatTimezoneOption(opt);
  select.appendChild(o);
}

function updateClock() {
  if (!els.clock) return;
  var now = new Date();
  var tzId = getTzId(state.timezone);
  try {
    var parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tzId, hour: "numeric", minute: "2-digit",
      hour12: state.clockFormat === "12h"
    }).formatToParts(now);
    var h = "", m = "";
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === "hour") h = parts[i].value;
      else if (parts[i].type === "minute") m = parts[i].value;
    }
    els.clock.textContent = (state.clockFormat === "24h"
      ? h.padStart(2, "0") : h) + ":" + m;
  } catch (_) {
    var hr = now.getUTCHours();
    var mn = String(now.getUTCMinutes()).padStart(2, "0");
    els.clock.textContent = String(hr).padStart(2, "0") + ":" + mn;
  }
  var msToNext = (60 - now.getSeconds()) * 1000 - now.getMilliseconds();
  setTimeout(updateClock, msToNext + 50);
}

function clockBarTemperatureActive() {
  return !!(state._indoorOn || state._outdoorOn);
}

function clockBarItemActive(item) {
  if (item === "temperature") return clockBarTemperatureActive();
  if (item === "time") return !!state.clockBarTimeOn;
  if (item === "network") return !!state.networkStatusOn;
  return false;
}

function clockBarItemElement(item) {
  if (item === "temperature") return els.clockBarTempItem;
  if (item === "time") return els.clockBarTimeItem;
  if (item === "network") return els.clockBarNetworkItem;
  return null;
}

function clockBarItemLabel(item) {
  if (item === "temperature") return "Temperature";
  if (item === "time") return "Time";
  if (item === "network") return "Network Status";
  return "Clock Bar";
}

function syncClockBarItemElement(item) {
  var el = clockBarItemElement(item);
  if (!el) return;
  var active = clockBarItemActive(item);
  el.className = el.className
    .replace(/\s?sp-clockbar-inactive/g, "")
    .replace(/\s?sp-selected/g, "");
  if (!active) el.className += " sp-clockbar-inactive";
  if (state.clockBarSelectedItem === item) el.className += " sp-selected";
  el.setAttribute("aria-pressed", state.clockBarSelectedItem === item ? "true" : "false");
  el.setAttribute("title", active ? "Edit " + clockBarItemLabel(item) : "Add " + clockBarItemLabel(item));
}

function updateClockBarItemUi() {
  syncClockBarItemElement("temperature");
  syncClockBarItemElement("time");
  syncClockBarItemElement("network");
}

function setClockBarItemSelected(item, open) {
  state.clockBarSelectedItem = item || "";
  if (item) {
    ctx().setSelected([]);
    ctx().setLastClicked(-1);
  }
  updateClockBarItemUi();
  renderPreview();
  renderButtonSettings(!!open);
}

function addClockBarItem(item) {
  if (isConfigLocked()) return;
  if (item === "temperature") {
    var restoreIndoor = !!state.clockBarTempRestoreIndoor;
    var restoreOutdoor = !!state.clockBarTempRestoreOutdoor;
    if (!restoreIndoor && !restoreOutdoor) restoreOutdoor = true;
    state._indoorOn = restoreIndoor;
    state._outdoorOn = restoreOutdoor;
    postSwitch(entityName("indoor_temp_enable"), state._indoorOn);
    postSwitch(entityName("outdoor_temp_enable"), state._outdoorOn);
    syncTemperatureUi();
    updateTempPreview();
  } else if (item === "time") {
    state.clockBarTimeOn = true;
    postClockBarTime(true);
    syncClockBarUi();
  } else if (item === "network") {
    state.networkStatusOn = true;
    postNetworkStatusIcon(true);
    syncClockBarUi();
  }
}

function deleteClockBarItem(item) {
  if (isConfigLocked()) return;
  if (item === "temperature") {
    state.clockBarTempRestoreIndoor = !!state._indoorOn;
    state.clockBarTempRestoreOutdoor = !!state._outdoorOn;
    state._indoorOn = false;
    state._outdoorOn = false;
    postSwitch(entityName("indoor_temp_enable"), false);
    postSwitch(entityName("outdoor_temp_enable"), false);
    syncTemperatureUi();
    updateTempPreview();
  } else if (item === "time") {
    state.clockBarTimeOn = false;
    postClockBarTime(false);
    syncClockBarUi();
  } else if (item === "network") {
    state.networkStatusOn = false;
    postNetworkStatusIcon(false);
    syncClockBarUi();
  }
  state.clockBarSelectedItem = "";
  hideSettingsOverlay();
  updateClockBarItemUi();
}

function syncInput(el, val) {
  if (el && document.activeElement !== el) el.value = val;
}

function gridHasAny() {
  for (var i = 0; i < NUM_SLOTS; i++) { if (state.grid[i] > 0) return true; }
  return false;
}

function scheduleMigration() {
  if (orderReceived || gridHasAny()) return;
  clearTimeout(migrationTimer);
  migrationTimer = setTimeout(function () {
    if (orderReceived || gridHasAny()) return;
    var pos = 0;
    for (var i = 0; i < NUM_SLOTS; i++) {
      if (state.buttons[i].entity && pos < NUM_SLOTS) {
        state.grid[pos] = i + 1;
        pos++;
      }
    }
    if (pos > 0) {
      renderPreview();
      renderButtonSettings();
      postText(entityName("button_order"), serializeGrid(state.grid));
    }
  }, 2000);
}

function updateSunInfo() {
  var el = els.sunInfo;
  if (!el) return;
  if (!state.sunrise && !state.sunset) {
    el.classList.remove("sp-visible");
    return;
  }
  el.classList.add("sp-visible");
  var t = "";
  if (state.sunrise) t += "Sunrise: " + escHtml(state.sunrise);
  if (state.sunrise && state.sunset) t += " \u00a0/\u00a0 ";
  if (state.sunset) t += "Sunset: " + escHtml(state.sunset);
  el.innerHTML = t;
}

function updateTempPreview() {
  if (!els.temp) return;
  var show = state.clockBarOn && clockBarTemperatureActive();
  els.temp.className = "sp-temp" + (show ? " sp-visible" : "");
  var unit = clockBarTemperatureUnitSymbol();
  var indoor = state._indoorVal != null ? state._indoorVal : "24";
  var outdoor = state._outdoorVal != null ? state._outdoorVal : "17";
  if (state._indoorOn && state._outdoorOn) {
    els.temp.textContent = outdoor + unit + " / " + indoor + unit;
  } else if (state._outdoorOn) {
    els.temp.textContent = outdoor + unit;
  } else if (state._indoorOn) {
    els.temp.textContent = indoor + unit;
  }
}

function normalizeNetworkTransport(value) {
  value = String(value == null ? "" : value).trim().toLowerCase();
  return value === "ethernet" ? "ethernet" : "wifi";
}

function normalizeWifiStrengthPercent(value) {
  var n = parseFloat(value);
  if (!isFinite(n)) return 100;
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function networkPreviewIconSlug(transport, strengthPercent) {
  if (normalizeNetworkTransport(transport) === "ethernet") return "ethernet";
  var strength = normalizeWifiStrengthPercent(strengthPercent);
  if (strength < 25) return "wifi-strength-1";
  if (strength < 50) return "wifi-strength-2";
  if (strength < 75) return "wifi-strength-3";
  return "wifi-strength-4";
}

function updateNetworkPreview() {
  if (!els.networkPreview) return;
  var show = state.clockBarOn && state.networkStatusOn;
  els.networkPreview.className = "sp-network-preview mdi mdi-" +
    networkPreviewIconSlug(state.networkTransport, state.wifiStrengthPercent) +
    (show ? " sp-visible" : "");
}
