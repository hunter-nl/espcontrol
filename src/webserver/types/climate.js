// Climate card: thermostat status plus full-screen climate controls.
registerButtonType("climate", {
  label: "Climate",
  allowInSubpage: true,
  hideLabel: true,
  labelPlaceholder: "e.g. Living Room",
  onSelect: function (b) {
    b.entity = "";
    b.label = "Climate";
    b.sensor = "";
    b.unit = "";
    b.precision = "";
    b.icon = "Thermostat";
    b.icon_on = "Auto";
    b.options = "";
  },
  renderSettings: function (panel, b, slot, helpers) {
    b.sensor = "";
    b.unit = "";
    if (!b.icon) b.icon = "Thermostat";
    if (!b.icon_on) b.icon_on = "Auto";
    var climateConfig = parseClimatePrecisionConfig(b.precision);
    var normalizedPrecision = climatePrecisionConfig(
      climateConfig.precision,
      climateConfig.min,
      climateConfig.max
    );
    if (b.precision !== normalizedPrecision) {
      b.precision = normalizedPrecision;
      helpers.saveField("precision", normalizedPrecision);
    }

    var entityField = helpers.entityField(
      "Climate Entity", helpers.idPrefix + "entity", b.entity,
      "e.g. climate.living_room", ["climate"], "entity", true,
      "Add a climate entity before saving.");
    panel.appendChild(entityField.field);

    panel.appendChild(helpers.textField(
      "Label", helpers.idPrefix + "label", b.label, "Climate", "label", true).field);

    function setActive(buttons, value) {
      for (var key in buttons) buttons[key].classList.toggle("active", key === value);
    }

    var labelDisplayField = helpers.segmentControl([
      ["label", "Label"],
      ["status", "Status"],
      ["actual", "Actual Temp"],
      ["target", "Target Temp"],
    ], climateLabelDisplayMode(b), function (value) {
      setActive(labelDisplayField.buttons, value);
      setClimateLabelDisplayMode(b, value);
      helpers.saveField("options", b.options);
      scheduleRender();
    });
    panel.appendChild(helpers.fieldWithControl("Label Display", null, labelDisplayField.segment));

    var numberDisplayField = helpers.segmentControl([
      ["icon", "Icon"],
      ["actual", "Actual Temp"],
      ["target", "Target Temp"],
    ], climateNumberDisplayMode(b), function (value) {
      setActive(numberDisplayField.buttons, value);
      setClimateNumberDisplayMode(b, value);
      helpers.saveField("options", b.options);
      syncIconFields();
      scheduleRender();
    });
    panel.appendChild(helpers.fieldWithControl("Icon & Temperatures", null, numberDisplayField.segment));

    var iconFields = condField();
    var offIconPicker = helpers.iconPickerField(
      helpers.idPrefix + "climate-icon-picker",
      helpers.idPrefix + "climate-icon",
      b.icon || "Thermostat",
      function (opt) {
        b.icon = opt || "Thermostat";
        helpers.saveField("icon", b.icon);
        scheduleRender();
      },
      "Off Icon"
    );
    iconFields.appendChild(offIconPicker);
    var onIconPicker = helpers.iconPickerField(
      helpers.idPrefix + "climate-icon-on-picker",
      helpers.idPrefix + "climate-icon-on",
      b.icon_on || "Auto",
      function (opt) {
        b.icon_on = opt || "Auto";
        helpers.saveField("icon_on", b.icon_on);
        scheduleRender();
      },
      "On Icon"
    );
    iconFields.appendChild(onIconPicker);
    function syncIconFields() {
      iconFields.classList.toggle("sp-visible", climateNumberDisplayMode(b) === "icon");
    }
    syncIconFields();
    panel.appendChild(iconFields);

    var precisionField = helpers.selectField("Unit Precision", helpers.idPrefix + "climate-precision", [
      ["", "10"],
      ["1", "10.2"],
    ], climateConfig.precision);
    var precision = precisionField.select;
    function saveClimateAdvancedSettings() {
      b.precision = climatePrecisionConfig(precision.value, minInp.value, maxInp.value);
      helpers.saveField("precision", b.precision);
      scheduleRender();
    }
    precision.addEventListener("change", saveClimateAdvancedSettings);
    panel.appendChild(precisionField.field);

    var hasRange = !!(climateConfig.min || climateConfig.max);
    var advancedToggleSection = helpers.toggleSection(
      "Advanced",
      helpers.idPrefix + "climate-advanced-toggle",
      hasRange
    );
    var advancedToggle = advancedToggleSection.toggle;
    var advanced = advancedToggleSection.section;
    panel.appendChild(advancedToggle.row);
    if (hasRange) advanced.classList.add("sp-visible");

    var minField = helpers.textField(
      "Minimum Temperature", helpers.idPrefix + "climate-min", climateConfig.min, "e.g. -25");
    var minInp = minField.input;
    minInp.inputMode = "decimal";
    advanced.appendChild(minField.field);

    var maxField = helpers.textField(
      "Maximum Temperature", helpers.idPrefix + "climate-max", climateConfig.max, "e.g. 5");
    var maxInp = maxField.input;
    maxInp.inputMode = "decimal";
    advanced.appendChild(maxField.field);

    minInp.addEventListener("change", saveClimateAdvancedSettings);
    maxInp.addEventListener("change", saveClimateAdvancedSettings);
    advancedToggle.input.addEventListener("change", function () {
      if (this.checked) {
        advanced.classList.add("sp-visible");
      } else {
        advanced.classList.remove("sp-visible");
        minInp.value = "";
        maxInp.value = "";
        saveClimateAdvancedSettings();
      }
    });
    panel.appendChild(advanced);
  },
  renderPreview: function (b, helpers) {
    var climateConfig = parseClimatePrecisionConfig(b.precision);
    var prec = parseInt(climateConfig.precision || "0", 10) || 0;
    var unit = temperatureUnitSymbol();
    var actualVal = (21).toFixed(prec);
    var targetVal = (20).toFixed(prec);
    var numberMode = climateNumberDisplayMode(b);
    var numberVal = numberMode === "actual" ? actualVal : targetVal;
    var labelMode = climateLabelDisplayMode(b);
    var label = (b.label && b.label.trim()) || "Climate";
    if (labelMode === "status") {
      label = "Idle";
    } else if (labelMode === "actual") {
      label = actualVal + unit;
    } else if (labelMode === "target") {
      label = targetVal + unit;
    }
    if (numberMode === "icon") {
      var iconName = b.icon && b.icon !== "Auto" ? b.icon : "Thermostat";
      return {
        iconHtml: '<span class="sp-btn-icon mdi mdi-' + iconSlug(iconName) + '"></span>',
        labelHtml:
          '<span class="sp-btn-label-row"><span class="sp-btn-label">' +
          helpers.escHtml(label) + '</span><span class="sp-type-badge mdi mdi-thermostat"></span></span>',
      };
    }
    return {
      iconHtml:
        '<span class="sp-sensor-preview">' +
          '<span class="sp-sensor-value">' + numberVal + '</span>' +
          '<span class="sp-sensor-unit">' + unit + '</span>' +
        '</span>',
      labelHtml:
        '<span class="sp-btn-label-row"><span class="sp-btn-label">' +
        helpers.escHtml(label) + '</span><span class="sp-type-badge mdi mdi-thermostat"></span></span>',
    };
  },
});
