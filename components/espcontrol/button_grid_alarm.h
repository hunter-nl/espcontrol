#pragma once

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

// ── Alarm card controls ───────────────────────────────────────────────

constexpr uint32_t ALARM_TRIGGERED_COLOR = 0xC62828;

struct AlarmCardCtx {
  std::string entity_id;
  std::string label;
  std::string options;
  std::string state;
  std::string arm_mode;
  lv_obj_t *btn = nullptr;
  lv_obj_t *icon_lbl = nullptr;
  lv_obj_t *grid_page = nullptr;
  lv_obj_t *page = nullptr;
  TransientStatusLabel *status_label = nullptr;
  const lv_font_t *label_font = nullptr;
  const lv_font_t *pin_label_font = nullptr;
  const lv_font_t *key_label_font = nullptr;
  const lv_font_t *icon_font = nullptr;
  uint32_t on_color = DEFAULT_SLIDER_COLOR;
  uint32_t off_color = DEFAULT_OFF_COLOR;
  uint32_t tertiary_color = DEFAULT_TERTIARY_COLOR;
  int width_compensation_percent = 100;
  int grid_cols = 3;
  bool available = false;
};

struct AlarmActionCtx {
  AlarmCardCtx *card = nullptr;
  std::string mode;
  bool requires_pin = true;
};

struct AlarmPinModalUi {
  lv_obj_t *overlay = nullptr;
  lv_obj_t *panel = nullptr;
  lv_obj_t *back_btn = nullptr;
  lv_obj_t *pin_lbl = nullptr;
  AlarmActionCtx *active = nullptr;
  std::string pin;
};

struct AlarmControlModalUi {
  lv_obj_t *overlay = nullptr;
  lv_obj_t *panel = nullptr;
  lv_obj_t *back_btn = nullptr;
  lv_obj_t *rail = nullptr;
  lv_obj_t *mode_btn[3] = {};
  lv_obj_t *mode_icon[3] = {};
  lv_obj_t *mode_label[3] = {};
  AlarmActionCtx actions[3];
  AlarmCardCtx *active = nullptr;
};

struct AlarmToastUi {
  lv_obj_t *box = nullptr;
  lv_timer_t *timer = nullptr;
};

inline AlarmControlModalUi &alarm_control_modal_ui() {
  static AlarmControlModalUi ui;
  return ui;
}

inline AlarmPinModalUi &alarm_pin_modal_ui() {
  static AlarmPinModalUi ui;
  return ui;
}

inline AlarmToastUi &alarm_toast_ui() {
  static AlarmToastUi ui;
  return ui;
}

inline const char *alarm_card_icon(const ParsedCfg &p) {
  if (!p.icon.empty() && p.icon != "Auto") return find_icon(p.icon.c_str());
  return find_icon("Security");
}

inline void setup_alarm_card(BtnSlot &s, const ParsedCfg &p) {
  lv_label_set_text(s.icon_lbl, alarm_card_icon(p));
  lv_label_set_text(s.text_lbl, p.label.empty() ? "Alarm" : p.label.c_str());
}

inline bool alarm_pin_arm_required(const std::string &options) {
  return cfg_option_value(options, "pin_arm") != "0";
}

inline bool alarm_pin_disarm_required(const std::string &options) {
  return cfg_option_value(options, "pin_disarm") != "0";
}

inline bool alarm_action_valid(const std::string &mode) {
  return mode == "away" || mode == "home" || mode == "night" || mode == "disarm";
}

inline bool alarm_action_visible(const std::string &options, const std::string &mode) {
  std::string actions = cfg_option_value(options, "actions");
  if (actions.empty()) return true;
  bool saw_valid = false;
  size_t start = 0;
  while (start <= actions.length()) {
    size_t end = actions.find('|', start);
    if (end == std::string::npos) end = actions.length();
    std::string action = actions.substr(start, end - start);
    if (alarm_action_valid(action)) {
      saw_valid = true;
      if (action == mode) return true;
    }
    start = end + 1;
  }
  return !saw_valid;
}

inline bool alarm_action_requires_pin(const std::string &options, const std::string &mode) {
  return mode == "disarm" ? alarm_pin_disarm_required(options) : alarm_pin_arm_required(options);
}

inline const char *alarm_action_label(const std::string &mode) {
  if (mode == "away") return "Arm Away";
  if (mode == "home") return "Arm Home";
  if (mode == "night") return "Arm Night";
  if (mode == "disarm") return "Disarm";
  return "Alarm";
}

inline const char *alarm_action_icon(const std::string &mode) {
  if (mode == "away") return find_icon("Security");
  if (mode == "home") return find_icon("Home");
  if (mode == "night") return find_icon("Weather Night");
  if (mode == "disarm") return find_icon("Lock Open");
  return find_icon("Alarm");
}

inline void setup_alarm_action_card(BtnSlot &s, const ParsedCfg &p) {
  lv_label_set_text(s.icon_lbl, alarm_action_icon(p.sensor));
  if (!p.icon.empty() && p.icon != "Auto") {
    lv_label_set_text(s.icon_lbl, find_icon(p.icon.c_str()));
  }
  lv_label_set_text(s.text_lbl,
    p.label.empty() ? alarm_action_label(p.sensor) : p.label.c_str());
}

inline const char *alarm_action_service(const std::string &mode) {
  if (mode == "away") return "alarm_control_panel.alarm_arm_away";
  if (mode == "home") return "alarm_control_panel.alarm_arm_home";
  if (mode == "night") return "alarm_control_panel.alarm_arm_night";
  if (mode == "disarm") return "alarm_control_panel.alarm_disarm";
  return nullptr;
}

inline const char *alarm_control_button_label(const std::string &mode) {
  if (mode == "home") return "Home";
  if (mode == "away") return "Away";
  if (mode == "disarm") return "Disarmed";
  return alarm_action_label(mode);
}

inline std::string alarm_state_label(const std::string &state) {
  if (state.empty()) return "Unavailable";
  if (state == "disarmed") return "Disarmed";
  if (state == "armed_away") return "Armed Away";
  if (state == "armed_home") return "Armed Home";
  if (state == "armed_night") return "Armed Night";
  if (state == "armed_custom_bypass") return "Armed Custom";
  if (state == "arming") return "Arming";
  if (state == "pending") return "Pending";
  if (state == "triggered") return "Triggered";
  if (state == "unavailable") return "Unavailable";
  if (state == "unknown") return "Unknown";
  return sentence_cap_text(state);
}

inline bool alarm_state_is_armed(const std::string &state) {
  return state.compare(0, 5, "armed") == 0;
}

inline bool alarm_state_is_active(const std::string &state) {
  return alarm_state_is_armed(state) || state == "arming" || state == "pending";
}

inline std::string alarm_action_achieved_state(const std::string &mode) {
  if (mode == "away") return "armed_away";
  if (mode == "home") return "armed_home";
  if (mode == "night") return "armed_night";
  if (mode == "disarm") return "disarmed";
  return "";
}

inline std::string alarm_normalized_arm_mode(const std::string &arm_mode) {
  if (arm_mode == "away") return "armed_away";
  if (arm_mode == "home") return "armed_home";
  if (arm_mode == "night") return "armed_night";
  if (arm_mode == "armed_away" || arm_mode == "armed_home" ||
      arm_mode == "armed_night" || arm_mode == "armed_custom_bypass") {
    return arm_mode;
  }
  return "";
}

inline std::string alarm_effective_state(const std::string &state,
                                         const std::string &arm_mode) {
  if (state != "arming") return state;
  std::string normalized = alarm_normalized_arm_mode(arm_mode);
  return normalized.empty() ? state : normalized;
}

inline bool alarm_action_state_matches(const std::string &mode, const std::string &state,
                                       const std::string &arm_mode = "") {
  std::string achieved_state = alarm_action_achieved_state(mode);
  return !achieved_state.empty() && alarm_effective_state(state, arm_mode) == achieved_state;
}

inline bool alarm_state_releases_label(const std::string &state) {
  return state == "disarmed" || alarm_state_is_armed(state);
}

inline std::string alarm_state_control_mode(const std::string &state) {
  if (state == "armed_home") return "home";
  if (state == "armed_away") return "away";
  if (state == "disarmed") return "disarm";
  return "";
}

inline void alarm_control_update_modal(AlarmCardCtx *ctx);

inline void alarm_set_card_state_colors(AlarmCardCtx *ctx, uint32_t checked_color) {
  if (!ctx || !ctx->btn) return;
  lv_obj_set_style_bg_color(ctx->btn, lv_color_hex(ctx->off_color),
    static_cast<lv_style_selector_t>(LV_PART_MAIN) | static_cast<lv_style_selector_t>(LV_STATE_DEFAULT));
  lv_obj_set_style_bg_color(ctx->btn, lv_color_hex(checked_color),
    static_cast<lv_style_selector_t>(LV_PART_MAIN) | static_cast<lv_style_selector_t>(LV_STATE_CHECKED));
  lv_obj_set_style_bg_color(ctx->btn, lv_color_hex(checked_color),
    static_cast<lv_style_selector_t>(LV_PART_MAIN) | static_cast<lv_style_selector_t>(LV_STATE_PRESSED));
}

inline void alarm_apply_home_state(AlarmCardCtx *ctx, const std::string &state) {
  if (!ctx || !ctx->btn) return;
  ctx->state = state;
  bool unavailable = state.empty() || state == "unavailable" || state == "unknown";
  ctx->available = !unavailable;
  apply_control_availability(ctx->btn, ctx->btn, ctx->available);

  bool triggered = state == "triggered";
  bool active = alarm_state_is_active(state) || triggered;
  alarm_set_card_state_colors(ctx, triggered ? ALARM_TRIGGERED_COLOR : ctx->on_color);
  if (active) lv_obj_add_state(ctx->btn, LV_STATE_CHECKED);
  else lv_obj_clear_state(ctx->btn, LV_STATE_CHECKED);

  transient_status_label_show_if_changed(
    ctx->status_label,
    alarm_state_label(state),
    alarm_state_releases_label(state) && !unavailable && !triggered);
  alarm_control_update_modal(ctx);
}

inline void alarm_apply_home_arm_mode(AlarmCardCtx *ctx, const std::string &arm_mode) {
  if (!ctx) return;
  ctx->arm_mode = arm_mode;
  alarm_control_update_modal(ctx);
}

inline void subscribe_alarm_state(AlarmCardCtx *ctx) {
  if (!ctx || ctx->entity_id.empty()) return;
  esphome::api::global_api_server->subscribe_home_assistant_state(
    ctx->entity_id, {},
    std::function<void(esphome::StringRef)>([ctx](esphome::StringRef state) {
      alarm_apply_home_state(ctx, string_ref_limited(state, HA_SHORT_STATE_MAX_LEN));
    })
  );
  esphome::api::global_api_server->subscribe_home_assistant_state(
    ctx->entity_id, std::string("arm_mode"),
    std::function<void(esphome::StringRef)>([ctx](esphome::StringRef arm_mode) {
      alarm_apply_home_arm_mode(ctx, string_ref_limited(arm_mode, HA_SHORT_STATE_MAX_LEN));
    })
  );
}

inline void alarm_apply_action_availability(AlarmCardCtx *ctx, const std::string &state) {
  if (!ctx || !ctx->btn) return;
  bool unavailable = state.empty() || state == "unavailable" || state == "unknown";
  ctx->available = !unavailable;
  apply_control_availability(ctx->btn, ctx->btn, ctx->available);
}

inline void alarm_apply_action_state(AlarmCardCtx *ctx, const std::string &mode,
                                     const std::string &state) {
  alarm_apply_action_availability(ctx, state);
  if (!ctx || !ctx->btn) return;
  ctx->state = state;
  bool unavailable = state.empty() || state == "unavailable" || state == "unknown";
  bool active = !unavailable && alarm_action_state_matches(mode, state, ctx->arm_mode);
  if (active) lv_obj_add_state(ctx->btn, LV_STATE_CHECKED);
  else lv_obj_clear_state(ctx->btn, LV_STATE_CHECKED);
}

inline void alarm_apply_action_arm_mode(AlarmCardCtx *ctx, const std::string &mode,
                                        const std::string &arm_mode) {
  if (!ctx || !ctx->btn) return;
  ctx->arm_mode = arm_mode;
  bool unavailable = ctx->state.empty() || ctx->state == "unavailable" || ctx->state == "unknown";
  bool active = !unavailable && alarm_action_state_matches(mode, ctx->state, ctx->arm_mode);
  if (active) lv_obj_add_state(ctx->btn, LV_STATE_CHECKED);
  else lv_obj_clear_state(ctx->btn, LV_STATE_CHECKED);
}

inline void subscribe_alarm_action_availability(AlarmCardCtx *ctx) {
  if (!ctx || ctx->entity_id.empty()) return;
  ctx->available = true;
  esphome::api::global_api_server->subscribe_home_assistant_state(
    ctx->entity_id, {},
    std::function<void(esphome::StringRef)>([ctx](esphome::StringRef state) {
      alarm_apply_action_availability(ctx, string_ref_limited(state, HA_SHORT_STATE_MAX_LEN));
    })
  );
}

inline void subscribe_alarm_action_state(AlarmCardCtx *ctx, const std::string &mode) {
  if (!ctx || ctx->entity_id.empty()) return;
  ctx->available = true;
  esphome::api::global_api_server->subscribe_home_assistant_state(
    ctx->entity_id, {},
    std::function<void(esphome::StringRef)>([ctx, mode](esphome::StringRef state) {
      alarm_apply_action_state(ctx, mode, string_ref_limited(state, HA_SHORT_STATE_MAX_LEN));
    })
  );
  esphome::api::global_api_server->subscribe_home_assistant_state(
    ctx->entity_id, std::string("arm_mode"),
    std::function<void(esphome::StringRef)>([ctx, mode](esphome::StringRef arm_mode) {
      alarm_apply_action_arm_mode(ctx, mode, string_ref_limited(arm_mode, HA_SHORT_STATE_MAX_LEN));
    })
  );
}

inline void alarm_toast_timer_cb(lv_timer_t *timer) {
  AlarmToastUi &ui = alarm_toast_ui();
  if (ui.box) lv_obj_del(ui.box);
  ui.box = nullptr;
  ui.timer = nullptr;
  lv_timer_del(timer);
}

inline void alarm_hide_toast() {
  AlarmToastUi &ui = alarm_toast_ui();
  if (ui.box) lv_obj_del(ui.box);
  if (ui.timer) lv_timer_del(ui.timer);
  ui = AlarmToastUi();
}

inline lv_coord_t alarm_failure_banner_width(AlarmCardCtx *ctx) {
  lv_disp_t *disp = lv_disp_get_default();
  lv_coord_t screen_w = disp ? lv_disp_get_hor_res(disp) : 480;
  int cols = ctx && ctx->grid_cols > 0 ? ctx->grid_cols : 3;
  if (cols < 1) cols = 1;

  lv_obj_t *grid = ctx && ctx->grid_page ? ctx->grid_page : lv_scr_act();
  lv_coord_t pad_left = 0;
  lv_coord_t pad_right = 0;
  lv_coord_t gap_col = 0;
  if (grid) {
    lv_obj_update_layout(grid);
    pad_left = lv_obj_get_style_pad_left(grid, LV_PART_MAIN);
    pad_right = lv_obj_get_style_pad_right(grid, LV_PART_MAIN);
    gap_col = lv_obj_get_style_pad_column(grid, LV_PART_MAIN);
  }

  int span_cols = cols < 3 ? cols : 3;
  lv_coord_t usable_w = screen_w - pad_left - pad_right - gap_col * (cols - 1);
  lv_coord_t cell_w = usable_w > 0 ? usable_w / cols : screen_w / cols;
  lv_coord_t width = cell_w * span_cols + gap_col * (span_cols - 1);
  lv_coord_t max_w = screen_w - 36;
  if (width > max_w) width = max_w;
  if (width < 120) width = max_w;
  return width;
}

inline void alarm_show_failure(AlarmCardCtx *ctx, const std::string &message) {
  alarm_hide_toast();
  AlarmToastUi &ui = alarm_toast_ui();
  lv_coord_t width = alarm_failure_banner_width(ctx);
  ui.box = lv_obj_create(lv_layer_top());
  lv_obj_set_width(ui.box, width);
  lv_obj_set_style_bg_color(ui.box, lv_color_hex(ALARM_TRIGGERED_COLOR), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(ui.box, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(ui.box, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(ui.box, 0, LV_PART_MAIN);
  lv_obj_set_style_radius(ui.box, 10, LV_PART_MAIN);
  lv_obj_set_style_pad_all(ui.box, 12, LV_PART_MAIN);
  lv_obj_clear_flag(ui.box, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *label = lv_label_create(ui.box);
  lv_label_set_text(label, message.empty() ? "Alarm action failed" : message.c_str());
  if (ctx && ctx->label_font) lv_obj_set_style_text_font(label, ctx->label_font, LV_PART_MAIN);
  lv_obj_set_style_text_color(label, lv_color_hex(DARK_TEXT_PRIMARY), LV_PART_MAIN);
  lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(label, width - 24);
  lv_obj_center(label);

  lv_obj_update_layout(ui.box);
  lv_obj_align(ui.box, LV_ALIGN_BOTTOM_MID, 0, -18);
  ui.timer = lv_timer_create(alarm_toast_timer_cb, 3000, nullptr);
  lv_obj_move_foreground(ui.box);
}

inline uint32_t next_alarm_call_id() {
  static uint32_t call_id = 300000;
  return call_id++;
}

inline std::string alarm_action_failure_message(const esphome::api::ActionResponse &response) {
  std::string error = response.get_error_message().str();
  if (error.empty()) return "Alarm action failed";

  const std::string prefix = "Alarm action failed: ";
  const size_t max_len = 120;
  if (prefix.length() + error.length() > max_len) {
    size_t keep = max_len > prefix.length() + 3 ? max_len - prefix.length() - 3 : 0;
    error = error.substr(0, keep) + "...";
  }
  return prefix + error;
}

inline void send_alarm_action(AlarmActionCtx *action, const std::string &code) {
  if (!action || !action->card || action->card->entity_id.empty() ||
      esphome::api::global_api_server == nullptr) return;
  const char *service = alarm_action_service(action->mode);
  if (service == nullptr) return;

  esphome::api::HomeassistantActionRequest req;
  req.service = decltype(req.service)(service);
  req.is_event = false;
  req.call_id = next_alarm_call_id();
  req.data.init(code.empty() ? 1 : 2);
  auto &entity_kv = req.data.emplace_back();
  entity_kv.key = decltype(entity_kv.key)("entity_id");
  entity_kv.value = decltype(entity_kv.value)(action->card->entity_id.c_str());
  if (!code.empty()) {
    auto &code_kv = req.data.emplace_back();
    code_kv.key = decltype(code_kv.key)("code");
    code_kv.value = decltype(code_kv.value)(code.c_str());
  }

  std::string entity_id = action->card->entity_id;
  std::string service_name = service;
  AlarmCardCtx *card = action->card;
  esphome::api::global_api_server->register_action_response_callback(
    req.call_id,
    [entity_id, service_name, card](const esphome::api::ActionResponse &response) {
      if (response.is_success()) return;
      std::string message = alarm_action_failure_message(response);
      ESP_LOGW("alarm", "%s failed for %s: %s",
        service_name.c_str(), entity_id.c_str(), message.c_str());
      alarm_show_failure(card, message);
    });
  esphome::api::global_api_server->send_homeassistant_action(req);
}

inline uint32_t alarm_control_active_color(AlarmCardCtx *ctx, const std::string &mode) {
  return ctx ? ctx->on_color : DEFAULT_SLIDER_COLOR;
}

inline void alarm_control_update_modal(AlarmCardCtx *ctx) {
  AlarmControlModalUi &ui = alarm_control_modal_ui();
  if (!ctx || ui.active != ctx) return;

  std::string active_mode = alarm_state_control_mode(
    alarm_effective_state(ctx->state, ctx->arm_mode));
  static const char *modes[3] = {"home", "away", "disarm"};
  for (int i = 0; i < 3; i++) {
    lv_obj_t *btn = ui.mode_btn[i];
    if (!btn) continue;
    bool selected = active_mode == modes[i];
    uint32_t bg = selected ? alarm_control_active_color(ctx, modes[i]) : DARK_TRACK_BACKGROUND;
    lv_obj_set_style_bg_color(btn, lv_color_hex(bg), LV_PART_MAIN);
    lv_obj_set_style_bg_color(btn, lv_color_hex(bg),
      static_cast<lv_style_selector_t>(LV_PART_MAIN) | static_cast<lv_style_selector_t>(LV_STATE_PRESSED));
    lv_obj_set_style_border_width(btn, 0, LV_PART_MAIN);
    lv_obj_set_style_bg_opa(btn, LV_OPA_COVER, LV_PART_MAIN);
  }
}

inline void alarm_control_hide_modal() {
  AlarmControlModalUi &ui = alarm_control_modal_ui();
  if (ui.overlay) lv_obj_del(ui.overlay);
  ui = AlarmControlModalUi();
}

inline void alarm_pin_hide_modal() {
  AlarmPinModalUi &ui = alarm_pin_modal_ui();
  ui.pin.clear();
  if (ui.overlay) lv_obj_del(ui.overlay);
  ui = AlarmPinModalUi();
}

inline void alarm_action_activate(AlarmActionCtx *action);

inline void alarm_control_mode_cb(lv_event_t *e) {
  AlarmActionCtx *action = static_cast<AlarmActionCtx *>(lv_event_get_user_data(e));
  alarm_action_activate(action);
}

inline void alarm_pin_update_display() {
  AlarmPinModalUi &ui = alarm_pin_modal_ui();
  if (!ui.pin_lbl) return;
  if (ui.pin.empty()) {
    lv_label_set_text(ui.pin_lbl, "Enter Pin");
    return;
  }
  std::string masked(ui.pin.size(), '*');
  lv_label_set_text(ui.pin_lbl, masked.c_str());
}

inline void alarm_pin_submit() {
  AlarmPinModalUi &ui = alarm_pin_modal_ui();
  if (!ui.active || ui.pin.empty()) return;
  AlarmActionCtx *action = ui.active;
  std::string code = ui.pin;
  alarm_pin_hide_modal();
  send_alarm_action(action, code);
}

inline lv_obj_t *alarm_create_key_button(lv_obj_t *parent, lv_coord_t width,
                                         lv_coord_t height,
                                         const char *text,
                                         const lv_font_t *font,
                                         int width_compensation_percent) {
  lv_coord_t radius = width < height ? width / 2 : height / 2;
  lv_obj_t *btn = control_modal_create_round_button(
    parent, width, text, font, DARK_BORDER, DARK_BACKGROUND_TERTIARY,
    width_compensation_percent);
  lv_obj_set_size(btn, width, height);
  lv_obj_set_style_radius(btn, radius, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(btn, 0, LV_PART_MAIN);
  return btn;
}

inline lv_coord_t alarm_pin_keypad_gap(lv_coord_t keypad_w, lv_coord_t keypad_h,
                                       lv_coord_t short_side) {
  lv_coord_t gap = control_modal_scaled_px(14, short_side);
  lv_coord_t max_gap_w = keypad_w > 0 ? keypad_w / 16 : 0;
  lv_coord_t max_gap_h = keypad_h > 0 ? keypad_h / 20 : 0;
  if (max_gap_w > 0 && gap > max_gap_w) gap = max_gap_w;
  if (max_gap_h > 0 && gap > max_gap_h) gap = max_gap_h;
  if (gap < 4) gap = 4;
  return gap;
}

inline lv_coord_t alarm_pin_key_size(lv_coord_t keypad_w, lv_coord_t keypad_h,
                                     lv_coord_t gap, lv_coord_t short_side) {
  lv_coord_t key_size_w = (keypad_w - gap * 2) / 3;
  lv_coord_t key_size_h = (keypad_h - gap * 3) / 4;
  lv_coord_t key_size = key_size_w < key_size_h ? key_size_w : key_size_h;
  lv_coord_t max_key_size = control_modal_scaled_px(112, short_side);
  if (max_key_size < 64) max_key_size = 64;
  if (key_size > max_key_size) key_size = max_key_size;
  if (key_size < 24) key_size = 24;
  return key_size;
}

inline void alarm_pin_key_cb(lv_event_t *e) {
  const char *key = static_cast<const char *>(lv_event_get_user_data(e));
  if (!key) return;
  AlarmPinModalUi &ui = alarm_pin_modal_ui();
  if (strcmp(key, "back") == 0) {
    ui.pin.clear();
    alarm_pin_update_display();
    return;
  }
  if (strcmp(key, "submit") == 0) {
    alarm_pin_submit();
    return;
  }
  if (ui.pin.size() < 16 && key[0] >= '0' && key[0] <= '9' && key[1] == '\0') {
    ui.pin.push_back(key[0]);
    alarm_pin_update_display();
  }
}

inline void alarm_pin_open_modal(AlarmActionCtx *action) {
  if (!action || !action->card || !action->card->available) return;
  media_volume_hide_modal();
  climate_control_hide_modal();
  switch_confirmation_hide_modal();
  option_select_hide_modal();
  alarm_pin_hide_modal();

  AlarmPinModalUi &ui = alarm_pin_modal_ui();
  ui.active = action;
  ui.pin.clear();

  ControlModalLayout layout = control_modal_calc_layout(action->card->width_compensation_percent);
  lv_coord_t radius = control_modal_card_radius(action->card->btn);
  const lv_font_t *label_font = action->card->btn
    ? lv_obj_get_style_text_font(action->card->btn, LV_PART_MAIN)
    : nullptr;
  const lv_font_t *pin_label_font = action->card->pin_label_font
    ? action->card->pin_label_font
    : label_font;
  const lv_font_t *key_label_font = action->card->key_label_font
    ? action->card->key_label_font
    : label_font;
  const lv_font_t *icon_font = action->card->icon_font
    ? action->card->icon_font
    : action->card->icon_lbl
    ? lv_obj_get_style_text_font(action->card->icon_lbl, LV_PART_MAIN)
    : label_font;

  ui.overlay = lv_obj_create(lv_layer_top());
  control_modal_style_overlay(ui.overlay);
  ui.panel = lv_obj_create(ui.overlay);
  control_modal_style_panel(ui.panel, radius);
  control_modal_apply_panel_layout(ui.overlay, ui.panel, layout, radius);

  ui.back_btn = control_modal_create_round_button(
    ui.panel, layout.back_size, "\U000F0141", icon_font,
    DARK_BORDER, DARK_BACKGROUND_TERTIARY,
    action->card->width_compensation_percent);
  lv_obj_set_style_bg_opa(ui.back_btn, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_width(ui.back_btn, 0, LV_PART_MAIN);
  control_modal_apply_back_button_layout(ui.back_btn, layout);
  lv_obj_add_event_cb(ui.back_btn, [](lv_event_t *) {
    alarm_pin_hide_modal();
  }, LV_EVENT_CLICKED, nullptr);

  ui.pin_lbl = lv_label_create(ui.panel);
  lv_obj_set_style_text_color(ui.pin_lbl, lv_color_hex(DARK_TEXT_PRIMARY), LV_PART_MAIN);
  lv_obj_set_style_text_align(ui.pin_lbl, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  if (pin_label_font) lv_obj_set_style_text_font(ui.pin_lbl, pin_label_font, LV_PART_MAIN);
  apply_width_compensation(ui.pin_lbl, action->card->width_compensation_percent);
  lv_coord_t pin_w = layout.panel_w - (layout.inset + layout.back_size) * 2;
  if (pin_w < 60) pin_w = layout.panel_w - layout.inset * 2;
  lv_obj_set_width(ui.pin_lbl, pin_w);
  alarm_pin_update_display();
  lv_obj_update_layout(ui.pin_lbl);
  lv_coord_t pin_h = lv_obj_get_height(ui.pin_lbl);
  lv_coord_t pin_y = layout.inset + (layout.back_size - pin_h) / 2;
  if (pin_y < layout.inset) pin_y = layout.inset;
  lv_obj_align(ui.pin_lbl, LV_ALIGN_TOP_MID, 0, pin_y);

  lv_coord_t pin_button_gap = control_modal_scaled_px(24, layout.short_side);
  if (pin_button_gap < 10) pin_button_gap = 10;
  lv_coord_t keypad_top = layout.inset + layout.back_size + pin_button_gap;
  lv_coord_t keypad_bottom = layout.panel_h - layout.inset;
  lv_coord_t keypad_w = layout.panel_w - layout.inset * 2;
  lv_coord_t keypad_h = keypad_bottom - keypad_top;
  lv_coord_t gap = alarm_pin_keypad_gap(keypad_w, keypad_h, layout.short_side);
  lv_coord_t key_size = alarm_pin_key_size(keypad_w, keypad_h, gap, layout.short_side);
  lv_coord_t total_w = key_size * 3 + gap * 2;
  lv_coord_t total_h = key_size * 4 + gap * 3;
  lv_coord_t start_x = (layout.panel_w - total_w) / 2;
  lv_coord_t start_y = keypad_top + (keypad_h - total_h) / 2;
  if (start_y < keypad_top) start_y = keypad_top;

  static const char *key_data[12] = {
    "1", "2", "3",
    "4", "5", "6",
    "7", "8", "9",
    "back", "0", "submit",
  };

  for (int i = 0; i < 12; i++) {
    const char *text = key_data[i];
    const lv_font_t *key_font = key_label_font;
    if (strcmp(text, "back") == 0) {
      text = "\U000F0156";
      key_font = icon_font;
    } else if (strcmp(text, "submit") == 0) {
      text = find_icon("Check");
      key_font = icon_font;
    }

    lv_obj_t *key_btn = alarm_create_key_button(
      ui.panel, key_size, key_size, text, key_font, action->card->width_compensation_percent);
    if (strcmp(key_data[i], "submit") == 0) {
      lv_obj_set_style_bg_color(key_btn, lv_color_hex(DEFAULT_SLIDER_COLOR), LV_PART_MAIN);
      lv_obj_set_style_border_color(key_btn, lv_color_hex(DEFAULT_SLIDER_COLOR), LV_PART_MAIN);
      lv_obj_t *key_lbl = lv_obj_get_child(key_btn, 0);
      if (key_lbl) lv_obj_set_style_text_color(key_lbl, lv_color_hex(DARK_TEXT_PRIMARY), LV_PART_MAIN);
    }
    int row = i / 3;
    int col = i % 3;
    lv_coord_t x = start_x + col * (key_size + gap);
    lv_coord_t y = start_y + row * (key_size + gap);
    lv_obj_set_pos(key_btn, x, y);
    lv_obj_add_event_cb(key_btn, alarm_pin_key_cb, LV_EVENT_CLICKED,
      const_cast<char *>(key_data[i]));
  }

  lv_obj_move_foreground(ui.back_btn);
  lv_obj_move_foreground(ui.overlay);
}

inline void alarm_action_activate(AlarmActionCtx *action) {
  if (!action || !action->card || !action->card->available) return;
  if (action->requires_pin) {
    alarm_pin_open_modal(action);
    return;
  }
  send_alarm_action(action, "");
}

inline lv_obj_t *alarm_control_create_mode_button(
    lv_obj_t *parent,
    AlarmCardCtx *ctx,
    const char *mode,
    lv_coord_t width,
    lv_coord_t height,
    lv_coord_t radius,
    const lv_font_t *icon_font,
    const lv_font_t *label_font,
    lv_obj_t **icon_out,
    lv_obj_t **label_out) {
  lv_obj_t *btn = lv_btn_create(parent);
  lv_obj_set_size(btn, width, height);
  apply_width_compensation(btn, ctx ? ctx->width_compensation_percent : 100);
  lv_obj_set_style_radius(btn, radius, LV_PART_MAIN);
  lv_obj_set_style_bg_color(btn, lv_color_hex(DARK_TRACK_BACKGROUND), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(btn, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(btn, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(btn, 0, LV_PART_MAIN);
  lv_obj_clear_flag(btn, LV_OBJ_FLAG_SCROLLABLE);
  control_modal_apply_pressed_fill(btn);

  lv_obj_t *content = lv_obj_create(btn);
  lv_obj_set_size(content, lv_pct(100), lv_pct(100));
  lv_obj_set_style_bg_opa(content, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_width(content, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(content, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(content, 0, LV_PART_MAIN);
  lv_obj_clear_flag(content, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_clear_flag(content, LV_OBJ_FLAG_SCROLLABLE);

  lv_obj_t *icon = lv_label_create(content);
  lv_label_set_text(icon, alarm_action_icon(mode ? std::string(mode) : ""));
  lv_obj_set_style_text_color(icon, lv_color_hex(DARK_TEXT_PRIMARY), LV_PART_MAIN);
  lv_obj_set_style_text_align(icon, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  if (icon_font) lv_obj_set_style_text_font(icon, icon_font, LV_PART_MAIN);
  apply_width_compensation(icon, ctx ? ctx->width_compensation_percent : 100);
  lv_obj_clear_flag(icon, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_align(icon, LV_ALIGN_CENTER, 0, -height / 7);

  lv_obj_t *label = lv_label_create(content);
  lv_label_set_text(label, alarm_control_button_label(mode ? std::string(mode) : ""));
  lv_obj_set_style_text_color(label, lv_color_hex(DARK_TEXT_PRIMARY), LV_PART_MAIN);
  lv_obj_set_style_text_align(label, LV_TEXT_ALIGN_CENTER, LV_PART_MAIN);
  if (label_font) lv_obj_set_style_text_font(label, label_font, LV_PART_MAIN);
  apply_width_compensation(label, ctx ? ctx->width_compensation_percent : 100);
  lv_obj_clear_flag(label, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_align(label, LV_ALIGN_CENTER, 0, height / 5);

  if (icon_out) *icon_out = icon;
  if (label_out) *label_out = label;
  return btn;
}

inline void alarm_control_open_modal(AlarmCardCtx *ctx) {
  if (!ctx || !ctx->available) return;
  media_volume_hide_modal();
  climate_control_hide_modal();
  switch_confirmation_hide_modal();
  option_select_hide_modal();
  alarm_pin_hide_modal();
  alarm_control_hide_modal();

  AlarmControlModalUi &ui = alarm_control_modal_ui();
  ui.active = ctx;

  ControlModalLayout layout = control_modal_calc_layout(ctx->width_compensation_percent);
  lv_coord_t radius = control_modal_card_radius(ctx->btn);
  const lv_font_t *label_font = ctx->label_font
    ? ctx->label_font
    : ctx->btn ? lv_obj_get_style_text_font(ctx->btn, LV_PART_MAIN) : nullptr;
  const lv_font_t *icon_font = ctx->icon_font
    ? ctx->icon_font
    : ctx->icon_lbl ? lv_obj_get_style_text_font(ctx->icon_lbl, LV_PART_MAIN) : label_font;

  ui.overlay = lv_obj_create(lv_layer_top());
  control_modal_style_overlay(ui.overlay);
  ui.panel = lv_obj_create(ui.overlay);
  control_modal_style_panel(ui.panel, radius);
  control_modal_apply_panel_layout(ui.overlay, ui.panel, layout, radius);

  ui.back_btn = control_modal_create_round_button(
    ui.panel, layout.back_size, "\U000F0141", icon_font,
    DARK_BORDER, DARK_BACKGROUND_TERTIARY,
    ctx->width_compensation_percent);
  lv_obj_set_style_bg_opa(ui.back_btn, LV_OPA_TRANSP, LV_PART_MAIN);
  lv_obj_set_style_border_width(ui.back_btn, 0, LV_PART_MAIN);
  control_modal_apply_back_button_layout(ui.back_btn, layout);
  lv_obj_add_event_cb(ui.back_btn, [](lv_event_t *) {
    alarm_control_hide_modal();
  }, LV_EVENT_CLICKED, nullptr);

  lv_coord_t rail_w = layout.panel_w * 52 / 100;
  if (rail_w < control_modal_scaled_px(156, layout.short_side))
    rail_w = control_modal_scaled_px(156, layout.short_side);
  if (rail_w > layout.panel_w - layout.inset * 2) rail_w = layout.panel_w - layout.inset * 2;
  lv_coord_t rail_h = layout.panel_h - layout.inset * 2;
  if (rail_h < control_modal_scaled_px(300, layout.short_side))
    rail_h = control_modal_scaled_px(300, layout.short_side);
  if (rail_h > layout.panel_h - layout.inset * 2)
    rail_h = layout.panel_h - layout.inset * 2;
  if (rail_h < control_modal_scaled_px(240, layout.short_side))
    rail_h = control_modal_scaled_px(240, layout.short_side);
  lv_coord_t control_radius = rail_w / 14;

  ui.rail = lv_obj_create(ui.panel);
  lv_obj_set_size(ui.rail, rail_w, rail_h);
  apply_width_compensation(ui.rail, ctx->width_compensation_percent);
  lv_obj_set_style_radius(ui.rail, control_radius, LV_PART_MAIN);
  lv_obj_set_style_bg_color(ui.rail, lv_color_hex(DARK_BACKGROUND_TERTIARY), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(ui.rail, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_style_border_width(ui.rail, 0, LV_PART_MAIN);
  lv_obj_set_style_shadow_width(ui.rail, 0, LV_PART_MAIN);
  lv_obj_set_style_pad_all(ui.rail, 0, LV_PART_MAIN);
  lv_obj_clear_flag(ui.rail, LV_OBJ_FLAG_SCROLLABLE);
  lv_obj_align(ui.rail, LV_ALIGN_CENTER, 0, 0);

  static const char *modes[3] = {"home", "away", "disarm"};
  lv_coord_t btn_h = rail_h / 3;
  lv_coord_t btn_w = rail_w;
  for (int i = 0; i < 3; i++) {
    ui.mode_btn[i] = alarm_control_create_mode_button(
      ui.rail, ctx, modes[i], btn_w, btn_h, control_radius,
      icon_font, label_font, &ui.mode_icon[i], &ui.mode_label[i]);
    lv_obj_set_pos(ui.mode_btn[i], 0, i * btn_h);
    ui.actions[i].card = ctx;
    ui.actions[i].mode = modes[i];
    ui.actions[i].requires_pin = alarm_action_requires_pin(ctx->options, ui.actions[i].mode);
    lv_obj_add_event_cb(ui.mode_btn[i], alarm_control_mode_cb, LV_EVENT_CLICKED, &ui.actions[i]);
  }

  alarm_control_update_modal(ctx);
  lv_obj_move_foreground(ui.back_btn);
  lv_obj_move_foreground(ui.overlay);
}

inline void alarm_configure_page_grid(lv_obj_t *page, int num_slots, int cols) {
  if (!page) return;
  int slot_count = bounded_grid_slots(num_slots);
  int col_count = cols > 0 ? cols : 1;
  if (col_count > MAX_GRID_SLOTS) col_count = MAX_GRID_SLOTS;
  int row_count = (slot_count + col_count - 1) / col_count;
  if (row_count < 1) row_count = 1;

  lv_coord_t *col_dsc = new lv_coord_t[col_count + 1];
  lv_coord_t *row_dsc = new lv_coord_t[row_count + 1];
  for (int i = 0; i < col_count; i++) col_dsc[i] = LV_GRID_FR(1);
  col_dsc[col_count] = LV_GRID_TEMPLATE_LAST;
  for (int i = 0; i < row_count; i++) row_dsc[i] = LV_GRID_FR(1);
  row_dsc[row_count] = LV_GRID_TEMPLATE_LAST;
  lv_obj_set_grid_dsc_array(page, col_dsc, row_dsc);
}

inline AlarmCardCtx *create_alarm_card_context(
    BtnSlot &slot,
    const ParsedCfg &p,
    lv_obj_t *main_page_obj,
    int num_slots,
    int cols,
    uint32_t on_color,
    uint32_t off_color,
    uint32_t tertiary_color,
    const lv_font_t *icon_font,
    const lv_font_t *value_font,
    const lv_font_t *label_font,
    lv_color_t text_color,
    int width_compensation_percent,
    bool build_default_page = false) {
  AlarmCardCtx *ctx = new AlarmCardCtx();
  ctx->entity_id = p.entity;
  ctx->label = p.label.empty() ? "Alarm" : p.label;
  ctx->options = p.options;
  ctx->btn = slot.btn;
  ctx->icon_lbl = slot.icon_lbl;
  ctx->label_font = label_font;
  ctx->pin_label_font = label_font;
  ctx->key_label_font = value_font ? value_font : label_font;
  ctx->icon_font = icon_font;
  ctx->on_color = on_color;
  ctx->off_color = off_color;
  ctx->tertiary_color = tertiary_color;
  ctx->width_compensation_percent = width_compensation_percent;
  ctx->grid_cols = cols > 0 ? cols : 1;
  ctx->status_label = create_transient_status_label(slot.text_lbl, ctx->label);
  alarm_set_card_state_colors(ctx, ctx->on_color);
  if (!build_default_page) return ctx;

  int NS = bounded_grid_slots(num_slots);
  int COLS = cols > 0 ? cols : 1;
  ctx->page = lv_obj_create(NULL);
  ctx->grid_page = ctx->page;
  lv_obj_set_style_bg_color(ctx->page, lv_color_hex(DARK_OVERLAY), LV_PART_MAIN);
  lv_obj_set_style_bg_opa(ctx->page, LV_OPA_COVER, LV_PART_MAIN);
  lv_obj_set_layout(ctx->page, LV_LAYOUT_GRID);
  alarm_configure_page_grid(ctx->page, NS, COLS);
  lv_obj_clear_flag(ctx->page, LV_OBJ_FLAG_SCROLLABLE);

  if (main_page_obj) {
    lv_obj_set_style_pad_top(ctx->page, lv_obj_get_style_pad_top(main_page_obj, LV_PART_MAIN), LV_PART_MAIN);
    lv_obj_set_style_pad_bottom(ctx->page, lv_obj_get_style_pad_bottom(main_page_obj, LV_PART_MAIN), LV_PART_MAIN);
    lv_obj_set_style_pad_left(ctx->page, lv_obj_get_style_pad_left(main_page_obj, LV_PART_MAIN), LV_PART_MAIN);
    lv_obj_set_style_pad_right(ctx->page, lv_obj_get_style_pad_right(main_page_obj, LV_PART_MAIN), LV_PART_MAIN);
    lv_obj_set_style_pad_row(ctx->page, lv_obj_get_style_pad_row(main_page_obj, LV_PART_MAIN), LV_PART_MAIN);
    lv_obj_set_style_pad_column(ctx->page, lv_obj_get_style_pad_column(main_page_obj, LV_PART_MAIN), LV_PART_MAIN);
  }

  lv_coord_t radius = lv_obj_get_style_radius(slot.btn, LV_PART_MAIN);
  lv_coord_t pad = lv_obj_get_style_pad_top(slot.btn, LV_PART_MAIN);

  lv_obj_t *back_btn = create_grid_card_button(ctx->page, radius, pad, label_font, text_color);
  apply_button_colors(back_btn, false, DEFAULT_SLIDER_COLOR, true, off_color);
  lv_obj_set_grid_cell(back_btn, LV_GRID_ALIGN_STRETCH, 0, 1, LV_GRID_ALIGN_STRETCH, 0, 1);
  BtnSlot back_slot = create_dynamic_card_slot(back_btn, icon_font, value_font, label_font, text_color);
  apply_width_compensation(back_slot.icon_lbl, width_compensation_percent);
  apply_slot_text_width_compensation(back_slot, width_compensation_percent);
  lv_label_set_text(back_slot.icon_lbl, "\U000F0141");
  lv_label_set_text(back_slot.text_lbl, "Back");
  lv_obj_add_event_cb(back_btn, [](lv_event_t *e) {
    lv_obj_t *target = static_cast<lv_obj_t *>(lv_event_get_user_data(e));
    if (target) lv_scr_load_anim(target, LV_SCR_LOAD_ANIM_NONE, 0, 0, false);
  }, LV_EVENT_CLICKED, main_page_obj);

  const char *modes[4] = {"away", "home", "night", "disarm"};
  int page_pos = 1;
  for (int i = 0; i < 4 && page_pos < NS; i++) {
    std::string mode = modes[i];
    if (!alarm_action_visible(p.options, mode)) continue;

    lv_obj_t *action_btn = create_grid_card_button(ctx->page, radius, pad, label_font, text_color);
    apply_button_colors(action_btn, false, DEFAULT_SLIDER_COLOR, true, off_color);
    int col = page_pos % COLS;
    int row = page_pos / COLS;
    lv_obj_set_grid_cell(action_btn, LV_GRID_ALIGN_STRETCH, col, 1, LV_GRID_ALIGN_STRETCH, row, 1);
    BtnSlot action_slot = create_dynamic_card_slot(action_btn, icon_font, value_font, label_font, text_color);
    apply_width_compensation(action_slot.icon_lbl, width_compensation_percent);
    apply_slot_text_width_compensation(action_slot, width_compensation_percent);
    lv_label_set_text(action_slot.icon_lbl, alarm_action_icon(mode));
    lv_label_set_text(action_slot.text_lbl, alarm_action_label(mode));
    apply_push_button_transition(action_btn);

    AlarmActionCtx *action_ctx = new AlarmActionCtx();
    action_ctx->card = ctx;
    action_ctx->mode = mode;
    action_ctx->requires_pin = alarm_action_requires_pin(p.options, mode);
    lv_obj_add_event_cb(action_btn, [](lv_event_t *e) {
      AlarmActionCtx *action = static_cast<AlarmActionCtx *>(lv_event_get_user_data(e));
      alarm_action_activate(action);
    }, LV_EVENT_CLICKED, action_ctx);
    page_pos++;
  }
  return ctx;
}

inline void alarm_card_open_page(AlarmCardCtx *ctx) {
  alarm_control_open_modal(ctx);
}
