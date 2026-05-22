# Assets

This directory contains internal firmware assets for fonts, icons, and glyph
sets. It is repository documentation for maintainers and is not part of the
public docs site.

## Font naming and ramp

Font component IDs should describe the font itself, not the UI place where it is
used. Use this pattern:

```text
font_<source>_<weight-or-set>_<size>[_glyphset]
```

Examples:

- `font_roboto_regular_22_text`
- `font_roboto_light_55_digits`
- `font_mdi_41_icons`
- `font_mdi_19_network`

The current type ramp is not encoded as a shared generator or token file. It is
implemented by the sizes in `common/assets/fonts.yaml`, `common/assets/icons.yaml`,
and each `devices/*/device/fonts.yaml`, then assigned to UI roles in
`devices/manifest.json` and the device `packages.yaml` files.

### Shared ratios

There are repeated ratios that should be preserved when adding or adjusting a
device:

| Relationship | Current rule |
| --- | --- |
| Large sensor numbers | `2.5x` the normal sensor value font |
| Climate card icons | About `75%` of the main card icon font |
| 720x720 square panel | Mostly `1.5x` the 480x480 square panel |

Examples of the current ratios:

| Device class | Main icon | Climate icon | Sensor | Large sensor |
| --- | ---: | ---: | ---: | ---: |
| 480x480 square | 44 | 33 | 44 | 110 |
| 720x720 square | 66 | 50 | 66 | 165 |
| 1024x600 landscape | 55 | 41 | 55 | 138 |
| 480x800 portrait | 62 | 47 | 62 | 155 |
| 1280x800 landscape | 56 | 42 | 52 | 130 |

### Current role assignments

The firmware role names in `devices/manifest.json` are intentionally still
usage-based. They map the standard font IDs to UI roles:

| Role | Purpose |
| --- | --- |
| `icon` | Main card icon |
| `climateCardIcon` | Smaller climate card icon |
| `sensor` | Normal sensor/statistic value |
| `largeSensor` | Large-number sensor card value |
| `mediaTitle` | Media card title text |
| `volumeNumber` | Large modal numeric value |
| `volumeLabel` | Modal label text |
| `climateOptionTitle` | Climate option chip title |
| `climateOptionValue` | Climate option chip value |

When changing the ramp, update the font component IDs and the manifest together,
then run:

```sh
python3 scripts/generate_device_slots.py
npm run check:all
```

## How to add an icon

All button icons are defined once in [`icons.json`](icons.json) and synced to the device font list, firmware lookup table, and web UI by a script. Never edit generated icon lists directly.

## 1. Find the icon on MDI

Browse [Material Design Icons](https://materialdesignicons.com/) and note three things:

| Field | Example | Where to find it |
|-------|---------|-------------------|
| **name** | `Ceiling Fan` | Choose a user-friendly display name |
| **codepoint** | `F1797` | Shown on the icon detail page (hex, no `0x` prefix) |
| **mdi** | `ceiling-fan` | The MDI class name (used as `mdi-ceiling-fan` in CSS) |

## 2. Add the entry to `icons.json`

Open `common/assets/icons.json` and add an object to the `"icons"` array:

```json
{ "name": "Ceiling Fan", "codepoint": "F1797", "mdi": "ceiling-fan" }
```

The array order determines display order in the LVGL font glyph list and the C++ lookup table. The YAML select options and JS picker sort alphabetically, so position doesn't matter for those.

## 3. Run the sync script

```sh
python3 scripts/build.py icons
```

This patches the generated icon sections in:

- `common/assets/icon_glyphs.yaml` — LVGL font glyph codepoints
- `components/espcontrol/icons.h` — C++ icon lookup table and domain defaults
- `src/webserver/www.js` — web UI icon picker names and domain defaults

Run `python3 scripts/build.py` to also rebuild the generated per-device web UI bundles under `docs/public/webserver/.../www.js`.

## 4. Verify

```sh
python3 scripts/build.py icons --check
```

Exits 0 if everything is in sync. The check also compares each `icons.json` codepoint with the pinned Material Design Icons release, so the browser preview and device font cannot silently drift apart.

## Domain defaults

To change which icon is used when a button's icon is set to "Auto", edit the `"domain_defaults"` object in `icons.json`. Values must reference an icon `name` from the `"icons"` array.
