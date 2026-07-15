#include <cassert>

#include "image_pipeline_policy.h"

using esphome::artwork_image::p4_pipeline_candidate_precedes;
using esphome::artwork_image::p4_pipeline_result_is_current;
using esphome::artwork_image::image_pipeline_should_requeue_interrupted_tile;
using esphome::artwork_image::image_pipeline_modal_cache_matches;
using esphome::artwork_image::image_pipeline_should_cancel_modal_cleanup;
using esphome::artwork_image::p4_cover_scale_plan;
using esphome::artwork_image::p4_jpeg_hardware_target_supported;

int main() {
  // Modal work preempts queued tile work.
  assert(p4_pipeline_candidate_precedes(2, 20, 1, 10));
  assert(!p4_pipeline_candidate_precedes(1, 10, 2, 20));

  // Tiles at the same priority remain first-in, first-out.
  assert(p4_pipeline_candidate_precedes(1, 10, 1, 20));
  assert(!p4_pipeline_candidate_precedes(1, 20, 1, 10));

  // Cancelled and superseded downloads can never replace the visible image.
  assert(p4_pipeline_result_is_current(4, 4, false));
  assert(!p4_pipeline_result_is_current(4, 3, false));
  assert(!p4_pipeline_result_is_current(4, 4, true));

  // Preemption must requeue both active tiles and the selected card when it was
  // waiting in the tile queue. Inactive, source-less, or idle work is discarded.
  assert(image_pipeline_should_requeue_interrupted_tile(true, true, true));
  assert(!image_pipeline_should_requeue_interrupted_tile(false, true, true));
  assert(!image_pipeline_should_requeue_interrupted_tile(true, false, true));
  assert(!image_pipeline_should_requeue_interrupted_tile(true, true, false));

  // A changed source URL invalidates an otherwise matching modal cache entry.
  assert(image_pipeline_modal_cache_matches(true, true, true, true));
  assert(!image_pipeline_modal_cache_matches(true, true, true, false));
  assert(!image_pipeline_modal_cache_matches(false, true, true, true));

  // A stale card cleanup must leave the shared modal request alone while a
  // newly opened card is using it. An otherwise idle separate buffer is safe
  // to cancel.
  assert(image_pipeline_should_cancel_modal_cleanup(true, false));
  assert(!image_pipeline_should_cancel_modal_cleanup(true, true));
  assert(!image_pipeline_should_cancel_modal_cleanup(false, false));

  // PPA stores scale in sixteenth-step units. The old arbitrary ratio was
  // truncated (for example 0.672 to 0.625), leaving noisy right/bottom strips.
  // The adjusted centred crop must produce every target pixel exactly.
  const auto landscape_plan = p4_cover_scale_plan(1024, 768, 688, 504, 16, 4095);
  assert(landscape_plan.valid);
  assert(landscape_plan.crop_width * landscape_plan.scale_units / 16 == 688);
  assert(landscape_plan.crop_height * landscape_plan.scale_units / 16 == 504);
  assert(landscape_plan.crop_x == (1024 - landscape_plan.crop_width) / 2);
  assert(landscape_plan.crop_y == (768 - landscape_plan.crop_height) / 2);

  const auto portrait_plan = p4_cover_scale_plan(720, 1280, 688, 504, 16, 4095);
  assert(portrait_plan.valid);
  assert(portrait_plan.crop_width * portrait_plan.scale_units / 16 == 688);
  assert(portrait_plan.crop_height * portrait_plan.scale_units / 16 == 504);
  assert(!p4_cover_scale_plan(0, 768, 688, 504, 16, 4095).valid);

  // Packed RGB565 output is safe only for RGB565 image targets. Every other
  // configured type must fall back to the format-aware software decoder.
  assert(p4_jpeg_hardware_target_supported(true));
  assert(!p4_jpeg_hardware_target_supported(false));
}
