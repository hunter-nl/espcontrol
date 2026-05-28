---
title: Todo Cards
description:
  How to use Todo cards on your EspControl panel with Home Assistant todo lists.
---

# Todo

Todo cards show a Home Assistant `todo.*` list on the panel. The card shows the number of incomplete items. Tapping the card opens the list, where each visible item can be tapped to mark it complete.

## Setting Up a Todo Card

1. Select a card and change its type to **Todo**.
2. Choose an **Entity**, such as `todo.shopping`.
3. Set **Label** if you want a custom list name.
4. Choose whether the top-left corner shows the **Counter** or the **Icon**.
5. Optionally choose an icon.

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
- it cannot add, delete, rename, restore, or show completed items
- very long lists are capped on the panel to protect memory
