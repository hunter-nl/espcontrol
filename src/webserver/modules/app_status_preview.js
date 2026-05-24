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
  var show = state.clockBarOn && (state._indoorOn || state._outdoorOn);
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
