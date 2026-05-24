// ── Context abstraction ────────────────────────────────────────────────

function ctx() {
  if (state.editingSubpage) {
    var sp = getSubpage(state.editingSubpage);
    return {
      grid: sp.grid, sizes: sp.sizes, buttons: sp.buttons,
      maxSlots: NUM_SLOTS, selected: state.subpageSelectedSlots,
      isSub: true,
      setSelected: function (s) { state.subpageSelectedSlots = s; },
      setLastClicked: function (s) { state.subpageLastClicked = s; },
      getLastClicked: function () { return state.subpageLastClicked; },
      save: function () { saveSubpageConfig(state.editingSubpage); },
    };
  }
  return {
    grid: state.grid, sizes: state.sizes, buttons: state.buttons,
    maxSlots: NUM_SLOTS, selected: state.selectedSlots,
    isSub: false,
    setSelected: function (s) { state.selectedSlots = s; },
    setLastClicked: function (s) { state.lastClickedSlot = s; },
    getLastClicked: function () { return state.lastClickedSlot; },
    save: function () { postText(entityName("button_order"), serializeGrid(state.grid)); },
  };
}

// ── Grid helpers ───────────────────────────────────────────────────────

function sizeFromToken(token) {
  return token === "d" ? 2 : token === "w" ? 3 : token === "b" ? 4 :
    token === "t" ? 5 : token === "x" ? 6 : 1;
}

function sizeToken(size) {
  return size === 4 ? "b" : size === 2 ? "d" : size === 3 ? "w" :
    size === 5 ? "t" : size === 6 ? "x" : "";
}

function sizeRowSpan(size) {
  return size === 5 ? 3 : (size === 2 || size === 4) ? 2 : 1;
}

function sizeColSpan(size) {
  return size === 6 ? 3 : (size === 3 || size === 4) ? 2 : 1;
}

function sizeClass(size) {
  return size === 4 ? " sp-btn-big" : size === 2 ? " sp-btn-double" :
    size === 3 ? " sp-btn-wide" : size === 5 ? " sp-btn-extra-tall" :
    size === 6 ? " sp-btn-extra-wide" : "";
}

function coveredCells(pos, size, maxSlots, includeOrigin) {
  var cells = [];
  var rowSpan = sizeRowSpan(size);
  var colSpan = sizeColSpan(size);
  for (var r = 0; r < rowSpan; r++) {
    for (var c = 0; c < colSpan; c++) {
      if (!includeOrigin && r === 0 && c === 0) continue;
      cells.push(pos + r * GRID_COLS + c);
    }
  }
  return cells;
}

function sizeFitsAt(pos, size, maxSlots) {
  if (pos < 0 || pos >= maxSlots) return false;
  var col = pos % GRID_COLS;
  var row = Math.floor(pos / GRID_COLS);
  var rows = Math.ceil(maxSlots / GRID_COLS);
  return col + sizeColSpan(size) <= GRID_COLS &&
    row + sizeRowSpan(size) <= rows &&
    pos + (sizeRowSpan(size) - 1) * GRID_COLS + sizeColSpan(size) - 1 < maxSlots;
}

function markSpannedCells(grid, pos, size, maxSlots) {
  var cells = coveredCells(pos, size, maxSlots, false);
  for (var i = 0; i < cells.length; i++) {
    var cell = cells[i];
    if (cell >= 0 && cell < maxSlots) grid[cell] = -1;
  }
}

function parseOrder(str) {
  var grid = [];
  for (var i = 0; i < NUM_SLOTS; i++) grid.push(0);
  if (!str || !str.trim()) return grid;
  var parts = str.split(",");
  for (var i = 0; i < parts.length && i < NUM_SLOTS; i++) {
    var s = parts[i].trim();
    if (!s) continue;
    var last = s.charAt(s.length - 1);
    var parsedSize = sizeFromToken(last);
    var n = parseInt(s, 10);
    if (n >= 1 && n <= NUM_SLOTS && !isNaN(n)) {
      grid[i] = n;
      if (parsedSize > 1) state.sizes[n] = parsedSize;
    }
  }
  applySpans(grid, state.sizes, NUM_SLOTS);
  return grid;
}

function applySpans(grid, sizes, maxSlots) {
  for (var i = 0; i < maxSlots; i++) {
    if (!(grid[i] > 0 || grid[i] === -2)) continue;
    var slot = grid[i];
    var size = sizes[slot] || 1;
    if (size <= 1) continue;
    if (!sizeFitsAt(i, size, maxSlots)) {
      delete sizes[slot];
      continue;
    }
    var toRes = coveredCells(i, size, maxSlots, false);
    var ok = true;
    for (var ci = 0; ci < toRes.length; ci++) {
      if (grid[toRes[ci]] > 0 || grid[toRes[ci]] === -2) {
        var displaced = grid[toRes[ci]];
        var placed = false;
        for (var j = 0; j < maxSlots; j++) {
          if (grid[j] === 0 && toRes.indexOf(j) === -1) { grid[j] = displaced; placed = true; break; }
        }
        if (!placed) { ok = false; break; }
        grid[toRes[ci]] = 0;
      }
    }
    if (!ok) { delete sizes[slot]; continue; }
    for (var mi = 0; mi < toRes.length; mi++) grid[toRes[mi]] = -1;
  }
}

function serializeGrid(grid) {
  var last = -1;
  for (var i = grid.length - 1; i >= 0; i--) {
    if (grid[i] > 0) { last = i; break; }
  }
  if (last < 0) return "";
  return grid.slice(0, last + 1).map(function (slot) {
    if (slot <= 0) return "";
    var sz = state.sizes[slot];
    return slot + sizeToken(sz);
  }).join(",");
}

function applyImportedButtonOrder(orderStr, importedSizes) {
  state.sizes = importedSizes || {};
  state.grid = parseOrder(orderStr);
}

function clearSpans(grid, maxSlots) {
  for (var i = 0; i < maxSlots; i++) {
    if (grid[i] === -1) grid[i] = 0;
  }
}


function resolveIcon(b) {
  var sel = b.icon || "Auto";
  if (sel === "Auto" && b.entity) {
    var domain = b.entity.split(".")[0];
    return DOMAIN_ICONS[domain] || "cog";
  }
  return iconSlug(sel);
}

function btnDisplayName(b) {
  return b.label || b.entity || "Configure";
}
