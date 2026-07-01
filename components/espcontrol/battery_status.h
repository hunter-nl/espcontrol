// =============================================================================
// BATTERY STATUS - Clock-bar battery icon (experimental)
// =============================================================================
#pragma once

#include <cmath>

constexpr const char *BATTERY_ICON_UNKNOWN = "\U000F0091";  // Battery Unknown
constexpr const char *BATTERY_ICON_ALERT = "\U000F0083";    // Battery Alert
constexpr const char *BATTERY_ICON_10 = "\U000F007A";
constexpr const char *BATTERY_ICON_20 = "\U000F007B";
constexpr const char *BATTERY_ICON_30 = "\U000F007C";
constexpr const char *BATTERY_ICON_40 = "\U000F007D";
constexpr const char *BATTERY_ICON_50 = "\U000F007E";
constexpr const char *BATTERY_ICON_60 = "\U000F007F";
constexpr const char *BATTERY_ICON_70 = "\U000F0080";
constexpr const char *BATTERY_ICON_80 = "\U000F0081";
constexpr const char *BATTERY_ICON_90 = "\U000F0082";
constexpr const char *BATTERY_ICON_FULL = "\U000F0079";

inline const char *battery_status_icon(float pct) {
  if (!std::isfinite(pct)) return BATTERY_ICON_UNKNOWN;
  if (pct <= 5.0f) return BATTERY_ICON_ALERT;
  if (pct < 15.0f) return BATTERY_ICON_10;
  if (pct < 25.0f) return BATTERY_ICON_20;
  if (pct < 35.0f) return BATTERY_ICON_30;
  if (pct < 45.0f) return BATTERY_ICON_40;
  if (pct < 55.0f) return BATTERY_ICON_50;
  if (pct < 65.0f) return BATTERY_ICON_60;
  if (pct < 75.0f) return BATTERY_ICON_70;
  if (pct < 85.0f) return BATTERY_ICON_80;
  if (pct < 95.0f) return BATTERY_ICON_90;
  return BATTERY_ICON_FULL;
}

inline void battery_status_set_icon(lv_obj_t *label, float pct) {
  if (!label) return;
  lv_label_set_text(label, battery_status_icon(pct));
}
