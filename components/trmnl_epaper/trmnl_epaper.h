#pragma once

#include "esphome/components/waveshare_epaper/waveshare_epaper.h"

namespace esphome {
namespace trmnl_epaper {

class TrmnlEPaper : public waveshare_epaper::WaveshareEPaper7P5InV2 {
 public:
  void set_ordered_dither_enabled(bool enabled) { this->ordered_dither_enabled_ = enabled; }

 protected:
  void draw_absolute_pixel_internal(int x, int y, Color color) override;

  bool ordered_dither_pixel_(int x, int y, Color color);

  bool ordered_dither_enabled_{false};
};

}  // namespace trmnl_epaper
}  // namespace esphome
