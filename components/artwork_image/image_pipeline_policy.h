#pragma once

#include <cstdint>

namespace esphome {
namespace artwork_image {

// Higher-priority requests win. Equal-priority requests keep their original
// submission order so a busy camera page cannot starve its first tile.
constexpr bool p4_pipeline_candidate_precedes(uint8_t candidate_priority,
                                              uint64_t candidate_sequence,
                                              uint8_t best_priority,
                                              uint64_t best_sequence) {
  return candidate_priority > best_priority ||
         (candidate_priority == best_priority && candidate_sequence < best_sequence);
}

// A completion is safe to publish only while it still belongs to the current
// request generation. Closing a modal or changing cards advances the generation.
constexpr bool p4_pipeline_result_is_current(uint32_t expected_generation,
                                             uint32_t result_generation,
                                             bool cancelled) {
  return !cancelled && expected_generation == result_generation;
}

// Modal work may cancel an active or queued tile to become responsive. The
// interrupted tile still needs another turn or its card can remain blank after
// the modal closes.
constexpr bool image_pipeline_should_requeue_interrupted_tile(bool was_active_or_queued,
                                                              bool context_active,
                                                              bool has_source_url) {
  return was_active_or_queued && context_active && has_source_url;
}

// A modal-quality image is reusable only while every part of its cache key
// still matches. Camera and image entities can keep the same entity ID while
// publishing a new source URL.
constexpr bool image_pipeline_modal_cache_matches(bool ready, bool same_image,
                                                   bool same_entity, bool same_source) {
  return ready && same_image && same_entity && same_source;
}

// Camera cards share one modal-quality image buffer. A delayed cleanup from a
// previously closed card must not cancel that buffer after another card starts
// using it.
constexpr bool image_pipeline_should_cancel_modal_cleanup(bool has_separate_modal_image,
                                                           bool shared_modal_in_use) {
  return has_separate_modal_image && !shared_modal_in_use;
}

struct P4CoverScalePlan {
  bool valid{false};
  uint32_t crop_width{0};
  uint32_t crop_height{0};
  uint32_t crop_x{0};
  uint32_t crop_y{0};
  uint32_t scale_units{0};
};

// PPA represents the fractional part of its scale in fixed-size steps and
// truncates arbitrary floating-point ratios. Choose a centred crop that maps
// to the exact target dimensions after that quantisation, so no unwritten
// pixels remain along the right or bottom edge of a cover image.
constexpr P4CoverScalePlan p4_cover_scale_plan(uint32_t source_width,
                                               uint32_t source_height,
                                               uint32_t target_width,
                                               uint32_t target_height,
                                               uint32_t fractional_steps,
                                               uint32_t max_scale_units) {
  P4CoverScalePlan plan{};
  if (source_width == 0 || source_height == 0 || target_width == 0 ||
      target_height == 0 || fractional_steps == 0 || max_scale_units == 0) {
    return plan;
  }

  uint32_t cover_width = source_width;
  uint32_t cover_height = source_height;
  if (static_cast<uint64_t>(source_width) * target_height >
      static_cast<uint64_t>(source_height) * target_width) {
    cover_width = static_cast<uint32_t>(
        static_cast<uint64_t>(source_height) * target_width / target_height);
    if (cover_width == 0) cover_width = 1;
  } else {
    cover_height = static_cast<uint32_t>(
        static_cast<uint64_t>(source_width) * target_height / target_width);
    if (cover_height == 0) cover_height = 1;
  }

  auto ceil_div = [](uint64_t numerator, uint64_t denominator) constexpr -> uint32_t {
    return static_cast<uint32_t>((numerator + denominator - 1) / denominator);
  };
  uint32_t min_scale_x = ceil_div(
      static_cast<uint64_t>(target_width) * fractional_steps, cover_width);
  uint32_t min_scale_y = ceil_div(
      static_cast<uint64_t>(target_height) * fractional_steps, cover_height);
  uint32_t first_scale = min_scale_x > min_scale_y ? min_scale_x : min_scale_y;
  if (first_scale == 0) first_scale = 1;

  for (uint32_t scale_units = first_scale; scale_units <= max_scale_units;
       scale_units++) {
    uint32_t crop_width = ceil_div(
        static_cast<uint64_t>(target_width) * fractional_steps, scale_units);
    uint32_t crop_height = ceil_div(
        static_cast<uint64_t>(target_height) * fractional_steps, scale_units);
    if (crop_width > cover_width || crop_height > cover_height) continue;
    if (static_cast<uint64_t>(crop_width) * scale_units / fractional_steps !=
            target_width ||
        static_cast<uint64_t>(crop_height) * scale_units / fractional_steps !=
            target_height) {
      continue;
    }
    plan.valid = true;
    plan.crop_width = crop_width;
    plan.crop_height = crop_height;
    plan.crop_x = (source_width - crop_width) / 2;
    plan.crop_y = (source_height - crop_height) / 2;
    plan.scale_units = scale_units;
    return plan;
  }
  return plan;
}

// The P4 decoder emits packed RGB565 pixels. Other configured target formats
// must stay on the software path, which performs the required conversion.
constexpr bool p4_jpeg_hardware_target_supported(bool target_is_rgb565) {
  return target_is_rgb565;
}

}  // namespace artwork_image
}  // namespace esphome
