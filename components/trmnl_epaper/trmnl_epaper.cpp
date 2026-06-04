#include "trmnl_epaper.h"

namespace esphome {
namespace trmnl_epaper {

void HOT TrmnlEPaper::draw_absolute_pixel_internal(int x, int y, Color color) {
  if (x >= this->get_width_internal() || y >= this->get_height_internal() || x < 0 || y < 0)
    return;

  const uint32_t pos = (x + y * this->get_width_controller()) / 8u;
  const uint8_t subpos = x & 0x07;
  const uint8_t mask = 0x80 >> subpos;
  const bool black = this->ordered_dither_enabled_
                       ? this->ordered_dither_pixel_(x, y, color)
                       : color.is_on();

  if (black) {
    this->buffer_[pos] &= ~mask;
  } else {
    this->buffer_[pos] |= mask;
  }
}

bool HOT TrmnlEPaper::ordered_dither_pixel_(int x, int y, Color color) {
  static constexpr uint8_t BAYER_4X4[4][4] = {
      {0, 8, 2, 10},
      {12, 4, 14, 6},
      {3, 11, 1, 9},
      {15, 7, 13, 5},
  };

  const uint16_t luminance = (static_cast<uint16_t>(color.red) * 77u) +
                             (static_cast<uint16_t>(color.green) * 150u) +
                             (static_cast<uint16_t>(color.blue) * 29u);
  const uint8_t brightness = luminance >> 8;
  const uint8_t threshold = static_cast<uint8_t>(BAYER_4X4[y & 0x03][x & 0x03] * 16u + 8u);

  return brightness < threshold;
}

}  // namespace trmnl_epaper
}  // namespace esphome
