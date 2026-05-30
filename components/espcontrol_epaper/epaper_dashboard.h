#pragma once

#include "esphome/core/color.h"
#include "esphome/core/log.h"
#include "esphome/components/api/api_server.h"
#include "esphome/components/font/font.h"

#include <array>
#include <cctype>
#include <cstdio>
#include <functional>
#include <string>
#include <vector>

namespace espcontrol {

constexpr int EPAPER_DASHBOARD_PAGE_SLOTS = 20;
constexpr int EPAPER_DASHBOARD_PAGES = 4;
constexpr int EPAPER_DASHBOARD_TOTAL_SLOTS =
    EPAPER_DASHBOARD_PAGE_SLOTS * EPAPER_DASHBOARD_PAGES;

struct EpaperDashboardTile {
  std::string config;
  std::string entity;
  std::string sensor;
  std::string label;
  std::string type;
  std::string value;
  bool subscribed = false;
  bool unavailable = false;
};

inline std::array<EpaperDashboardTile, EPAPER_DASHBOARD_TOTAL_SLOTS> &epaper_dashboard_tiles() {
  static std::array<EpaperDashboardTile, EPAPER_DASHBOARD_TOTAL_SLOTS> tiles;
  return tiles;
}

inline bool &epaper_dashboard_dirty_flag() {
  static bool dirty = true;
  return dirty;
}

inline void epaper_dashboard_mark_dirty() {
  epaper_dashboard_dirty_flag() = true;
}

inline bool epaper_dashboard_is_dirty() {
  return epaper_dashboard_dirty_flag();
}

inline void epaper_dashboard_clear_dirty() {
  epaper_dashboard_dirty_flag() = false;
}

inline int epaper_dashboard_page_count() {
  return EPAPER_DASHBOARD_PAGES;
}

inline int epaper_dashboard_wrap_page(int page) {
  if (page < 0) return EPAPER_DASHBOARD_PAGES - 1;
  if (page >= EPAPER_DASHBOARD_PAGES) return 0;
  return page;
}

inline std::vector<std::string> epaper_dashboard_split(const std::string &value, char delim) {
  std::vector<std::string> out;
  size_t start = 0;
  while (start <= value.length()) {
    size_t end = value.find(delim, start);
    if (end == std::string::npos) end = value.length();
    out.push_back(value.substr(start, end - start));
    start = end + 1;
  }
  return out;
}

inline int epaper_dashboard_hex_digit(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return -1;
}

inline std::string epaper_dashboard_decode_field(const std::string &value) {
  std::string out;
  out.reserve(value.size());
  for (size_t i = 0; i < value.size(); i++) {
    if (value[i] == '%' && i + 2 < value.size()) {
      int hi = epaper_dashboard_hex_digit(value[i + 1]);
      int lo = epaper_dashboard_hex_digit(value[i + 2]);
      if (hi >= 0 && lo >= 0) {
        out.push_back(static_cast<char>((hi << 4) | lo));
        i += 2;
        continue;
      }
    }
    out.push_back(value[i]);
  }
  return out;
}

inline std::vector<std::string> epaper_dashboard_config_fields(const std::string &config) {
  if (!config.empty() && config[0] == '~') {
    std::vector<std::string> decoded;
    for (const auto &field : epaper_dashboard_split(config.substr(1), ',')) {
      decoded.push_back(epaper_dashboard_decode_field(field));
    }
    return decoded;
  }
  return epaper_dashboard_split(config, ';');
}

inline std::string epaper_dashboard_title_from_entity(const std::string &entity) {
  size_t dot = entity.find('.');
  std::string text = dot == std::string::npos ? entity : entity.substr(dot + 1);
  for (char &ch : text) {
    if (ch == '_') ch = ' ';
  }
  bool cap = true;
  for (char &ch : text) {
    if (std::isspace(static_cast<unsigned char>(ch))) {
      cap = true;
      continue;
    }
    if (cap) ch = static_cast<char>(std::toupper(static_cast<unsigned char>(ch)));
    cap = false;
  }
  return text;
}

inline bool epaper_dashboard_state_active(const std::string &value) {
  std::string s;
  s.reserve(value.size());
  for (char ch : value) s.push_back(static_cast<char>(std::tolower(static_cast<unsigned char>(ch))));
  return s == "on" || s == "open" || s == "unlocked" || s == "detected" ||
         s == "home" || s == "playing" || s == "heating" || s == "cooling";
}

inline bool epaper_dashboard_state_unavailable(const std::string &value) {
  return value == "unavailable" || value == "unknown";
}

inline bool epaper_dashboard_api_available() {
  return esphome::api::global_api_server != nullptr;
}

inline void epaper_dashboard_subscribe(int index) {
  auto &tiles = epaper_dashboard_tiles();
  if (index < 0 || index >= EPAPER_DASHBOARD_TOTAL_SLOTS) return;
  auto &tile = tiles[index];
  if (tile.subscribed) return;
  std::string source = !tile.sensor.empty() ? tile.sensor : tile.entity;
  if (!epaper_dashboard_api_available() || source.empty()) return;
  tile.subscribed = true;
  esphome::api::global_api_server->subscribe_home_assistant_state(
      source, {}, [index](esphome::StringRef state) {
        auto &tile = epaper_dashboard_tiles()[index];
        tile.value = std::string(state.c_str(), state.size());
        tile.unavailable = epaper_dashboard_state_unavailable(tile.value);
        epaper_dashboard_mark_dirty();
      });
}

inline void epaper_dashboard_set_config(int index, const std::string &config) {
  if (index < 0 || index >= EPAPER_DASHBOARD_TOTAL_SLOTS) return;
  auto &tile = epaper_dashboard_tiles()[index];
  if (tile.config == config) {
    epaper_dashboard_subscribe(index);
    return;
  }
  tile = EpaperDashboardTile{};
  tile.config = config;
  auto fields = epaper_dashboard_config_fields(config);
  if (fields.size() > 0) tile.entity = fields[0];
  if (fields.size() > 1) tile.label = fields[1];
  if (fields.size() > 4) tile.sensor = fields[4];
  if (fields.size() > 6) tile.type = fields[6];
  if (tile.label.empty()) tile.label = epaper_dashboard_title_from_entity(!tile.sensor.empty() ? tile.sensor : tile.entity);
  epaper_dashboard_subscribe(index);
  epaper_dashboard_mark_dirty();
}

inline std::string epaper_dashboard_display_value(const EpaperDashboardTile &tile) {
  if (tile.config.empty()) return "";
  if (tile.unavailable) return "--";
  if (!tile.value.empty()) return tile.value;
  if (!tile.entity.empty() || !tile.sensor.empty()) return "...";
  return "";
}

template <typename DisplayT>
void epaper_dashboard_render_wifi_setup(DisplayT &it,
                                        esphome::font::Font *header_font,
                                        esphome::font::Font *label_font,
                                        esphome::font::Font *value_font,
                                        const char *ssid) {
  const int width = 800;
  const int height = 480;
  auto black = esphome::Color::BLACK;
  auto white = esphome::Color::WHITE;
  const char *hotspot = ssid && ssid[0] != '\0' ? ssid : "ESP setup hotspot";

  it.fill(white);
  it.rectangle(18, 18, width - 36, height - 36, black);
  it.line(70, 132, width - 70, 132, black);
  it.print(70, 76, value_font, black, "WiFi Setup");
  it.print(70, 160, header_font, black, "Connect to the setup hotspot");
  it.print(70, 205, label_font, black, hotspot);
  it.print(70, 265, header_font, black, "Then open this address");
  it.print(70, 310, value_font, black, "192.168.4.1");
  it.print(70, 385, label_font, black, "After WiFi setup, add the device in Home Assistant.");
}

template <typename DisplayT>
void epaper_dashboard_render(DisplayT &it,
                             esphome::font::Font *header_font,
                             esphome::font::Font *label_font,
                             esphome::font::Font *value_font,
                             int page) {
  page = epaper_dashboard_wrap_page(page);
  const int width = 800;
  const int height = 480;
  const int cols = 5;
  const int rows = 4;
  const int margin = 10;
  const int header_h = 42;
  const int gap = 6;
  const int tile_w = (width - margin * 2 - gap * (cols - 1)) / cols;
  const int tile_h = (height - header_h - margin * 2 - gap * (rows - 1)) / rows;
  auto black = esphome::Color::BLACK;
  auto white = esphome::Color::WHITE;

  it.fill(white);
  it.line(margin, header_h - 6, width - margin, header_h - 6, black);
  it.print(margin, 8, header_font, black, "ESPControl");
  char page_label[20];
  std::snprintf(page_label, sizeof(page_label), "Page %d/%d", page + 1, EPAPER_DASHBOARD_PAGES);
  it.print(width - 120, 8, header_font, black, page_label);

  auto &tiles = epaper_dashboard_tiles();
  int start = page * EPAPER_DASHBOARD_PAGE_SLOTS;
  for (int i = 0; i < EPAPER_DASHBOARD_PAGE_SLOTS; i++) {
    int col = i % cols;
    int row = i / cols;
    int x = margin + col * (tile_w + gap);
    int y = header_h + margin + row * (tile_h + gap);
    const auto &tile = tiles[start + i];
    bool configured = !tile.config.empty();
    bool active = epaper_dashboard_state_active(tile.value);

    if (configured && active) {
      it.filled_rectangle(x, y, tile_w, tile_h, black);
      it.rectangle(x, y, tile_w, tile_h, black);
      it.print(x + 8, y + 8, label_font, white, tile.label.c_str());
      it.print(x + 8, y + tile_h - 34, value_font, white, epaper_dashboard_display_value(tile).c_str());
    } else {
      it.rectangle(x, y, tile_w, tile_h, black);
      if (configured) {
        it.print(x + 8, y + 8, label_font, black, tile.label.c_str());
        it.print(x + 8, y + tile_h - 34, value_font, black, epaper_dashboard_display_value(tile).c_str());
      }
    }
  }
}

}  // namespace espcontrol
