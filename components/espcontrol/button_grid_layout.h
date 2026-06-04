#pragma once

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

// Parse a 6-char hex color string (no # prefix) into a uint32_t RGB value
inline uint32_t parse_hex_color(const std::string &hex, bool &valid) {
  valid = hex.length() == 6;
  if (!valid) return 0;
  return strtoul(hex.c_str(), nullptr, 16);
}

inline int normalize_width_compensation_percent(int percent) {
  if (percent <= 0) return 100;
  if (percent < 50) return 50;
  if (percent > 150) return 150;
  return percent;
}

inline int width_compensation_scale(int percent) {
  percent = normalize_width_compensation_percent(percent);
  return 256 * percent / 100;
}

inline bool &width_compensation_vertical_axis() {
  static bool vertical = false;
  return vertical;
}

inline void set_width_compensation_vertical_axis(bool vertical) {
  width_compensation_vertical_axis() = vertical;
}

inline lv_coord_t compensated_width(lv_coord_t width, int percent) {
  if (width_compensation_vertical_axis()) return width;
  percent = normalize_width_compensation_percent(percent);
  return width * percent / 100;
}

inline void apply_width_compensation(lv_obj_t *obj, int percent) {
  if (!obj) return;
  int scale = width_compensation_scale(percent);
  lv_obj_set_style_transform_scale_x(obj, width_compensation_vertical_axis() ? 256 : scale, LV_PART_MAIN);
  lv_obj_set_style_transform_scale_y(obj, width_compensation_vertical_axis() ? scale : 256, LV_PART_MAIN);
}

inline void apply_slot_text_width_compensation(const BtnSlot &s, int percent) {
  apply_width_compensation(s.text_lbl, percent);
  apply_width_compensation(s.sensor_container, percent);
  apply_width_compensation(s.subpage_lbl, percent);
}

// ── Grid layout parsing ───────────────────────────────────────────────

// Result of parsing a button_order CSV string into grid cell positions
struct OrderResult {
  int positions[MAX_GRID_SLOTS] = {};    // slot number at each grid position (1-based, 0=empty)
  int row_span[MAX_GRID_SLOTS] = {};     // number of grid rows used by each slot
  int col_span[MAX_GRID_SLOTS] = {};     // number of grid columns used by each slot
};

inline void grid_token_spans(char suffix, int &row_span, int &col_span) {
  row_span = 1;
  col_span = 1;
  if (suffix == 'd') row_span = 2;
  else if (suffix == 'w') col_span = 2;
  else if (suffix == 'b') { row_span = 2; col_span = 2; }
  else if (suffix == 't') row_span = 3;
  else if (suffix == 'x') col_span = 3;
}

inline bool grid_token_has_span_suffix(char suffix) {
  return suffix == 'd' || suffix == 'w' || suffix == 'b' ||
    suffix == 't' || suffix == 'x';
}

// Parse "1,2d,3w,4b,5t,6x,..." into positions + row/column spans
inline void parse_order_string(const std::string &order_str, int num_slots, OrderResult &result) {
  memset(result.positions, 0, sizeof(result.positions));
  for (int i = 0; i < MAX_GRID_SLOTS; i++) {
    result.row_span[i] = 1;
    result.col_span[i] = 1;
  }
  int slot_limit = bounded_grid_slots(num_slots);
  if (order_str.empty()) return;
  size_t gpos = 0, start = 0;
  while (start <= order_str.length() && gpos < (size_t)slot_limit) {
    size_t comma = order_str.find(',', start);
    if (comma == std::string::npos) comma = order_str.length();
    if (comma > start) {
      std::string token = order_str.substr(start, comma - start);
      int row_span = 1, col_span = 1;
      if (!token.empty() && grid_token_has_span_suffix(token.back())) {
        grid_token_spans(token.back(), row_span, col_span);
        token.pop_back();
      }
      int v = atoi(token.c_str());
      if (v >= 1 && v <= slot_limit) {
        result.positions[gpos] = v;
        result.row_span[v - 1] = row_span;
        result.col_span[v - 1] = col_span;
      }
    }
    gpos++;
    start = comma + 1;
  }
}

// Zero out grid cells that are covered by a neighbouring multi-cell button
inline void clear_spanned_cells(const OrderResult &order, int num_slots, int cols, OrderResult &result) {
  int slot_limit = bounded_grid_slots(num_slots);
  for (int p = 0; p < slot_limit; p++) {
    result.positions[p] = order.positions[p];
    result.row_span[p] = order.row_span[p] > 0 ? order.row_span[p] : 1;
    result.col_span[p] = order.col_span[p] > 0 ? order.col_span[p] : 1;
  }
  for (int p = 0; p < slot_limit; p++) {
    if (result.positions[p] <= 0) continue;
    int idx = result.positions[p] - 1;
    int row_span = result.row_span[idx] > 0 ? result.row_span[idx] : 1;
    int col_span = result.col_span[idx] > 0 ? result.col_span[idx] : 1;
    int col = p % cols;
    for (int r = 0; r < row_span; r++) {
      for (int c = 0; c < col_span; c++) {
        if (r == 0 && c == 0) continue;
        if (col + c >= cols) continue;
        int covered = p + r * cols + c;
        if (covered < slot_limit) result.positions[covered] = 0;
      }
    }
  }
}

// ── Button visuals ────────────────────────────────────────────────────

// Apply on/off background colors to a button's checked/pressed/default states
inline void apply_button_colors(lv_obj_t *btn, bool has_on, uint32_t on_val,
                                bool has_off, uint32_t off_val) {
  if (has_on) {
    lv_obj_set_style_bg_color(btn, lv_color_hex(on_val),
      static_cast<lv_style_selector_t>(LV_PART_MAIN) | static_cast<lv_style_selector_t>(LV_STATE_CHECKED));
    lv_obj_set_style_bg_color(btn, lv_color_hex(on_val),
      static_cast<lv_style_selector_t>(LV_PART_MAIN) | static_cast<lv_style_selector_t>(LV_STATE_PRESSED));
  }
  if (has_off) {
    lv_obj_set_style_bg_color(btn, lv_color_hex(off_val),
      static_cast<lv_style_selector_t>(LV_PART_MAIN) | static_cast<lv_style_selector_t>(LV_STATE_DEFAULT));
  }
}

inline uint32_t card_pattern_highlight_color(uint32_t color) {
  uint8_t r = (color >> 16) & 0xFF;
  uint8_t g = (color >> 8) & 0xFF;
  uint8_t b = color & 0xFF;
  r = static_cast<uint8_t>(r + ((255 - r) * 35 / 100));
  g = static_cast<uint8_t>(g + ((255 - g) * 35 / 100));
  b = static_cast<uint8_t>(b + ((255 - b) * 35 / 100));
  return (static_cast<uint32_t>(r) << 16) |
         (static_cast<uint32_t>(g) << 8) |
         static_cast<uint32_t>(b);
}

inline void apply_button_on_pattern(lv_obj_t *btn, const std::string &options,
                                    bool has_on, uint32_t on_val) {
  if (!btn || !has_on) return;
  if (normalize_card_on_pattern(cfg_option_value(options, "on_pattern")) != "stripes") return;
  lv_style_selector_t checked =
    static_cast<lv_style_selector_t>(LV_PART_MAIN) |
    static_cast<lv_style_selector_t>(LV_STATE_CHECKED);
  lv_style_selector_t pressed =
    static_cast<lv_style_selector_t>(LV_PART_MAIN) |
    static_cast<lv_style_selector_t>(LV_STATE_PRESSED);
  lv_color_t highlight = lv_color_hex(card_pattern_highlight_color(on_val));
  lv_obj_set_style_bg_grad_color(btn, highlight, checked);
  lv_obj_set_style_bg_grad_dir(btn, LV_GRAD_DIR_HOR, checked);
  lv_obj_set_style_bg_grad_color(btn, highlight, pressed);
  lv_obj_set_style_bg_grad_dir(btn, LV_GRAD_DIR_HOR, pressed);
}

inline void apply_card_descendant_text_color(lv_obj_t *obj, lv_color_t color) {
  if (!obj) return;
  int32_t count = static_cast<int32_t>(lv_obj_get_child_cnt(obj));
  for (int32_t i = 0; i < count; i++) {
    lv_obj_t *child = lv_obj_get_child(obj, i);
    if (!child) continue;
    lv_obj_set_style_text_color(child, color, LV_PART_MAIN);
    apply_card_descendant_text_color(child, color);
  }
}

inline void sync_card_checked_text_color(lv_obj_t *btn) {
  if (!btn) return;
  apply_card_descendant_text_color(
    btn, lv_obj_get_style_text_color(btn, LV_PART_MAIN));
}

inline void set_card_checked_state(lv_obj_t *btn, bool checked) {
  if (!btn) return;
  if (checked) lv_obj_add_state(btn, LV_STATE_CHECKED);
  else lv_obj_clear_state(btn, LV_STATE_CHECKED);
  sync_card_checked_text_color(btn);
}

// Match the main-page button widget label behavior so longer titles wrap
// instead of running off the edge of the tile.
inline void configure_button_label_wrap(lv_obj_t *label) {
  if (!label) return;
  lv_label_set_long_mode(label, LV_LABEL_LONG_WRAP);
  lv_obj_set_width(label, lv_pct(100));
}

inline void set_wrapped_button_label_text(lv_obj_t *label, const std::string &text) {
  if (!label) return;
  configure_button_label_wrap(label);
  lv_label_set_text(label, text.c_str());
  lv_obj_align(label, LV_ALIGN_BOTTOM_LEFT, 0, 0);
}

inline void set_subpage_chevron_visible(BtnSlot &s, bool visible,
                                        int x_offset = 0,
                                        int y_offset = 2,
                                        int text_width_percent = 94) {
  if (!s.subpage_lbl) return;
  (void) visible;
  (void) x_offset;
  (void) y_offset;
  (void) text_width_percent;
  lv_obj_add_flag(s.subpage_lbl, LV_OBJ_FLAG_HIDDEN);
  if (s.text_lbl) configure_button_label_wrap(s.text_lbl);
}
