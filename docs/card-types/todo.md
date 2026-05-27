---
title: Todo Cards
description:
  How to use experimental Todo cards on your EspControl panel with Home Assistant todo lists.
---

# Todo

Todo cards show a Home Assistant `todo.*` list on the panel. The card shows the number of incomplete items. Tapping the card opens the list, where each visible item can be tapped to mark it complete.

::: warning Experimental
Todo cards are currently hidden behind **Developer Experimental Features** while they are being tested.
:::

## Setting Up a Todo Card

1. Enable **Developer Experimental Features**.
2. Select a card and change its type to **Todo**.
3. Choose a `todo.*` entity, such as `todo.shopping`.
4. Optionally set a label and icon.
5. Use **Label** to choose whether the label stays static or shows the incomplete count.
6. Use **Status** to choose whether the card shows the selected icon or the incomplete count.
7. Use **Show Completed Items** to choose whether checked-off items stay visible in a completed section.

## How It Works

Home Assistant todo entities only expose the incomplete item count as their normal state. EspControl requests the actual item list from Home Assistant when you open the card.

The panel uses Home Assistant actions to:

- fetch incomplete items from the selected todo list
- mark a tapped item as complete

Make sure the device is allowed to perform Home Assistant actions. See [Home Assistant Actions](/getting-started/home-assistant-actions) if list loading or completion does not work.

## Current Limits

This first test version is intentionally small:

- it shows incomplete items only
- it can complete items
- it cannot add, delete, rename, or show completed items
- very long lists are capped on the panel to protect memory
