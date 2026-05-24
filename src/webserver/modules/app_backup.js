// ── Export / Import ────────────────────────────────────────────────────

function exportConfig() {
  var data = createBackupConfig({
    device: DEVICE_ID,
    slots: NUM_SLOTS,
    exported_at: new Date().toISOString(),
    grid: state.grid,
    sizes: state.sizes,
    button_order: serializeGrid(state.grid),
    button_on_color: state.onColor,
    button_off_color: state.offColor,
    sensor_card_color: state.sensorColor,
    buttons: state.buttons,
    subpages: state.subpages,
    settings: {
      indoor_temp_enable: state._indoorOn,
      outdoor_temp_enable: state._outdoorOn,
      indoor_temp_entity: state.indoorEntity,
      outdoor_temp_entity: state.outdoorEntity,
      temperature_unit: normalizeTemperatureUnit(state.temperatureUnit),
      clock_bar: state.clockBarOn,
      network_status_icon: state.networkStatusOn,
      temperature_degree_symbol: state.temperatureDegreeSymbolOn,
      timezone: state.timezone,
      clock_format: state.clockFormat,
      ntp_server_1: state.ntpServer1,
      ntp_server_2: state.ntpServer2,
      ntp_server_3: state.ntpServer3,
      month_names: serializeMonthNames(state.monthNames),
      screensaver_mode: getActiveScreensaverMode(),
      presence_sensor_entity: state.presenceEntity,
      media_player_sleep_prevention: state.mediaPlayerSleepPreventionOn,
      media_player_sleep_prevention_entity: state.mediaPlayerSleepPreventionEntity,
      screensaver_action: normalizeScreensaverAction(state.screensaverAction),
      clock_screensaver: state.clockScreensaverOn,
      clock_brightness: state.clockBrightnessDay,
      clock_brightness_day: state.clockBrightnessDay,
      clock_brightness_night: state.clockBrightnessNight,
      screensaver_dimmed_brightness: normalizeScreensaverDimmedBrightness(state.screensaverDimmedBrightness),
      screensaver_timeout: state.screensaverTimeout,
      home_screen_timeout: state.homeScreenTimeout,
      screen_rotation: state.screenRotation,
      developer_experimental_features: state.developerExperimentalFeatures,
    },
    screen: {
      brightness_day: Math.round(state.brightnessDayVal),
      brightness_night: Math.round(state.brightnessNightVal),
      automatic_brightness: !!state.automaticBrightnessEnabled,
      schedule_enabled: !!state.scheduleEnabled,
      schedule_on_hour: normalizeHour(state.scheduleOnHour, 6),
      schedule_off_hour: normalizeHour(state.scheduleOffHour, 23),
      schedule_mode: normalizeScheduleMode(state.scheduleMode),
      schedule_wake_timeout: normalizeScheduleWakeTimeout(state.scheduleWakeTimeout),
      schedule_wake_brightness: normalizeScheduleWakeBrightness(state.scheduleWakeBrightness),
      schedule_dimmed_brightness: normalizeScheduleDimmedBrightness(state.scheduleDimmedBrightness),
      schedule_clock_brightness: normalizeScheduleClockBrightness(state.scheduleClockBrightness),
    },
  });

  var json = JSON.stringify(data, null, 2);
  var blob = new Blob([json], { type: "application/json" });
  var url = URL.createObjectURL(blob);
  var now = new Date();
  var name = "espcontrol-config-" +
    now.getFullYear() + "-" +
    String(now.getMonth() + 1).padStart(2, "0") + "-" +
    String(now.getDate()).padStart(2, "0") + ".json";
  var a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function importConfig() {
  var input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";
  input.style.display = "none";

  function cleanupInput() {
    if (input.parentNode) input.parentNode.removeChild(input);
  }

  input.addEventListener("cancel", cleanupInput);
  input.addEventListener("change", function () {
    if (!input.files || !input.files[0]) {
      cleanupInput();
      return;
    }
    var reader = new FileReader();
    reader.onerror = function () {
      cleanupInput();
      showBanner("Invalid file \u2014 could not read backup", "error");
    };
    reader.onload = function () {
      var data;
      try { data = JSON.parse(reader.result); } catch (_) {
        showBanner("Invalid file \u2014 could not parse JSON", "error");
        cleanupInput();
        return;
      }

      var backupPlan;
      try {
        backupPlan = planBackupImport(data, { device: DEVICE_ID, slots: NUM_SLOTS });
      } catch (e) {
        showBanner(e.backupMessage || "Invalid config file \u2014 missing required fields", "error");
        cleanupInput();
        return;
      }
      for (var warningIdx = 0; warningIdx < backupPlan.warnings.length; warningIdx++) {
        showBanner(backupPlan.warnings[warningIdx], "warning");
      }

      postText(entityName("button_on_color"), backupPlan.config.button_on_color);
      postText(entityName("button_off_color"), backupPlan.config.button_off_color);
      postText(entityName("sensor_card_color"), backupPlan.config.sensor_card_color);

      for (var i = 0; i < NUM_SLOTS; i++) {
        var b = backupPlan.buttons[i];
        var n = i + 1;
        state.buttons[i] = backupNormalizeButtonConfig(b);
        saveButtonConfig(n);
      }

      state.subpages = {};
      state.subpageRaw = {};
      for (var subpageKey in backupPlan.subpages) {
        state.subpages[subpageKey] = backupPlan.subpages[subpageKey];
        saveSubpageEntity(subpageKey);
      }

      postText(entityName("button_order"), backupPlan.button_order);
      applyImportedButtonOrder(backupPlan.button_order, backupPlan.importedSizes);
      state.onColor = backupPlan.config.button_on_color;
      state.offColor = backupPlan.config.button_off_color;
      state.sensorColor = backupPlan.config.sensor_card_color;

      if (els.setOnColor && els.setOnColor._syncColor) els.setOnColor._syncColor(state.onColor);
      if (els.setOffColor && els.setOffColor._syncColor) els.setOffColor._syncColor(state.offColor);
      if (els.setSensorColor && els.setSensorColor._syncColor) els.setSensorColor._syncColor(state.sensorColor);

      if (backupPlan.settings) {
        var s = backupPlan.settings;

        postSwitch(entityName("indoor_temp_enable"), !!s.indoor_temp_enable);
        postSwitch(entityName("outdoor_temp_enable"), !!s.outdoor_temp_enable);
        postText(entityName("indoor_temp_entity"), s.indoor_temp_entity || "");
        postText(entityName("outdoor_temp_entity"), s.outdoor_temp_entity || "");
        postClockBar(s.clock_bar != null ? !!s.clock_bar : false);
        postNetworkStatusIcon(s.network_status_icon != null ? !!s.network_status_icon : true);
        postTemperatureDegreeSymbol(s.temperature_degree_symbol != null ? !!s.temperature_degree_symbol : true);
        var importedTimezone = s.timezone || state.timezone;
        var importedTemperatureUnit = normalizeTemperatureUnit(s.temperature_unit);
        var importedClockFormat =
          state.clockFormatOptions.indexOf(s.clock_format) !== -1
            ? s.clock_format
            : state.clockFormat;
        var hasNtpServer1 = Object.prototype.hasOwnProperty.call(s, "ntp_server_1");
        var hasNtpServer2 = Object.prototype.hasOwnProperty.call(s, "ntp_server_2");
        var hasNtpServer3 = Object.prototype.hasOwnProperty.call(s, "ntp_server_3");
        var hasMonthNames = Object.prototype.hasOwnProperty.call(s, "month_names");
        var hasDeveloperExperimentalFeatures =
          Object.prototype.hasOwnProperty.call(s, "developer_experimental_features");
        var importedDeveloperExperimentalFeatures = hasDeveloperExperimentalFeatures
          ? !!s.developer_experimental_features
          : state.developerExperimentalFeatures;
        var importedNtpServer1 = hasNtpServer1
          ? normalizeNtpServer(s.ntp_server_1, NTP_SERVER_DEFAULTS[0])
          : state.ntpServer1;
        var importedNtpServer2 = hasNtpServer2
          ? normalizeNtpServer(s.ntp_server_2, NTP_SERVER_DEFAULTS[1])
          : state.ntpServer2;
        var importedNtpServer3 = hasNtpServer3
          ? normalizeNtpServer(s.ntp_server_3, NTP_SERVER_DEFAULTS[2])
          : state.ntpServer3;
        var importedMonthNames = hasMonthNames
          ? normalizeMonthNames(s.month_names)
          : state.monthNames;
        if (s.timezone) postSelect(entityName("screen_timezone"), importedTimezone);
        postSelect(entityName("screen_temperature_unit"), importedTemperatureUnit);
        if (s.clock_format) postSelect(entityName("screen_clock_format"), importedClockFormat);
        if (hasNtpServer1) {
          postText(entityName("screen_ntp_server_1"), importedNtpServer1);
        }
        if (hasNtpServer2) {
          postText(entityName("screen_ntp_server_2"), importedNtpServer2);
        }
        if (hasNtpServer3) {
          postText(entityName("screen_ntp_server_3"), importedNtpServer3);
        }
        if (hasMonthNames) {
          postText(entityName("screen_month_names"), serializeMonthNames(importedMonthNames));
        }
        var importedScreensaverMode = s.screensaver_mode || "disabled";
        if (importedScreensaverMode !== "sensor" &&
            importedScreensaverMode !== "timer" &&
            importedScreensaverMode !== "disabled") {
          importedScreensaverMode = "disabled";
        }
        postText(entityName("screensaver_mode"), importedScreensaverMode);
        postText(entityName("presence_sensor_entity"), s.presence_sensor_entity || "");
        postSwitch(entityName("screen_saver_media_player_sleep_prevention"), !!s.media_player_sleep_prevention);
        postText(entityName("media_player_sleep_prevention_entity"), s.media_player_sleep_prevention_entity || "");
        var importedScreensaverAction = normalizeScreensaverAction(
          s.screensaver_action != null
            ? s.screensaver_action
            : (s.clock_screensaver ? "clock" : "off"));
        var importedScreensaverDimmedBrightness = normalizeScreensaverDimmedBrightness(
          s.screensaver_dimmed_brightness);
        var importedClockBrightnessDay = normalizeClockBrightness(
          s.clock_brightness_day != null ? s.clock_brightness_day : s.clock_brightness,
          35);
        var importedClockBrightnessNight = normalizeClockBrightness(
          s.clock_brightness_night != null ? s.clock_brightness_night : s.clock_brightness,
          importedClockBrightnessDay);
        postScreensaverAction(importedScreensaverAction);
        postSwitch(entityName("screen_saver_clock"), importedScreensaverAction === "clock");
        postClockBrightnessDay(importedClockBrightnessDay);
        postClockBrightnessNight(importedClockBrightnessNight);
        postScreensaverDimmedBrightness(importedScreensaverDimmedBrightness);
        postScreensaverTimeout(s.screensaver_timeout || 300);
        postNumber(entityName("home_screen_timeout"), s.home_screen_timeout != null ? s.home_screen_timeout : 60);
        var importedScreenRotation = normalizeScreenRotation(s.screen_rotation);
        if (CFG.features && CFG.features.screenRotation) postSelect(entityName("screen_rotation"), importedScreenRotation);
        if (hasDeveloperExperimentalFeatures) {
          postDeveloperExperimentalFeatures(importedDeveloperExperimentalFeatures);
        }
        state._indoorOn = !!s.indoor_temp_enable;
        state._outdoorOn = !!s.outdoor_temp_enable;
        state.indoorEntity = s.indoor_temp_entity || "";
        state.outdoorEntity = s.outdoor_temp_entity || "";
        state.temperatureUnit = importedTemperatureUnit;
        state.clockBarOn = s.clock_bar != null ? !!s.clock_bar : false;
        state.networkStatusOn = s.network_status_icon != null ? !!s.network_status_icon : true;
        state.temperatureDegreeSymbolOn = s.temperature_degree_symbol != null ? !!s.temperature_degree_symbol : true;
        state.timezone = importedTimezone;
        state.clockFormat = importedClockFormat;
        state.ntpServer1 = importedNtpServer1;
        state.ntpServer2 = importedNtpServer2;
        state.ntpServer3 = importedNtpServer3;
        state.monthNames = importedMonthNames;
        state.customMonthNames = hasCustomMonthNames();
        state.customNtpServers = hasCustomNtpServers();
        state.screensaverMode = importedScreensaverMode;
        state._screensaverModeReceived = true;
        state.presenceEntity = s.presence_sensor_entity || "";
        state.mediaPlayerSleepPreventionOn = !!s.media_player_sleep_prevention;
        state.mediaPlayerSleepPreventionEntity = s.media_player_sleep_prevention_entity || "";
        state.screensaverAction = importedScreensaverAction;
        state._screensaverActionReceived = true;
        state.clockScreensaverOn = importedScreensaverAction === "clock";
        state.clockBrightnessDay = importedClockBrightnessDay;
        state.clockBrightnessNight = importedClockBrightnessNight;
        state.screensaverDimmedBrightness = importedScreensaverDimmedBrightness;
        state.screensaverTimeout = s.screensaver_timeout || 300;
        state.homeScreenTimeout = s.home_screen_timeout != null ? s.home_screen_timeout : 60;
        state.screenRotation = importedScreenRotation;
        if (hasDeveloperExperimentalFeatures) {
          state.developerExperimentalFeatures = importedDeveloperExperimentalFeatures;
        }

        syncTemperatureUi();
        syncClockBarUi();
        syncInput(els.setIndoorEntity, state.indoorEntity);
        syncInput(els.setOutdoorEntity, state.outdoorEntity);
        if (els.setTemperatureUnit) els.setTemperatureUnit.value = state.temperatureUnit;
        syncInput(els.setPresence, state.presenceEntity);
        syncInput(els.setMediaPlayerSleepPrevention, state.mediaPlayerSleepPreventionEntity);
        syncMediaPlayerSleepPreventionUi();
        if (els.setTimezone) els.setTimezone.value = state.timezone;
        if (els.setClockFormat) els.setClockFormat.value = state.clockFormat;
        syncNtpServerUi();
        syncMonthNameUi();
        syncClockScreensaverControls();
        syncScreensaverTimeoutUi();
        syncIdleUi();
        if (els.setScreenRotation) els.setScreenRotation.value = state.screenRotation;
        syncPreviewOrientation();
        if (els.setDeveloperExperimentalFeatures) {
          els.setDeveloperExperimentalFeatures.checked = state.developerExperimentalFeatures;
        }
        if (els.setSsMode) els.setSsMode(getActiveScreensaverMode());
        updateTempPreview();

      }

      var screenSettings = backupPlan.screen;
      if (screenSettings) {
        state.brightnessDayVal = parseFloat(screenSettings.brightness_day);
        if (!isFinite(state.brightnessDayVal)) state.brightnessDayVal = 100;
        state.brightnessNightVal = parseFloat(screenSettings.brightness_night);
        if (!isFinite(state.brightnessNightVal)) state.brightnessNightVal = 75;
        state.automaticBrightnessEnabled = screenSettings.automatic_brightness != null
          ? !!screenSettings.automatic_brightness
          : true;
        state.scheduleEnabled = !!screenSettings.schedule_enabled;
        state.scheduleOnHour = normalizeHour(screenSettings.schedule_on_hour, 6);
        state.scheduleOffHour = normalizeHour(screenSettings.schedule_off_hour, 23);
        state.scheduleMode = normalizeScheduleMode(screenSettings.schedule_mode);
        state.scheduleWakeTimeout = normalizeScheduleWakeTimeout(screenSettings.schedule_wake_timeout);
        state.scheduleWakeBrightness = normalizeScheduleWakeBrightness(
          screenSettings.schedule_wake_brightness != null
            ? screenSettings.schedule_wake_brightness
            : state.scheduleWakeBrightness
        );
        state.scheduleDimmedBrightness = normalizeScheduleDimmedBrightness(
          screenSettings.schedule_dimmed_brightness != null
            ? screenSettings.schedule_dimmed_brightness
            : state.scheduleDimmedBrightness
        );
        state.scheduleClockBrightness = normalizeScheduleClockBrightness(
          screenSettings.schedule_clock_brightness != null
            ? screenSettings.schedule_clock_brightness
            : state.scheduleClockBrightness
        );

        postNumber(entityName("screen_daytime_brightness"), state.brightnessDayVal);
        postNumber(entityName("screen_nighttime_brightness"), state.brightnessNightVal);
        postAutomaticBrightnessEnabled(state.automaticBrightnessEnabled);
        postScreenScheduleOnHour(state.scheduleOnHour);
        postScreenScheduleOffHour(state.scheduleOffHour);
        postScreenScheduleMode(state.scheduleMode);
        postScreenScheduleWakeTimeout(state.scheduleWakeTimeout);
        postScreenScheduleWakeBrightness(state.scheduleWakeBrightness);
        postScreenScheduleDimmedBrightness(state.scheduleDimmedBrightness);
        postScreenScheduleClockBrightness(state.scheduleClockBrightness);
        postScreenScheduleEnabled(state.scheduleEnabled);

        if (els.setDayBrightness) {
          els.setDayBrightness.value = state.brightnessDayVal;
          els.setDayBrightnessVal.textContent = Math.round(state.brightnessDayVal) + "%";
        }
        if (els.setNightBrightness) {
          els.setNightBrightness.value = state.brightnessNightVal;
          els.setNightBrightnessVal.textContent = Math.round(state.brightnessNightVal) + "%";
        }
        syncScreenScheduleUi();
      }

      state.selectedSlots = [];
      state.lastClickedSlot = -1;
      renderPreview();
      renderButtonSettings();
      switchTab("screen");
      showBanner("Configuration imported successfully", "success");
      cleanupInput();
    };
    reader.readAsText(input.files[0]);
  });

  document.body.appendChild(input);
  input.click();
}
