// Read-only sensor card: displays either numeric data or a text state.
var SENSOR_CARD_METADATA = {
  entity: {
    label: "Sensor Entity",
    idSuffix: "sensor",
    placeholder: "e.g. sensor.living_room_temperature",
    domains: function () { return cardContractDomains("sensor"); },
    bindName: "sensor",
    rerender: true,
    requiredMessage: "Add a sensor entity before saving.",
  },
  segment: {
    label: "Type",
    options: [
      ["numeric", "Numeric"],
      ["text", "Text"],
    ],
    value: function (b) {
      return b.precision === "text" ? "text" : "numeric";
    },
  },
  largeNumbers: {
    label: "Large Sensor Numbers",
    idSuffix: "large-sensor-numbers",
    supported: function (b) {
      return b.precision !== "text";
    },
  },
  preview: {
    numericBadge: "gauge",
    textBadge: "format-text",
  },
};

registerButtonType("sensor", {
  label: function () { return cardContractCardLabel("sensor"); },
  allowInSubpage: function () { return cardContractAllowInSubpage("sensor"); },
  pickerKey: function () { return cardContractPickerKey("sensor"); },
  experimental: function () { return cardContractExperimental("sensor"); },
  hidden: function () { return cardContractHidden("sensor"); },
  hideLabel: true,
  defaultConfig: function () { return cardContractDefaultConfig("sensor"); },
  cardMetadata: SENSOR_CARD_METADATA,
  onSelect: function (b) {
    b.entity = "";
    b.icon_on = "Auto";
    if (!b.precision) b.precision = "";
    if (b.precision !== "text") b.icon = "Auto";
    b.options = normalizeSensorOptions(b.options, b.precision);
  },
  renderSettings: function (panel, b, slot, helpers) {
    var isTextMode = b.precision === "text";

    helpers.renderCardEntityField(panel, b, helpers, SENSOR_CARD_METADATA);

    var mode = helpers.renderCardSegmentControl(panel, b, helpers, {
      segment: Object.assign({}, SENSOR_CARD_METADATA.segment, {
        onSelect: function (button, cardHelpers, value) {
          setMode(value, true);
        },
      }),
    });
    var numericBtn = mode.buttons.numeric;
    var textBtn = mode.buttons.text;

    var numericSection = condField();

    var labelField = helpers.renderCardTextField(numericSection, b, helpers, {
      label: "Label",
      idSuffix: "label",
      field: "label",
      placeholder: "e.g. Living Room",
      rerender: true,
    });
    var labelInp = labelField.input;

    var unitField = helpers.renderCardTextField(numericSection, b, helpers, {
      label: "Unit",
      idSuffix: "unit",
      field: "unit",
      placeholder: "e.g. \u00B0C",
      rerender: true,
    });
    var unitInp = unitField.input;
    unitInp.className = "sp-input";

    var precisionField = helpers.precisionField(helpers.idPrefix + "precision",
      !isTextMode ? (b.precision || "0") : "0", function () {
      b.precision = this.value === "0" ? "" : this.value;
      helpers.saveField("precision", b.precision);
    });
    var precisionSelect = precisionField.select;
    numericSection.appendChild(precisionField.field);

    helpers.renderCardLargeNumbersToggle(numericSection, b, helpers, SENSOR_CARD_METADATA);
    panel.appendChild(numericSection);

    var textSection = condField();
    var textIconPicker = helpers.renderCardIconPicker(textSection, b, helpers, {
      pickerIdSuffix: "icon-picker",
      idSuffix: "icon",
      field: "icon",
      fallback: "Auto",
    });
    panel.appendChild(textSection);

    var hasStateLabels = sensorStateLabelsEnabled(b);
    var advancedToggleSection = helpers.toggleSection(
      "Advanced",
      helpers.idPrefix + "sensor-advanced-toggle",
      hasStateLabels
    );
    var advancedToggle = advancedToggleSection.toggle;
    var advanced = advancedToggleSection.section;
    panel.appendChild(advancedToggle.row);
    if (hasStateLabels) advanced.classList.add("sp-visible");

    var inputTextField = helpers.textField(
      "Input Status",
      helpers.idPrefix + "sensor-state-input",
      sensorStateInput(b),
      "e.g. high"
    );
    var inputTextInp = inputTextField.input;
    advanced.appendChild(inputTextField.field);

    var outputTextField = helpers.textField(
      "Display Text",
      helpers.idPrefix + "sensor-state-output",
      sensorStateOutput(b),
      "e.g. Please empty"
    );
    var outputTextInp = outputTextField.input;
    advanced.appendChild(outputTextField.field);

    function saveStateTranslation() {
      setSensorStateTranslation(b, advancedToggle.input.checked, inputTextInp.value, outputTextInp.value);
      helpers.saveField("options", b.options);
    }

    inputTextInp.addEventListener("change", saveStateTranslation);
    outputTextInp.addEventListener("change", saveStateTranslation);
    advancedToggle.input.addEventListener("change", function () {
      if (this.checked) {
        if (!isTextMode) setMode("text", true);
        advanced.classList.add("sp-visible");
      } else {
        advanced.classList.remove("sp-visible");
        inputTextInp.value = "";
        outputTextInp.value = "";
      }
      saveStateTranslation();
    });
    panel.appendChild(advanced);

    function setMode(mode, persist) {
      isTextMode = mode === "text";
      numericBtn.classList.toggle("active", !isTextMode);
      textBtn.classList.toggle("active", isTextMode);
      numericSection.classList.toggle("sp-visible", !isTextMode);
      textSection.classList.toggle("sp-visible", isTextMode);
      if (!persist) return;
      if (isTextMode) {
        b.precision = "text";
        b.label = "";
        b.unit = "";
        b.icon_on = "Auto";
        b.options = normalizeSensorOptions(b.options, "text");
        labelInp.value = "";
        unitInp.value = "";
        helpers.saveField("precision", "text");
        helpers.saveField("label", "");
        helpers.saveField("unit", "");
        helpers.saveField("icon_on", "Auto");
        helpers.saveField("options", b.options);
      } else {
        b.precision = "";
        b.icon = "Auto";
        b.options = normalizeSensorOptions(b.options, "");
        helpers.saveField("precision", "");
        helpers.saveField("icon", "Auto");
        helpers.saveField("options", b.options);
        advancedToggle.input.checked = false;
        advanced.classList.remove("sp-visible");
        inputTextInp.value = "";
        outputTextInp.value = "";
        var iconPreview = textIconPicker.querySelector(".sp-icon-picker-preview");
        if (iconPreview) iconPreview.className = "sp-icon-picker-preview mdi mdi-cog";
        var iconInput = textIconPicker.querySelector(".sp-icon-picker-input");
        if (iconInput) iconInput.value = "Auto";
        precisionSelect.value = "0";
      }
    }

    setMode(isTextMode ? "text" : "numeric", false);
  },
  renderPreview: function (b, helpers) {
    if (b.precision === "text") {
      var iconName = b.icon && b.icon !== "Auto" ? iconSlug(b.icon) : "cog";
      return {
        iconHtml: '<span class="sp-btn-icon mdi mdi-' + iconName + '"></span>',
        labelHtml: cardBadgeLabelHtml(helpers, "State", SENSOR_CARD_METADATA.preview.textBadge),
      };
    }

    var label = b.label || b.sensor || "Sensor";
    var unit = b.unit || "";
    var prec = parseInt(b.precision || "0", 10) || 0;
    var sampleVal = (0).toFixed(prec);
    return {
      iconHtml: cardSensorPreviewHtml(b, helpers, sampleVal, unit),
      labelHtml: cardBadgeLabelHtml(helpers, label, SENSOR_CARD_METADATA.preview.numericBadge),
    };
  },
});
