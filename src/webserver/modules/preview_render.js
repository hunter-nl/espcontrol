// ── Preview rendering (unified) ────────────────────────────────────────

function previewHtmlValue(typePreview, key, fallback) {
  return typePreview && Object.prototype.hasOwnProperty.call(typePreview, key)
    ? typePreview[key]
    : fallback;
}

function buttonTypeRegistryValue(typeDef, key, fallback) {
  if (!typeDef || !Object.prototype.hasOwnProperty.call(typeDef, key)) return fallback;
  var value = typeDef[key];
  if (typeof value === "function") value = value();
  return value == null ? fallback : value;
}

function buttonTypeDisabledForDevice(key) {
  var disabled = CFG.disabledCardTypes || [];
  return disabled.indexOf(key || "") !== -1;
}

function buttonTypeInfoOnlyVisible(key) {
  if (!CFG.infoOnly) return true;
  return [
    "sensor",
    "calendar",
    "clock",
    "door_window",
    "presence",
    "timezone",
    "weather",
    "weather_forecast",
  ].indexOf(key || "") !== -1;
}

function buttonTypePickerOptionList(isSub, selectedTypeKey) {
  var typeOpts = [];
  var selectedUnsupported = null;
  var hasSelectedType = selectedTypeKey !== null && selectedTypeKey !== undefined;
  var selectedHiddenExperimental = null;
  for (var k in BUTTON_TYPES) {
    var td = BUTTON_TYPES[k];
    var pickerKey = buttonTypeRegistryValue(td, "pickerKey", "");
    var allowInSubpage = !!buttonTypeRegistryValue(td, "allowInSubpage", false);
    var experimental = buttonTypeRegistryValue(td, "experimental", "");
    var label = buttonTypeRegistryValue(td, "label", td.key || "Toggle");
    if (buttonTypeDisabledForDevice(td.key) || buttonTypeDisabledForDevice(pickerKey)) continue;
    if (!buttonTypeInfoOnlyVisible(td.key) || (pickerKey && !buttonTypeInfoOnlyVisible(pickerKey))) {
      if (hasSelectedType && (selectedTypeKey === td.key || (pickerKey && selectedTypeKey === pickerKey))) {
        selectedUnsupported = { key: selectedTypeKey, label: label };
      }
      continue;
    }
    if (pickerKey && pickerKey !== td.key) continue;
    if (isSub && !allowInSubpage) continue;
    if (td.isAvailable && !td.isAvailable({ isSub: isSub }) && selectedTypeKey !== td.key) continue;
    var experimentalHidden = experimental && !isExperimentalEnabled(experimental);
    if (experimentalHidden) {
      var showSelectedExperimental = buttonTypeRegistryValue(td, "showSelectedWhenExperimentalHidden", true);
      if (selectedTypeKey === td.key && showSelectedExperimental !== false) selectedHiddenExperimental = td;
      continue;
    }
    typeOpts.push({ key: td.key, label: label, disabled: false });
  }
  if (selectedHiddenExperimental) {
    typeOpts.push({
      key: selectedHiddenExperimental.key,
      label: buttonTypeRegistryValue(selectedHiddenExperimental, "label", selectedHiddenExperimental.key || "Toggle") +
        " (experimental)",
      disabled: true,
    });
  }
  if (selectedUnsupported) {
    typeOpts.push({
      key: selectedUnsupported.key,
      label: selectedUnsupported.label + " (not available)",
      disabled: true,
    });
  }
  typeOpts.sort(function (a, b) {
    return a.label.localeCompare(b.label);
  });
  return typeOpts;
}

function buttonTypePickerKeys(isSub, selectedTypeKey) {
  return buttonTypePickerOptionList(!!isSub, selectedTypeKey).map(function (opt) {
    return opt.key;
  });
}

function buttonTypeVisibleInPicker(key, isSub) {
  return buttonTypePickerKeys(!!isSub, null).indexOf(key) >= 0;
}

function hiddenExperimentalButtonTypeDef(typeDef) {
  if (!typeDef) return null;
  return Object.assign({}, typeDef, {
    hideLabel: true,
    renderSettingsBeforeLabel: null,
    renderSettings: function (panel) {
      var note = document.createElement("div");
      note.className = "sp-field-hint";
      note.textContent = "Enable Developer/Experimental Features from ?developer=experimental to edit this card.";
      panel.appendChild(note);
    },
    contextMenuItems: null,
  });
}

function renderPreview() {
  var main = els.previewMain;
  main.innerHTML = "";
  main.className = "sp-main" + (state.subpageChevronsOn ? "" : " sp-hide-subpage-chevrons");
  var c = ctx();

  updatePreviewHint(c);

  for (var pos = 0; pos < c.maxSlots; pos++) {
    var slot = c.grid[pos];
    if (slot === -1) continue;

    if (slot === -2) {
      var backBtn = document.createElement("div");
      var bkSz = c.sizes[-2];
      var backLabel = c.isSub ? (getSubpage(state.editingSubpage).backLabel || "Back") : "Back";
      backBtn.className = "sp-btn sp-back-btn" + sizeClass(bkSz) +
        (c.selected.indexOf(-2) !== -1 ? " sp-selected" : "");
      backBtn.innerHTML =
        '<span class="sp-btn-icon sp-back-hit mdi mdi-chevron-left"></span>' +
        '<span class="sp-btn-label">' + escHtml(backLabel) + '</span>';
      var backColor = isEpaperPreview() ? epaperPreviewFillColor() : state.offColor;
      backBtn.style.backgroundColor = "#" + (backColor.length === 6 ? backColor : "CECECE");
      backBtn.style.cursor = "pointer";
      backBtn.setAttribute("data-pos", pos);
      backBtn.draggable = !isConfigLocked();
      main.appendChild(backBtn);
    } else if (slot > 0) {
      var bIdx = slot - 1;
      if (c.isSub && bIdx >= c.buttons.length) continue;
      var b = c.buttons[bIdx];
      if (state.settingsDraft &&
          state.settingsDraft.slot === slot &&
          state.settingsDraft.isSub === c.isSub &&
          (!c.isSub || state.settingsDraft.homeSlot === state.editingSubpage)) {
        b = state.settingsDraft.button;
      }
      if (!buttonTypeInfoOnlyVisible(b.type || "")) {
        var hidden = document.createElement("div");
        hidden.className = "sp-empty-cell sp-info-only-hidden";
        hidden.setAttribute("data-pos", pos);
        main.appendChild(hidden);
        continue;
      }
      var iconName = resolveIcon(b);
      var label = b.label || b.entity || "Configure";
      var color = isEpaperPreview() ? epaperPreviewFillColor() :
        (b.type === "sensor" || b.type === "door_window" || b.type === "presence" || b.type === "weather" || b.type === "weather_forecast" || b.type === "calendar" || b.type === "clock" || b.type === "timezone")
        ? state.sensorColor : state.offColor;
      var previewTypeDef = BUTTON_TYPES[b.type || ""] || null;
      if (previewTypeDef && c.isSub && !buttonTypeRegistryValue(previewTypeDef, "allowInSubpage", false)) {
        previewTypeDef = null;
      }
      var slotSz = c.sizes[slot];
      var typePreview = previewTypeDef && previewTypeDef.renderPreview
        ? previewTypeDef.renderPreview(b, { escHtml: escHtml, cardSize: slotSz || 1 })
        : null;

      var btn = document.createElement("div");
      btn.className = "sp-btn" +
        (typePreview && typePreview.buttonClass ? " " + typePreview.buttonClass : "") +
        sizeClass(slotSz) +
        (c.selected.indexOf(slot) !== -1 ? " sp-selected" : "");
      btn.style.backgroundColor = "#" + (color.length === 6 ? color : "CECECE");
      btn.draggable = !isConfigLocked();
      btn.setAttribute("data-pos", pos);
      btn.setAttribute("data-slot", slot);
      var hasWhenOn = !typePreview && (b.sensor || (b.icon_on && b.icon_on !== "Auto"));
      if (!typePreview && hasWhenOn && typeof cardOnPattern === "function" && cardOnPattern(b) === "stripes" && !isEpaperPreview()) {
        var onColor = state.onColor && state.onColor.length === 6 ? state.onColor : "FF8C00";
        btn.style.backgroundImage =
          "repeating-linear-gradient(135deg,#" + onColor + " 0,#" + onColor +
          " 12px,rgba(255,255,255,.22) 12px,rgba(255,255,255,.22) 20px)";
      }
      var badgeIcon = b.sensor ? "gauge" : "swap-horizontal";
      var sensorBadge = hasWhenOn
        ? '<span class="sp-sensor-badge mdi mdi-' + badgeIcon + '"></span>'
        : '';
      var labelHtml = previewHtmlValue(typePreview, "labelHtml",
        '<span class="sp-btn-label">' + escHtml(label) + '</span>');
      var iconHtml = previewHtmlValue(typePreview, "iconHtml",
        '<span class="sp-btn-icon mdi mdi-' + iconName + '"></span>');
      btn.innerHTML =
        sensorBadge +
        iconHtml +
        labelHtml;
      main.appendChild(btn);
    } else {
      var empty = document.createElement("div");
      empty.className = "sp-empty-cell";
      empty.setAttribute("data-pos", pos);
      empty.innerHTML = '<span class="sp-add-pill"><span class="sp-add-icon mdi mdi-plus"></span></span>';
      main.appendChild(empty);
    }
  }
  renderSelectionBar(c);
}
