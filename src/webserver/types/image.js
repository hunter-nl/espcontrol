// Read-only Home Assistant camera image card.
var IMAGE_CARD_METADATA = {
  entity: {
    label: "Camera Entity",
    idSuffix: "entity",
    placeholder: "e.g. camera.front_door",
    domains: function () { return cardContractDomains("image"); },
    bindName: "entity",
    rerender: true,
    requiredMessage: "Add a camera entity before saving.",
  },
};

registerButtonType("image", {
  label: function () { return cardContractCardLabel("image"); },
  allowInSubpage: function () { return cardContractAllowInSubpage("image"); },
  pickerKey: function () { return cardContractPickerKey("image"); },
  experimental: function () { return cardContractExperimental("image"); },
  hidden: function () { return cardContractHidden("image"); },
  hideLabel: true,
  defaultConfig: function () { return cardContractDefaultConfig("image"); },
  cardMetadata: IMAGE_CARD_METADATA,
  onSelect: function (b) {
    b.label = "";
    b.icon = "Auto";
    b.icon_on = "Auto";
    b.sensor = "";
    b.unit = "";
    b.precision = "";
    b.options = "";
  },
  renderSettings: function (panel, b, slot, helpers) {
    b.label = "";
    b.icon = "Auto";
    b.icon_on = "Auto";
    b.sensor = "";
    b.unit = "";
    b.precision = "";
    b.options = "";
    helpers.renderCardEntityField(panel, b, helpers, IMAGE_CARD_METADATA);
  },
  renderPreview: function () {
    return {
      buttonClass: "sp-image-card",
      iconHtml:
        '<span class="sp-image-preview">' +
        '<span class="sp-image-preview-sky"></span>' +
        '<span class="sp-image-preview-ground"></span>' +
        '<span class="sp-image-preview-shape"></span>' +
        '</span>',
      labelHtml: "",
    };
  },
});
