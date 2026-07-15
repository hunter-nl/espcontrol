#include <cassert>

#include "image_pipeline_policy.h"

using esphome::artwork_image::p4_pipeline_candidate_precedes;
using esphome::artwork_image::p4_pipeline_result_is_current;
using esphome::artwork_image::image_pipeline_should_requeue_interrupted_tile;
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

  // Packed RGB565 output is safe only for RGB565 image targets. Every other
  // configured type must fall back to the format-aware software decoder.
  assert(p4_jpeg_hardware_target_supported(true));
  assert(!p4_jpeg_hardware_target_supported(false));
}
