// Read-only date card: displays either the day/month or local time/date.
var DATE_TIME_CARD_METADATA = {
  mode: {
    label: "Type",
    idSuffix: "calendar-mode",
    options: [
      { value: "datetime", label: "Time & Date" },
      { value: "", label: "Date" },
      { value: "timezone", label: "World Clock" }
    ],
    value: function (b) {
      return b.type === "timezone" ? "timezone" : (b.precision === "datetime" ? "datetime" : "");
    },
    onChange: function (b, helpers) {
      setDateTimeCardMode(b, this.value, helpers);
    },
  },
  largeNumbers: {
    label: "Large Date / Time Numbers",
    idSuffix: "large-date-time-numbers",
  },
  preview: {
    dateBadge: "calendar-month",
    timezoneBadge: "map-clock",
  },
};

function defaultTimezoneCardEntity() {
  return (typeof state !== "undefined" && state.timezone) || "UTC (GMT+0)";
}

function setDateTimeCardMode(b, mode, helpers) {
  if (b.type !== "timezone" && mode !== "timezone") {
    b.precision = mode === "datetime" ? "datetime" : "";
    helpers.saveField("precision", b.precision);
    return;
  }

  if (mode === "timezone") {
    b.type = "timezone";
    helpers.applyCardMetadataFields(b, helpers, {
      type: "timezone",
      entity: defaultTimezoneCardEntity,
      label: "",
      icon: "Auto",
      icon_on: "Auto",
      sensor: "",
      unit: "",
      precision: "",
      options: b.options,
    });
    renderButtonSettings();
    return;
  }

  b.type = "calendar";
  helpers.applyCardMetadataFields(b, helpers, {
    type: "calendar",
    entity: "sensor.date",
    label: "",
    icon: "Auto",
    icon_on: "Auto",
    sensor: "",
    unit: "",
    precision: mode === "datetime" ? "datetime" : "",
    options: b.options,
  });
  if (mode !== "datetime") b.precision = "";
  renderButtonSettings();
}

registerButtonType("calendar", {
  label: function () { return cardContractCardLabel("calendar"); },
  allowInSubpage: function () { return cardContractAllowInSubpage("calendar"); },
  pickerKey: function () { return cardContractPickerKey("calendar"); },
  experimental: function () { return cardContractExperimental("calendar"); },
  hidden: function () { return cardContractHidden("calendar"); },
  hideLabel: true,
  defaultConfig: function () { return cardContractDefaultConfig("calendar"); },
  cardMetadata: DATE_TIME_CARD_METADATA,
  onSelect: function (b) {
    b.entity = "sensor.date";
    b.label = "";
    b.icon = "Auto";
    b.icon_on = "Auto";
    b.sensor = "";
    b.unit = "";
    b.options = "";
    b.precision = b.precision === "datetime" ? "datetime" : "";
  },
  renderSettings: function (panel, b, slot, helpers) {
    if (!b.entity) b.entity = "sensor.date";
    if (b.precision !== "datetime") b.precision = "";

    helpers.renderCardModeSelector(panel, b, helpers, DATE_TIME_CARD_METADATA);
    helpers.renderCardLargeNumbersToggle(panel, b, helpers, DATE_TIME_CARD_METADATA);
  },
  renderPreview: function (b, helpers) {
    var now = new Date();
    var isDateTime = b.precision === "datetime";
    var day = String(now.getDate());
    var month = typeof monthNameForIndex === "function"
      ? monthNameForIndex(now.getMonth())
      : now.toLocaleString("en", { month: "long" });

    if (isDateTime) {
      var use12h = typeof state !== "undefined" && state.clockFormat === "12h";
      var hour = now.getHours();
      var minute = String(now.getMinutes()).padStart(2, "0");
      var timeValue = "";

      if (use12h) {
        var hour12 = hour % 12;
        if (hour12 === 0) hour12 = 12;
        timeValue = String(hour12) + ":" + minute;
      } else {
        timeValue = String(hour).padStart(2, "0") + ":" + minute;
      }

      return {
        iconHtml: cardSensorPreviewHtml(b, helpers, timeValue, null),
        labelHtml: cardBadgeLabelHtml(helpers, day + " " + month, DATE_TIME_CARD_METADATA.preview.dateBadge),
      };
    }

    return {
      iconHtml: cardSensorPreviewHtml(b, helpers, day, null),
      labelHtml: cardBadgeLabelHtml(helpers, month, DATE_TIME_CARD_METADATA.preview.dateBadge),
    };
  },
});
