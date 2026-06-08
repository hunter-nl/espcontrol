#pragma once

// Internal implementation detail for button_grid.h. Include button_grid.h from device YAML.

#include "esphome/core/version.h"

struct ImageCardCtx {
  lv_obj_t *widget = nullptr;
  lv_obj_t *btn = nullptr;
  esphome::artwork_image::ArtworkImage *image = nullptr;
  std::string entity_id;
  std::string url;
  bool active = false;
  bool callbacks_bound = false;
};

inline ImageCardCtx *image_card_contexts() {
  static ImageCardCtx contexts[4];
  return contexts;
}

inline void image_card_hide(ImageCardCtx *ctx) {
  if (!ctx) return;
  if (ctx->widget) lv_obj_add_flag(ctx->widget, LV_OBJ_FLAG_HIDDEN);
}

inline void image_card_apply_downloaded(ImageCardCtx *ctx) {
  if (!ctx || !ctx->active || !ctx->widget || !ctx->image) return;
  if (ctx->image->get_url() != ctx->url) return;
#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  lv_image_set_src(ctx->widget, ctx->image->get_lv_image_dsc());
#else
  lv_img_set_src(ctx->widget, ctx->image->get_lv_img_dsc());
#endif
  lv_obj_clear_flag(ctx->widget, LV_OBJ_FLAG_HIDDEN);
  lv_obj_move_background(ctx->widget);
  lv_obj_invalidate(ctx->widget);
  if (ctx->btn) lv_obj_invalidate(ctx->btn);
  notify_dashboard_content_changed();
}

inline void image_card_bind_callbacks(ImageCardCtx *ctx) {
  if (!ctx || !ctx->image || ctx->callbacks_bound) return;
  ctx->callbacks_bound = true;
  ctx->image->add_on_finished_callback([ctx](bool) {
    image_card_apply_downloaded(ctx);
  });
  ctx->image->add_on_error_callback([ctx]() {
    ESP_LOGW("image_card", "Image download failed for %s", ctx->entity_id.c_str());
    image_card_hide(ctx);
  });
}

inline void reset_image_card_pool(const GridConfig &cfg) {
  ImageCardCtx *contexts = image_card_contexts();
  int count = cfg.image_card_image_count;
  if (count > 4) count = 4;
  for (int i = 0; i < count; i++) {
    contexts[i].active = false;
    contexts[i].widget = nullptr;
    contexts[i].btn = nullptr;
    contexts[i].entity_id.clear();
    contexts[i].url.clear();
    contexts[i].image = cfg.image_card_images ? cfg.image_card_images[i] : nullptr;
    if (contexts[i].image) contexts[i].image->release();
  }
}

inline ImageCardCtx *acquire_image_card_context(const GridConfig &cfg) {
  ImageCardCtx *contexts = image_card_contexts();
  int count = cfg.image_card_image_count;
  if (count > 4) count = 4;
  for (int i = 0; i < count; i++) {
    if (!contexts[i].active && contexts[i].image) {
      contexts[i].active = true;
      image_card_bind_callbacks(&contexts[i]);
      return &contexts[i];
    }
  }
  return nullptr;
}

inline void image_card_apply_widget_geometry(lv_obj_t *btn, lv_obj_t *widget,
                                             esphome::artwork_image::ArtworkImage *image) {
  if (!btn || !widget || !image) return;
  lv_obj_update_layout(btn);
  lv_coord_t width = lv_obj_get_width(btn);
  lv_coord_t height = lv_obj_get_height(btn);
  if (width <= 0 || height <= 0) return;
  lv_obj_set_pos(widget, 0, 0);
  lv_obj_set_size(widget, width, height);
  image->set_target_size(width, height);
  image->set_resize_mode(esphome::artwork_image::ImageResizeMode::COVER);
}

inline void setup_image_card(BtnSlot &s) {
  lv_obj_clear_flag(s.btn, LV_OBJ_FLAG_HIDDEN);
  lv_obj_clear_flag(s.btn, LV_OBJ_FLAG_CLICKABLE);
  if (s.icon_lbl) lv_obj_add_flag(s.icon_lbl, LV_OBJ_FLAG_HIDDEN);
  if (s.sensor_container) lv_obj_add_flag(s.sensor_container, LV_OBJ_FLAG_HIDDEN);
  if (s.text_lbl) lv_obj_add_flag(s.text_lbl, LV_OBJ_FLAG_HIDDEN);
  if (s.subpage_lbl) lv_obj_add_flag(s.subpage_lbl, LV_OBJ_FLAG_HIDDEN);

#if ESPHOME_VERSION_CODE >= VERSION_CODE(2026, 4, 0)
  lv_obj_t *img = lv_image_create(s.btn);
#else
  lv_obj_t *img = lv_img_create(s.btn);
#endif
  lv_obj_add_flag(img, LV_OBJ_FLAG_HIDDEN);
  lv_obj_clear_flag(img, LV_OBJ_FLAG_CLICKABLE);
  lv_obj_set_style_radius(img, lv_obj_get_style_radius(s.btn, LV_PART_MAIN), LV_PART_MAIN);
  lv_obj_set_style_clip_corner(img, true, LV_PART_MAIN);
  lv_obj_set_user_data(s.sensor_container, img);
}

inline std::string image_card_join_url(const std::string &base, const std::string &path) {
  if (path.empty() || path == "unknown" || path == "unavailable") return "";
  if (path.rfind("http://", 0) == 0 || path.rfind("https://", 0) == 0) return path;
  if (base.empty() || path[0] != '/') return "";
  return base + path;
}

inline std::string image_card_cache_bust_url(const std::string &url) {
  if (url.empty()) return "";
  std::string next = url;
  next += (next.find('?') == std::string::npos) ? "?time=" : "&time=";
  next += std::to_string(esphome::millis());
  return next;
}

inline void image_card_request_url(ImageCardCtx *ctx, const GridConfig &cfg,
                                   esphome::StringRef picture) {
  if (!ctx || !ctx->active || !ctx->image) return;
  std::string base = cfg.home_assistant_base_url ? cfg.home_assistant_base_url() : "";
  std::string raw = string_ref_limited(picture, 4096);
  std::string url = image_card_join_url(base, raw);
  if (url.empty()) {
    ESP_LOGW("image_card", "No usable entity_picture URL for %s", ctx->entity_id.c_str());
    image_card_hide(ctx);
    return;
  }
  ctx->url = image_card_cache_bust_url(url);
  image_card_apply_widget_geometry(ctx->btn, ctx->widget, ctx->image);
  ESP_LOGI("image_card", "Downloading camera image for %s", ctx->entity_id.c_str());
  ctx->image->request_update_url(ctx->url);
}

inline bool bind_image_card(BtnSlot &s, const ParsedCfg &p, const GridConfig &cfg) {
  if (p.type != "image") return false;
  lv_obj_t *widget = s.sensor_container
    ? static_cast<lv_obj_t *>(lv_obj_get_user_data(s.sensor_container))
    : nullptr;
  if (p.entity.empty()) return true;
  if (p.entity.rfind("camera.", 0) != 0) {
    ESP_LOGW("image_card", "Image card only supports camera entities: %s", p.entity.c_str());
    return true;
  }
  ImageCardCtx *ctx = acquire_image_card_context(cfg);
  if (!ctx) {
    ESP_LOGW("image_card", "No image card downloader available for %s", p.entity.c_str());
    return true;
  }
  ctx->widget = widget;
  ctx->btn = s.btn;
  ctx->entity_id = p.entity;
  image_card_apply_widget_geometry(ctx->btn, ctx->widget, ctx->image);

  ha_subscribe_attribute(
    p.entity,
    std::string("entity_picture"),
    std::function<void(esphome::StringRef)>(
      [ctx, cfg](esphome::StringRef picture) {
        image_card_request_url(ctx, cfg, picture);
      })
  );
  ha_get_attribute(
    p.entity,
    std::string("entity_picture"),
    std::function<void(esphome::StringRef)>(
      [ctx, cfg](esphome::StringRef picture) {
        image_card_request_url(ctx, cfg, picture);
      })
  );
  return true;
}
