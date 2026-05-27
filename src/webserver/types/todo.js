// Experimental Home Assistant todo card.
var TODO_CARD_METADATA = {
  entity: {
    label: "Todo Entity",
    idSuffix: "todo-entity",
    placeholder: "e.g. todo.shopping",
    domains: function () { return cardContractDomains("todo"); },
    bindName: "entity",
    rerender: true,
    requiredMessage: "Add a todo entity before saving.",
  },
  labelField: {
    label: "Label",
    idSuffix: "todo-label",
    field: "label",
    placeholder: "e.g. Shopping",
    rerender: true,
  },
  icon: {
    pickerIdSuffix: "todo-icon-picker",
    idSuffix: "todo-icon",
    field: "icon",
    fallback: "Check",
  },
  countDisplay: {
    label: "Status",
    options: [
      ["icon", "Icon"],
      ["count", "Item Counter"],
    ],
    value: function (b) {
      return todoCardShowCount(b) ? "count" : "icon";
    },
    onSelect: function (button, cardHelpers, value) {
      setTodoCardShowCount(button, value === "count");
      cardHelpers.saveField("options", button.options);
    },
  },
  labelDisplay: {
    label: "Label",
    options: [
      ["label", "Label"],
      ["count", "Item Counter"],
    ],
    value: function (b) {
      return todoCardLabelShowsCount(b) ? "count" : "label";
    },
    onSelect: function (button, cardHelpers, value) {
      setTodoCardLabelShowsCount(button, value === "count");
      cardHelpers.saveField("options", button.options);
    },
  },
  completedDisplay: {
    label: "Show Completed Items",
    idSuffix: "todo-show-completed",
    checked: function (b) { return todoCardShowsCompletedItems(b); },
    onChange: function (button, cardHelpers, checked) {
      setTodoCardShowsCompletedItems(button, checked);
      cardHelpers.saveField("options", button.options);
    },
  },
  preview: {
    badge: "check",
  },
};

function normalizeTodoConfig(b) {
  if (!b) return;
  b.sensor = "";
  b.unit = "";
  b.precision = "";
  b.options = normalizeTodoOptions(b.options);
  b.icon_on = "Auto";
  if (!b.icon || b.icon === "Auto") b.icon = "Check";
}

registerButtonType("todo", {
  label: function () { return cardContractCardLabel("todo"); },
  allowInSubpage: function () { return cardContractAllowInSubpage("todo"); },
  pickerKey: function () { return cardContractPickerKey("todo"); },
  experimental: function () { return cardContractExperimental("todo"); },
  hidden: function () { return cardContractHidden("todo"); },
  hideLabel: true,
  defaultConfig: function () { return cardContractDefaultConfig("todo"); },
  cardMetadata: TODO_CARD_METADATA,
  onSelect: function (b) {
    b.entity = "";
    b.label = "";
    b.icon = "Check";
    normalizeTodoConfig(b);
  },
  renderSettings: function (panel, b, slot, helpers) {
    normalizeTodoConfig(b);
    helpers.renderCardEntityField(panel, b, helpers, TODO_CARD_METADATA);

    helpers.renderCardSegmentControl(panel, b, helpers, Object.assign({}, TODO_CARD_METADATA.labelDisplay, {
      onSelect: function (button, cardHelpers, value) {
        setTodoCardLabelShowsCount(button, value === "count");
        cardHelpers.saveField("options", button.options);
        syncLabelField();
        scheduleRender();
      },
    }));
    var labelSection = condField();
    labelSection.classList.add("sp-climate-settings-gap");
    helpers.renderCardTextField(labelSection, b, helpers, TODO_CARD_METADATA.labelField);
    panel.appendChild(labelSection);

    helpers.renderCardSegmentControl(panel, b, helpers, Object.assign({}, TODO_CARD_METADATA.countDisplay, {
      onSelect: function (button, cardHelpers, value) {
        setTodoCardShowCount(button, value === "count");
        cardHelpers.saveField("options", button.options);
        syncIconPicker();
        scheduleRender();
      },
    }));
    var iconSection = condField();
    iconSection.classList.add("sp-climate-settings-gap");
    helpers.renderCardIconPicker(iconSection, b, helpers, TODO_CARD_METADATA.icon);
    panel.appendChild(iconSection);

    helpers.renderCardOptionToggle(panel, b, helpers, TODO_CARD_METADATA.completedDisplay);
    function syncLabelField() {
      labelSection.classList.toggle("sp-visible", !todoCardLabelShowsCount(b));
    }
    function syncIconPicker() {
      iconSection.classList.toggle("sp-visible", !todoCardShowCount(b));
    }
    syncLabelField();
    syncIconPicker();
  },
  renderPreview: function (b, helpers) {
    var label = todoCardLabelShowsCount(b) ? "3 items" : (b.label || b.entity || "Todo");
    return {
      iconHtml: todoCardShowCount(b)
        ? cardSensorPreviewHtml(b, helpers, "3", "")
        : '<span class="sp-btn-icon mdi mdi-' + iconSlug(b.icon || "Check") + '"></span>',
      labelHtml: cardBadgeLabelHtml(helpers, label, TODO_CARD_METADATA.preview.badge),
    };
  },
});
