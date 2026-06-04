// ── Button settings panel (unified) ────────────────────────────────────

function hideSettingsOverlay() {
  if (els.settingsOverlay) els.settingsOverlay.classList.remove("sp-visible");
}

function updatePreviewHint(c) {
  if (!els.previewHint) return;
  c = c || ctx();
  els.previewHint.style.display = "";
  if (isConfigLocked()) {
    els.previewHint.textContent = "Editing is paused while the device reconnects";
  } else if (c.selected.length > 1) {
    els.previewHint.textContent = c.selected.length + " buttons selected \u2022 right click to copy, cut, or delete";
  } else {
    els.previewHint.textContent = "tap to select \u2022 shift/ctrl+tap to multi-select \u2022 right click to manage";
  }
}

function renderSelectionBar(c) {
  if (!els.selectionBar) return;
  c = c || ctx();
  els.selectionBar.innerHTML = "";
  if (isConfigLocked() || !c.selected.length) {
    els.selectionBar.className = "sp-selection-bar";
    return;
  }

  els.selectionBar.className = "sp-selection-bar sp-visible";

  var label = document.createElement("span");
  label.className = "sp-selection-label";
  label.textContent = c.selected.length === 1 && c.selected[0] === -2
    ? "Back button selected"
    : (c.selected.length === 1 ? "1 card selected" : c.selected.length + " cards selected");
  els.selectionBar.appendChild(label);

  var actions = document.createElement("div");
  actions.className = "sp-selection-actions";

  if (c.selected.length === 1) {
    var editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "sp-selection-btn sp-selection-btn-primary";
    editBtn.innerHTML = '<span class="mdi mdi-pencil"></span>Edit';
    editBtn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      openSelectedCardSettings();
    });
    actions.appendChild(editBtn);
  }

  var menuBtn = document.createElement("button");
  menuBtn.type = "button";
  menuBtn.className = "sp-selection-btn";
  menuBtn.setAttribute("aria-label", "Card actions");
  menuBtn.innerHTML = '<span class="mdi mdi-dots-horizontal"></span>';
  menuBtn.addEventListener("click", function (e) {
    e.preventDefault();
    e.stopPropagation();
    showSelectionMenu(e);
  });
  actions.appendChild(menuBtn);
  els.selectionBar.appendChild(actions);
}

function closeSettings() {
  hideSettingsOverlay();
  _settingsDeferred = false;
  state.settingsDraft = null;
  state.clockBarSelectedItem = "";
  ctx().setSelected([]);
  updateClockBarItemUi();
  renderPreview();
}

function clearCardSelection() {
  var c = ctx();
  if (!c.selected.length && c.getLastClicked() < 0 && !state.clockBarSelectedItem) return;
  c.setSelected([]);
  c.setLastClicked(-1);
  state.clockBarSelectedItem = "";
  hideSettingsOverlay();
  updateClockBarItemUi();
  renderPreview();
  renderButtonSettings();
}

function isSelectionControlTarget(target) {
  return !!(
    (els.previewMain && els.previewMain.contains(target)) ||
    (els.topbar && els.topbar.contains(target)) ||
    (els.selectionBar && els.selectionBar.contains(target)) ||
    (els.settingsOverlay && els.settingsOverlay.contains(target)) ||
    (ctxMenu && ctxMenu.contains(target)) ||
    (target.closest && target.closest(".sp-ctx-menu"))
  );
}

function handleDocumentSelectionMouseDown(e) {
  if (e.button !== 0) return;
  if (isSelectionControlTarget(e.target)) return;
  clearCardSelection();
}

function openSelectedCardSettings() {
  if (isConfigLocked()) return;
  if (state.clockBarSelectedItem) {
    renderButtonSettings(true);
    return;
  }
  var c = ctx();
  if (c.selected.length !== 1) return;
  renderButtonSettings(true);
}

function fieldWithControl(labelText, inputId, control) {
  var field = document.createElement("div");
  field.className = "sp-field";
  field.appendChild(fieldLabel(labelText, inputId));
  if (control) field.appendChild(control);
  return field;
}

function clockBarSelectField(labelText, inputId, options, value, onChange) {
  var select = document.createElement("select");
  select.className = "sp-select";
  if (inputId) select.id = inputId;
  options.forEach(function (entry) {
    var option = document.createElement("option");
    option.value = entry[0];
    option.textContent = entry[1];
    select.appendChild(option);
  });
  select.value = value;
  if (onChange) select.addEventListener("change", onChange);
  return fieldWithControl(labelText, inputId, select);
}

function renderClockBarEntityControls(panel, kind, label, enabled, entityValue, entityKey, placeholder) {
  var toggle = toggleRow(label, "sp-clockbar-" + kind + "-toggle", enabled);
  panel.appendChild(toggle.row);

  var field = condField();
  var inputId = "sp-clockbar-" + kind + "-entity";
  field.appendChild(fieldLabel(label + " Entity", inputId));
  var input = entityInput(inputId, entityValue, placeholder, ["sensor"]);
  field.appendChild(input);
  panel.appendChild(field);
  if (kind === "indoor") {
    els.setIndoorToggle = toggle.input;
    els.setIndoorField = field;
    els.setIndoorEntity = input;
  } else {
    els.setOutdoorToggle = toggle.input;
    els.setOutdoorField = field;
    els.setOutdoorEntity = input;
  }

  function syncField() {
    field.className = "sp-cond-field" + (toggle.input.checked ? " sp-visible" : "");
  }

  toggle.input.addEventListener("change", function () {
    if (kind === "indoor") state._indoorOn = this.checked;
    else state._outdoorOn = this.checked;
    postSwitch(entityName(kind + "_temp_enable"), this.checked);
    syncField();
    syncTemperatureUi();
    updateTempPreview();
    updateClockBarItemUi();
  });
  bindTextPost(input, entityName(entityKey), {
    onBlur: function (value) {
      if (kind === "indoor") state.indoorEntity = value;
      else state.outdoorEntity = value;
    },
  });
  syncField();
}

function renderClockBarSettings(forceOpen) {
  if (!state.clockBarSelectedItem) return false;
  if (!forceOpen && !isSettingsOpen()) return true;
  if (els.settingsOverlay) els.settingsOverlay.classList.add("sp-visible");

  var item = state.clockBarSelectedItem;
  var container = els.buttonSettings;
  var title = document.createElement("div");
  title.className = "sp-section-title";
  title.textContent = clockBarItemLabel(item);
  container.appendChild(title);

  var panel = document.createElement("div");
  panel.className = "sp-panel";

  if (item === "temperature") {
    renderClockBarEntityControls(panel, "outdoor", "Outdoor Temperature", state._outdoorOn,
      state.outdoorEntity, "outdoor_temp_entity", "sensor.outdoor_temperature");
    renderClockBarEntityControls(panel, "indoor", "Indoor Temperature", state._indoorOn,
      state.indoorEntity, "indoor_temp_entity", "sensor.indoor_temperature");
    panel.appendChild(clockBarSelectField("Temperature Unit", "sp-clockbar-temperature-unit", [
      ["Auto", "Auto (from timezone)"],
      ["\u00B0C", "Centigrade (\u00B0C)"],
      ["\u00B0F", "Fahrenheit (\u00B0F)"],
    ], normalizeTemperatureUnit(state.temperatureUnit), function () {
      state.temperatureUnit = normalizeTemperatureUnit(this.value);
      postSelect(entityName("screen_temperature_unit"), state.temperatureUnit);
      if (els.setTemperatureUnit) els.setTemperatureUnit.value = state.temperatureUnit;
      updateTempPreview();
      renderPreview();
    }));
    var degreeSymbol = toggleRow("Show Degree Symbol", "sp-clockbar-degree-symbol", state.temperatureDegreeSymbolOn);
    panel.appendChild(degreeSymbol.row);
    degreeSymbol.input.addEventListener("change", function () {
      state.temperatureDegreeSymbolOn = this.checked;
      syncClockBarUi();
      postTemperatureDegreeSymbol(state.temperatureDegreeSymbolOn);
    });
  } else if (item === "time") {
    var timeToggle = toggleRow("Show Time", "sp-clockbar-time-toggle", state.clockBarTimeOn);
    panel.appendChild(timeToggle.row);
    els.setClockBarTimeToggle = timeToggle.input;
    timeToggle.input.addEventListener("change", function () {
      state.clockBarTimeOn = this.checked;
      syncClockBarUi();
      postClockBarTime(state.clockBarTimeOn);
    });

    var timezoneSelect = document.createElement("select");
    timezoneSelect.className = "sp-select";
    timezoneSelect.id = "sp-clockbar-timezone";
    timezoneOptionsWithFallback(state.timezoneOptions, state.timezone).forEach(function (opt) {
      appendTimezoneOption(timezoneSelect, opt);
    });
    timezoneSelect.value = state.timezone;
    timezoneSelect.addEventListener("change", function () {
      state.timezone = this.value;
      postSelect(entityName("screen_timezone"), state.timezone);
      if (els.setTimezone) els.setTimezone.value = state.timezone;
      if (normalizeTemperatureUnit(state.temperatureUnit) === "Auto") updateTempPreview();
      updateClock();
      renderPreview();
    });
    panel.appendChild(fieldWithControl("Timezone", "sp-clockbar-timezone", timezoneSelect));

    panel.appendChild(clockBarSelectField("Clock Format", "sp-clockbar-clock-format", [
      ["24h", "24-hour"],
      ["12h", "12-hour"],
    ], state.clockFormat, function () {
      state.clockFormat = this.value;
      postSelect(entityName("screen_clock_format"), state.clockFormat);
      if (els.setClockFormat) els.setClockFormat.value = state.clockFormat;
      updateClock();
      renderPreview();
    }));
  } else if (item === "network") {
    var networkStatus = toggleRow("Show Network Status Icon", "sp-clockbar-network-status-icon", state.networkStatusOn);
    panel.appendChild(networkStatus.row);
    els.setNetworkStatusToggle = networkStatus.input;
    networkStatus.input.addEventListener("change", function () {
      state.networkStatusOn = this.checked;
      syncClockBarUi();
      postNetworkStatusIcon(state.networkStatusOn);
    });
  }

  var row = document.createElement("div");
  row.className = "sp-btn-row sp-btn-row--save sp-has-delete";
  var delBtn = document.createElement("button");
  delBtn.type = "button";
  delBtn.className = "sp-action-btn sp-delete-btn";
  delBtn.innerHTML = '<span class="mdi mdi-delete-outline"></span>Delete';
  delBtn.addEventListener("click", function () {
    deleteClockBarItem(item);
    renderButtonSettings();
  });
  row.appendChild(delBtn);
  var doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "sp-action-btn sp-save-btn";
  doneBtn.textContent = "Done";
  doneBtn.addEventListener("click", closeSettings);
  row.appendChild(doneBtn);
  panel.appendChild(row);

  container.appendChild(panel);
  return true;
}

function openCardSettings(slot) {
  if (isConfigLocked()) return;
  var c = ctx();
  if ((slot > 0 || (slot === -2 && c.isSub)) && c.selected.indexOf(slot) === -1) {
    c.setSelected([slot]);
    c.setLastClicked(slot);
    renderPreview();
  }
  renderButtonSettings(true);
}

function renderBackButtonSettings(container, c) {
  if (!c.isSub || c.selected[0] !== -2) return false;
  if (els.settingsOverlay) els.settingsOverlay.classList.add("sp-visible");
  var sp = getSubpage(state.editingSubpage);

  var title = document.createElement("div");
  title.className = "sp-section-title";
  title.textContent = "Back Button";
  container.appendChild(title);

  var panel = document.createElement("div");
  panel.className = "sp-panel";
  var lf = document.createElement("div");
  lf.className = "sp-field";
  lf.appendChild(fieldLabel("Label", "sp-sp-inp-back-label"));
  var labelInp = textInput("sp-sp-inp-back-label", sp.backLabel || "Back", "Back");
  lf.appendChild(labelInp);
  panel.appendChild(lf);

  function saveBackLabel() {
    sp.backLabel = labelInp.value || "Back";
    saveSubpageConfig(state.editingSubpage);
    renderPreview();
  }
  labelInp.addEventListener("input", saveBackLabel);
  labelInp.addEventListener("change", saveBackLabel);
  labelInp.addEventListener("blur", saveBackLabel);
  labelInp.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      saveBackLabel();
      this.blur();
    }
  });

  var doneRow = document.createElement("div");
  doneRow.className = "sp-btn-row sp-btn-row--save";
  var doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "sp-action-btn sp-save-btn";
  doneBtn.textContent = "Done";
  doneBtn.addEventListener("click", closeSettings);
  doneRow.appendChild(doneBtn);
  panel.appendChild(doneRow);

  container.appendChild(panel);
  return true;
}

function renderButtonSettings(forceOpen) {
  var container = els.buttonSettings;
  container.innerHTML = "";
  var c = ctx();

  if (isConfigLocked()) {
    hideSettingsOverlay();
    return;
  }

  if (renderClockBarSettings(forceOpen)) return;

  if (c.selected.length === 0) {
    hideSettingsOverlay();
    return;
  }

  if (c.selected.length > 1) {
    hideSettingsOverlay();
    return;
  }

  if (!forceOpen && !isSettingsOpen()) {
    hideSettingsOverlay();
    return;
  }

  if (els.settingsOverlay) els.settingsOverlay.classList.add("sp-visible");

  if (renderBackButtonSettings(container, c)) return;

  var slot = c.selected[0];
  var bIdx = slot - 1;
  if (bIdx < 0 || bIdx >= c.buttons.length) return;
  var liveButton = c.buttons[bIdx];
  var draftKey = (c.isSub ? "sub:" + state.editingSubpage : "main") + ":" + slot;

  function cloneButtonConfig(src) {
    return EspControlModel.cloneCardConfig(src);
  }

  function copyButtonConfig(target, src) {
    EspControlModel.copyCardConfig(target, src);
    normalizeButtonConfig(target);
  }

  if (!state.settingsDraft || state.settingsDraft.key !== draftKey) {
    state.settingsDraft = {
      key: draftKey,
      slot: slot,
      homeSlot: state.editingSubpage,
      isSub: c.isSub,
      dirty: false,
      button: cloneButtonConfig(liveButton),
    };
  }
  var b = state.settingsDraft.button;

  var title = document.createElement("div");
  title.className = "sp-section-title";
  title.textContent = "Settings";
  container.appendChild(title);

  var panel = document.createElement("div");
  panel.className = "sp-panel";

  var idPrefix = c.isSub ? "sp-sp-inp-" : "sp-inp-";
  var requiredFields = [];

  function markDraftDirty() {
    if (state.settingsDraft && state.settingsDraft.key === draftKey) {
      state.settingsDraft.dirty = true;
    }
  }

  function saveField(field, val) {
    markDraftDirty();
  }

  function fieldContainer(input) {
    return input && input.closest ? input.closest(".sp-field") : null;
  }

  function clearFieldError(input) {
    if (!input) return;
    input.classList.remove("sp-input-error");
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
    var field = fieldContainer(input);
    if (field) field.classList.remove("sp-field-invalid");
    var existing = field ? field.querySelector(".sp-field-error") : null;
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  }

  function showFieldError(input, message) {
    if (!input) return;
    var field = fieldContainer(input);
    input.classList.add("sp-input-error");
    input.setAttribute("aria-invalid", "true");
    if (field) field.classList.add("sp-field-invalid");
    var existing = field ? field.querySelector(".sp-field-error") : null;
    if (!existing && field) {
      existing = document.createElement("div");
      existing.className = "sp-field-error";
      existing.id = (input.id || "sp-field") + "-error";
      field.appendChild(existing);
    }
    if (existing) {
      existing.textContent = message || "Add an entity before saving.";
      input.setAttribute("aria-describedby", existing.id);
    }
  }

  function requireField(input, message, isActive) {
    if (!input) return;
    requiredFields.push({
      input: input,
      message: message || "Add an entity before saving.",
      isActive: isActive || function () { return true; },
    });
    function maybeClearError() {
      if (!isActive || isActive()) {
        if (String(input.value || "").trim()) clearFieldError(input);
      } else {
        clearFieldError(input);
      }
    }
    input.addEventListener("input", maybeClearError);
    input.addEventListener("change", maybeClearError);
  }

  function validateSettingsDraft() {
    var firstInvalid = null;
    for (var i = 0; i < requiredFields.length; i++) {
      var rule = requiredFields[i];
      if (rule.isActive && !rule.isActive()) {
        clearFieldError(rule.input);
        continue;
      }
      if (String(rule.input.value || "").trim()) {
        clearFieldError(rule.input);
        continue;
      }
      if (!firstInvalid) firstInvalid = rule.input;
      showFieldError(rule.input, rule.message);
    }
    if (!firstInvalid) return true;
    firstInvalid.focus();
    return false;
  }

  function validateConfigSize() {
    if (c.isSub) return true;
    if (serializeButtonConfig(b).length <= 255) return true;
    showBanner("Card settings are too large to save. Shorten confirmation text, labels, or entity IDs.", "error");
    return false;
  }

  function applySettingsDraft() {
    if (!state.settingsDraft || state.settingsDraft.key !== draftKey) return;
    copyButtonConfig(liveButton, state.settingsDraft.button);
    state.settingsDraft = null;
    if (c.isSub) {
      saveSubpageConfig(state.editingSubpage);
    } else {
      saveButtonConfig(slot);
    }
    var savedTypeDef = BUTTON_TYPES[liveButton.type || ""];
    if (savedTypeDef && savedTypeDef.afterSave) {
      savedTypeDef.afterSave(liveButton, slot, { isSub: c.isSub });
    }
    renderPreview();
  }

  function bindField(input, field, rerender) {
    function syncValue() {
      if (b[field] === input.value) return;
      b[field] = input.value;
      markDraftDirty();
      if (rerender) renderPreview();
    }
    input.addEventListener("input", function () {
      syncValue();
    });
    input.addEventListener("change", syncValue);
    input.addEventListener("blur", syncValue);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        syncValue();
        this.blur();
      }
    });
  }

  function makeIconPicker(pickerId, inputId, currentVal, onSelect, labelText) {
    var icf = document.createElement("div");
    icf.className = "sp-field";
    icf.appendChild(fieldLabel(labelText || "Icon", inputId));
    var picker = document.createElement("div");
    picker.className = "sp-icon-picker";
    if (pickerId) picker.id = pickerId;
    picker.innerHTML =
      '<span class="sp-icon-picker-preview mdi mdi-' + iconSlug(currentVal) + '"></span>' +
      '<input class="sp-icon-picker-input"' + (inputId ? ' id="' + inputId + '"' : '') +
      ' type="text" placeholder="Search icons\u2026" value="' + escAttr(currentVal) + '" autocomplete="off">' +
      '<div class="sp-icon-dropdown"></div>';
    icf.appendChild(picker);
    initIconPicker(picker, currentVal, onSelect);
    return icf;
  }

  function fieldWithControl(labelText, inputId, control) {
    var field = document.createElement("div");
    field.className = "sp-field";
    field.appendChild(fieldLabel(labelText, inputId));
    if (control) field.appendChild(control);
    return field;
  }

  function optionValue(option) {
    if (Array.isArray(option)) return option[0];
    if (option && typeof option === "object") return option.value;
    return option;
  }

  function optionLabel(option) {
    if (Array.isArray(option)) return option[1];
    if (option && typeof option === "object") return option.label;
    return option;
  }

  function selectField(labelText, inputId, options, value, onChange) {
    var select = document.createElement("select");
    select.className = "sp-select";
    if (inputId) select.id = inputId;
    (options || []).forEach(function (entry) {
      var option = document.createElement("option");
      option.value = optionValue(entry);
      option.textContent = optionLabel(entry);
      select.appendChild(option);
    });
    select.value = value || "";
    if (onChange) select.addEventListener("change", onChange);
    return {
      field: fieldWithControl(labelText, inputId, select),
      select: select,
    };
  }

  function entityField(labelText, inputId, value, placeholder, domains, bindName, rerender, requiredMessage) {
    var input = entityInput(inputId, value, placeholder, domains);
    var field = fieldWithControl(labelText, inputId, input);
    if (bindName) bindField(input, bindName, rerender);
    if (requiredMessage) requireField(input, requiredMessage);
    return {
      field: field,
      input: input,
    };
  }

  function textField(labelText, inputId, value, placeholder, bindName, rerender) {
    var input = textInput(inputId, value, placeholder);
    var field = fieldWithControl(labelText, inputId, input);
    if (bindName) bindField(input, bindName, rerender);
    return {
      field: field,
      input: input,
    };
  }

  function segmentControl(options, value, onSelect) {
    var segment = document.createElement("div");
    segment.className = "sp-segment";
    var buttons = {};
    (options || []).forEach(function (entry) {
      var optValue = optionValue(entry);
      var button = document.createElement("button");
      button.type = "button";
      button.textContent = optionLabel(entry);
      button.classList.toggle("active", optValue === value);
      button.addEventListener("click", function () {
        for (var key in buttons) buttons[key].classList.toggle("active", key === optValue);
        if (onSelect) onSelect(optValue, button);
      });
      segment.appendChild(button);
      buttons[optValue] = button;
    });
    return {
      segment: segment,
      buttons: buttons,
    };
  }

  function toggleSection(labelText, inputId, checked) {
    return {
      toggle: toggleRow(labelText, inputId, checked),
      section: condField(),
    };
  }

  function precisionField(inputId, value, onChange) {
    return selectField("Unit Precision", inputId, [
      ["0", "10"],
      ["1", "10.2"],
      ["2", "10.21"],
    ], value || "0", onChange);
  }

  var rawTypeDef = BUTTON_TYPES[b.type || ""] || BUTTON_TYPES[""];
  var typeDef = rawTypeDef;
  var rawExperimental = buttonTypeRegistryValue(rawTypeDef, "experimental", "");
  if (rawExperimental && !isExperimentalEnabled(rawExperimental)) {
    typeDef = hiddenExperimentalButtonTypeDef(rawTypeDef);
  }
  {
    var selectedTypeKey = buttonTypeRegistryValue(rawTypeDef, "pickerKey", "") || (b.type || "");
    var typeOpts = buttonTypePickerOptionList(c.isSub, selectedTypeKey);
    var tf = document.createElement("div");
    tf.className = "sp-field";
    tf.appendChild(fieldLabel("Card", "sp-inp-type"));
    var typeSelect = document.createElement("select");
    typeSelect.className = "sp-select";
    typeSelect.id = "sp-inp-type";
    typeOpts.forEach(function (o) {
      var opt = document.createElement("option");
      opt.value = o.key;
      opt.textContent = o.label;
      opt.disabled = !!o.disabled;
      if (selectedTypeKey === o.key) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener("change", function () {
      var newType = this.value;
      b.type = newType;
      var td = BUTTON_TYPES[newType];
      if (td && td.onSelect) td.onSelect(b);
      saveField("type", newType);
      renderButtonSettings();
    });
    tf.appendChild(typeSelect);
    panel.appendChild(tf);
  }

  var typeHelpers = {
    makeIconPicker: makeIconPicker,
    iconPickerField: makeIconPicker,
    fieldWithControl: fieldWithControl,
    selectField: selectField,
    entityField: entityField,
    textField: textField,
    segmentControl: segmentControl,
    toggleSection: toggleSection,
    precisionField: precisionField,
    fieldLabel: fieldLabel,
    textInput: textInput,
    entityInput: entityInput,
    bindField: bindField,
    saveField: saveField,
    applyCardMetadataFields: applyCardMetadataFields,
    renderCardModeSelector: renderCardModeSelector,
    renderCardLargeNumbersToggle: renderCardLargeNumbersToggle,
    syncCardLargeNumbersToggle: syncCardLargeNumbersToggle,
    renderCardEntityField: renderCardEntityField,
    renderCardTextField: renderCardTextField,
    renderCardNumberField: renderCardNumberField,
    renderCardIconPicker: renderCardIconPicker,
    renderCardOptionToggle: renderCardOptionToggle,
    renderCardSegmentControl: renderCardSegmentControl,
    requireField: requireField,
    clearFieldError: clearFieldError,
    toggleRow: toggleRow,
    cardSize: c.sizes[slot] || 1,
    idPrefix: idPrefix,
    isSub: c.isSub,
  };

  if (typeDef && typeDef.renderSettingsBeforeLabel &&
      (!c.isSub || buttonTypeRegistryValue(typeDef, "allowInSubpage", false))) {
    typeDef.renderSettingsBeforeLabel(panel, b, slot, typeHelpers);
  }

  if (!typeDef || !typeDef.hideLabel) {
    var lf = document.createElement("div");
    lf.className = "sp-field";
    lf.appendChild(fieldLabel("Label", idPrefix + "label"));
    var labelPlaceholder = (typeDef && typeDef.labelPlaceholder) || "e.g. Kitchen";
    var labelInp = textInput(idPrefix + "label", b.label, labelPlaceholder);
    lf.appendChild(labelInp);
    panel.appendChild(lf);
    bindField(labelInp, "label", true);
  }

  if (typeDef && typeDef.renderSettings &&
      (!c.isSub || buttonTypeRegistryValue(typeDef, "allowInSubpage", false))) {
    typeDef.renderSettings(panel, b, slot, typeHelpers);
  } else {
    // Toggle fallback: entity, icons, sensor data
    var ef = document.createElement("div");
    ef.className = "sp-field";
    ef.appendChild(fieldLabel("Entity", idPrefix + "entity"));
    var entityInp = entityInput(idPrefix + "entity", b.entity, "e.g. light.kitchen", [
      "light", "switch", "input_boolean", "fan"
    ]);
    ef.appendChild(entityInp);
    panel.appendChild(ef);
    bindField(entityInp, "entity", true);
    requireField(entityInp, "Add an entity before saving.");

    panel.appendChild(makeIconPicker(idPrefix + "icon-picker", idPrefix + "icon", b.icon || "Auto", function (opt) {
      b.icon = opt;
      saveField("icon", opt);
    }, "Off Icon"));

    // When-on section
    var hasIconOn = b.icon_on && b.icon_on !== "Auto";
    var hasSensor = !!b.sensor;
    var whenOnEnabled = hasIconOn || hasSensor || !!b._whenOnActive;
    var whenOnMode = b._whenOnMode || (hasSensor ? "sensor" : "icon");

    var whenOnToggle = toggleRow("Active Display", idPrefix + "whenon-toggle", whenOnEnabled);
    panel.appendChild(whenOnToggle.row);

    var whenOnCond = condField();
    if (whenOnEnabled) whenOnCond.classList.add("sp-visible");

    var seg = document.createElement("div");
    seg.className = "sp-segment";
    var btnIcon = document.createElement("button");
    btnIcon.type = "button";
    btnIcon.textContent = "On Icon";
    if (whenOnMode === "icon") btnIcon.classList.add("active");
    var btnSensor = document.createElement("button");
    btnSensor.type = "button";
    btnSensor.textContent = "Numeric";
    if (whenOnMode === "sensor") btnSensor.classList.add("active");
    seg.appendChild(btnIcon);
    seg.appendChild(btnSensor);
    whenOnCond.appendChild(seg);

    // Icon-on section
    var iconOnSection = condField();
    if (whenOnMode === "icon") iconOnSection.classList.add("sp-visible");
    var ionLabel = fieldLabel("On Icon", idPrefix + "icon-on");
    iconOnSection.appendChild(ionLabel);
    var iconOnVal = hasIconOn ? b.icon_on : "Auto";
    var iconOnPicker = document.createElement("div");
    iconOnPicker.className = "sp-icon-picker";
    iconOnPicker.id = idPrefix + "icon-on-picker";
    iconOnPicker.innerHTML =
      '<span class="sp-icon-picker-preview mdi mdi-' + iconSlug(iconOnVal) + '"></span>' +
      '<input class="sp-icon-picker-input" id="' + idPrefix + 'icon-on" type="text" ' +
      'placeholder="Search icons\u2026" value="' + escAttr(iconOnVal) + '" autocomplete="off">' +
      '<div class="sp-icon-dropdown"></div>';
    iconOnSection.appendChild(iconOnPicker);
    whenOnCond.appendChild(iconOnSection);

    initIconPicker(iconOnPicker, iconOnVal, function (opt) {
      b.icon_on = opt;
      saveField("icon_on", opt);
    });

    // Sensor section
    var sensorSection = condField();
    if (whenOnMode === "sensor") sensorSection.classList.add("sp-visible");

    var sf = document.createElement("div");
    sf.className = "sp-field";
    sf.appendChild(fieldLabel("Sensor Entity", idPrefix + "sensor"));
    var sensorInp = entityInput(idPrefix + "sensor", b.sensor, "e.g. sensor.printer_percent_complete", [
      "sensor", "binary_sensor", "text_sensor"
    ]);
    sf.appendChild(sensorInp);
    sensorSection.appendChild(sf);

    var uf = document.createElement("div");
    uf.className = "sp-field";
    uf.appendChild(fieldLabel("Unit", idPrefix + "unit"));
    var unitInp = textInput(idPrefix + "unit", b.unit, "e.g. %");
    unitInp.className = "sp-input";
    uf.appendChild(unitInp);
    sensorSection.appendChild(uf);

    var pf = document.createElement("div");
    pf.className = "sp-field";
    pf.appendChild(fieldLabel("Unit Precision", idPrefix + "precision"));
    var precisionSelect = document.createElement("select");
    precisionSelect.className = "sp-select";
    precisionSelect.id = idPrefix + "precision";
    var precOpts = [["0", "10"], ["1", "10.2"], ["2", "10.21"]];
    for (var pi = 0; pi < precOpts.length; pi++) {
      var opt = document.createElement("option");
      opt.value = precOpts[pi][0];
      opt.textContent = precOpts[pi][1];
      precisionSelect.appendChild(opt);
    }
    precisionSelect.value = b.precision || "0";
    precisionSelect.addEventListener("change", function () {
      b.precision = this.value === "0" ? "" : this.value;
      saveField("precision", b.precision);
    });
    pf.appendChild(precisionSelect);
    sensorSection.appendChild(pf);
    whenOnCond.appendChild(sensorSection);

    panel.appendChild(whenOnCond);

    bindField(sensorInp, "sensor", true);
    bindField(unitInp, "unit", false);

    function setWhenOnMode(mode) {
      whenOnMode = mode;
      b._whenOnActive = true;
      b._whenOnMode = mode;
      btnIcon.classList.toggle("active", mode === "icon");
      btnSensor.classList.toggle("active", mode === "sensor");
      iconOnSection.classList.toggle("sp-visible", mode === "icon");
      sensorSection.classList.toggle("sp-visible", mode === "sensor");
      if (mode === "icon") {
        sensorInp.value = "";
        unitInp.value = "";
        precisionSelect.value = "0";
        b.sensor = "";
        b.unit = "";
        b.precision = "";
        saveField("sensor", "");
        saveField("unit", "");
        saveField("precision", "");
      } else {
        b.icon_on = "Auto";
        saveField("icon_on", "Auto");
        var ionPreview = iconOnPicker.querySelector(".sp-icon-picker-preview");
        if (ionPreview) ionPreview.className = "sp-icon-picker-preview mdi mdi-cog";
        var ionInput = iconOnPicker.querySelector(".sp-icon-picker-input");
        if (ionInput) ionInput.value = "Auto";
      }
    }

    btnIcon.addEventListener("click", function () { setWhenOnMode("icon"); });
    btnSensor.addEventListener("click", function () { setWhenOnMode("sensor"); });

    whenOnToggle.input.addEventListener("change", function () {
      if (this.checked) {
        b._whenOnActive = true;
        whenOnCond.classList.add("sp-visible");
      } else {
        b._whenOnActive = false;
        b._whenOnMode = null;
        whenOnCond.classList.remove("sp-visible");
        sensorInp.value = "";
        unitInp.value = "";
        precisionSelect.value = "0";
        b.sensor = "";
        b.unit = "";
        b.precision = "";
        b.icon_on = "Auto";
        saveField("sensor", "");
        saveField("unit", "");
        saveField("precision", "");
        saveField("icon_on", "Auto");
      }
    });

    var patternField = selectField("On State Pattern", idPrefix + "on-pattern", [
      ["", "Solid"],
      ["stripes", "Stripes"],
    ], cardOnPattern(b), function () {
      setCardOnPattern(b, this.value);
      saveField("options", b.options);
      renderPreview();
    });
    panel.appendChild(patternField.field);
  }

  var saveRow = document.createElement("div");
  saveRow.className = "sp-btn-row sp-btn-row--save";

  var delBtn = document.createElement("button");
  delBtn.className = "sp-action-btn sp-delete-btn";
  delBtn.innerHTML = '<span class="mdi mdi-trash-can-outline"></span>';
  delBtn.addEventListener("click", function () {
    state.settingsDraft = null;
    deleteSlot(slot);
  });
  saveRow.appendChild(delBtn);
  saveRow.classList.add("sp-has-delete");

  var rightGroup = document.createElement("div");
  rightGroup.className = "sp-btn-group-right";
  var editSubBtn = panel.querySelector(".sp-edit-subpage-btn");
  if (editSubBtn) rightGroup.appendChild(editSubBtn);
  var saveBtn = document.createElement("button");
  saveBtn.className = "sp-action-btn sp-save-btn";
  saveBtn.textContent = "Save";
  saveBtn.addEventListener("click", function () {
    if (!validateSettingsDraft()) return;
    if (!validateConfigSize()) return;
    applySettingsDraft();
    closeSettings();
  });
  rightGroup.appendChild(saveBtn);
  saveRow.appendChild(rightGroup);
  panel.appendChild(saveRow);

  container.appendChild(panel);
}

// ── Render debouncing ──────────────────────────────────────────────────

var _renderPending = false;
function scheduleRender() {
  if (_renderPending) return;
  _renderPending = true;
  requestAnimationFrame(function () {
    _renderPending = false;
    renderPreview();
    if (isSettingsOpen() || isSettingsFocused()) {
      _settingsDeferred = true;
    } else {
      renderButtonSettings();
    }
  });
}

var _settingsDeferred = false;
document.addEventListener("focusout", function (e) {
  if (!_settingsDeferred) return;
  if (e.relatedTarget && els.buttonSettings && els.buttonSettings.contains(e.relatedTarget)) return;
  requestAnimationFrame(function () {
    if (isSettingsOpen()) return;
    if (!isSettingsFocused()) {
      _settingsDeferred = false;
      renderButtonSettings();
    }
  });
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && els.settingsOverlay &&
      els.settingsOverlay.classList.contains("sp-visible")) {
    closeSettings();
  }
});

// ── Icon picker (optimized) ────────────────────────────────────────────

function initIconPicker(picker, currentIcon, onSelect) {
  var input = picker.querySelector(".sp-icon-picker-input");
  var dropdown = picker.querySelector(".sp-icon-dropdown");
  var preview = picker.querySelector(".sp-icon-picker-preview");
  var highlighted = -1;
  var optionEls = null;
  var emptyEl = null;

  function ensureBuilt() {
    if (optionEls) return;
    optionEls = [];
    var frag = document.createDocumentFragment();
    ICON_OPTIONS.forEach(function (opt) {
      var row = document.createElement("div");
      row.className = "sp-icon-option" + (opt === currentIcon ? " sp-active" : "");
      row.innerHTML =
        '<span class="sp-icon-option-icon mdi mdi-' + iconSlug(opt) + '"></span>' +
        '<span class="sp-icon-option-label">' + escHtml(opt) + '</span>';
      row._lcName = opt.toLowerCase();
      row._optName = opt;
      row.addEventListener("mousedown", function (e) {
        e.preventDefault();
        selectOpt(opt);
      });
      frag.appendChild(row);
      optionEls.push(row);
    });
    emptyEl = document.createElement("div");
    emptyEl.className = "sp-icon-option sp-icon-option--empty";
    emptyEl.textContent = "No matches";
    emptyEl.style.display = "none";
    frag.appendChild(emptyEl);
    dropdown.appendChild(frag);
  }

  function filterOpts(filter) {
    ensureBuilt();
    highlighted = -1;
    var lc = (filter || "").toLowerCase();
    var hasMatch = false;
    for (var i = 0; i < optionEls.length; i++) {
      var match = !lc || optionEls[i]._lcName.indexOf(lc) !== -1;
      optionEls[i].style.display = match ? "" : "none";
      optionEls[i].classList.remove("sp-highlighted");
      if (match) hasMatch = true;
    }
    emptyEl.style.display = hasMatch ? "none" : "";
  }

  function setPickerIcon(opt) {
    currentIcon = opt;
    input.value = opt;
    preview.className = "sp-icon-picker-preview mdi mdi-" + iconSlug(opt);
    if (optionEls) {
      for (var i = 0; i < optionEls.length; i++) {
        optionEls[i].classList.toggle("sp-active", optionEls[i]._optName === opt);
      }
    }
  }

  function selectOpt(opt) {
    setPickerIcon(opt);
    closePicker();
    onSelect(opt);
    renderPreview();
  }
  picker._setIcon = setPickerIcon;

  function openPicker() {
    if (currentIcon === "Auto") {
      input.value = "";
      filterOpts("");
    } else {
      filterOpts(currentIcon);
      setTimeout(function () { input.select(); }, 0);
    }
    picker.classList.add("sp-open");
  }

  function closePicker() {
    picker.classList.remove("sp-open");
    input.value = currentIcon;
    highlighted = -1;
  }

  function getVisible() {
    var vis = [];
    if (optionEls) {
      for (var i = 0; i < optionEls.length; i++) {
        if (optionEls[i].style.display !== "none") vis.push(optionEls[i]);
      }
    }
    return vis;
  }

  function highlightAt(idx) {
    var visible = getVisible();
    if (visible.length === 0) return;
    if (optionEls) optionEls.forEach(function (el) { el.classList.remove("sp-highlighted"); });
    if (idx < 0) idx = visible.length - 1;
    if (idx >= visible.length) idx = 0;
    highlighted = idx;
    visible[highlighted].classList.add("sp-highlighted");
    visible[highlighted].scrollIntoView({ block: "nearest" });
  }

  input.addEventListener("focus", openPicker);
  input.addEventListener("blur", closePicker);

  input.addEventListener("input", function () {
    filterOpts(this.value);
    var vis = getVisible();
    if (vis.length > 0) highlightAt(0);
  });

  input.addEventListener("keydown", function (e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!picker.classList.contains("sp-open")) { openPicker(); return; }
      highlightAt(highlighted + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      highlightAt(highlighted - 1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      var visible = getVisible();
      if (highlighted >= 0 && highlighted < visible.length) {
        selectOpt(visible[highlighted]._optName);
      }
    } else if (e.key === "Tab") {
      var visible = getVisible();
      if (picker.classList.contains("sp-open") && highlighted >= 0 && highlighted < visible.length) {
        selectOpt(visible[highlighted]._optName);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      closePicker();
      input.blur();
    }
  });
}
