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

inline void set_subpage_chevron_visible(BtnSlot &s, bool visible) {
  if (!s.subpage_lbl) return;
  if (visible) {
    lv_obj_clear_flag(s.subpage_lbl, LV_OBJ_FLAG_HIDDEN);
    lv_obj_set_style_text_opa(s.subpage_lbl, LV_OPA_50, LV_PART_MAIN);
    lv_obj_align(s.subpage_lbl, LV_ALIGN_BOTTOM_RIGHT, 0, 0);
    lv_obj_move_foreground(s.subpage_lbl);
    if (s.text_lbl) {
      configure_button_label_wrap(s.text_lbl);
      lv_obj_set_width(s.text_lbl, lv_pct(88));
      lv_obj_align(s.text_lbl, LV_ALIGN_BOTTOM_LEFT, 0, 0);
    }
  } else {
    lv_obj_add_flag(s.subpage_lbl, LV_OBJ_FLAG_HIDDEN);
    if (s.text_lbl) configure_button_label_wrap(s.text_lbl);
  }
}
