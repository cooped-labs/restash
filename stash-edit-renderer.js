// stash-edit-renderer.js — runs inside the standalone stash-edit window.
// Loads the target stash + items, edits membership + this stash's pin slots,
// persists on every change.
//
// Single source of truth: pins are PER STASH, stored as item.pins[stashId]
// (a number = the numpad slot order). The menu-bar popover and the cursor
// numpad read the exact same map, so nothing can drift.

const $ = (id) => document.getElementById(id);

const stashId = (location.hash || '').replace(/^#/, '');
let items = [];
let stash = null;

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function isPinned(item) {
  return !!item.pins && Object.prototype.hasOwnProperty.call(item.pins, stashId);
}
function pinOrder(item) {
  const v = item.pins ? item.pins[stashId] : undefined;
  return (typeof v === 'number') ? v : 1e9;
}
function members() {
  return items.filter((i) => Array.isArray(i.stashIds) && i.stashIds.includes(stashId));
}
// This stash's pinned items, in slot order — exactly what the cursor numpad shows.
function pinnedSlots() {
  return members().filter(isPinned).sort((a, b) => pinOrder(a) - pinOrder(b)).slice(0, 9);
}
function nextPinOrder() {
  const used = items.filter(isPinned).map((i) => i.pins[stashId]);
  return used.length ? Math.max(...used) + 1 : 0;
}

async function init() {
  try {
    items = await window.restash.loadItems();
    const stashes = await window.restash.listStashes();
    stash = stashes.find((s) => s.id === stashId);
    if (!stash) {
      $('stashName').textContent = '(stash not found)';
      return;
    }
    $('stashName').textContent = stash.name;
    renderSlots();
    renderItems();
  } catch (err) {
    console.error('[stash-edit] init failed', err);
  }
  wire();
}

function renderSlots() {
  const host = $('slotsGrid');
  const slots = pinnedSlots();
  host.innerHTML = Array.from({ length: 9 }, (_, i) => {
    const item = slots[i];
    return item
      ? `<div class="slot filled" data-slot="${i}"><span class="n">${i + 1}</span><span class="lbl">${escapeHtml(item.label)}</span><button class="remove" data-id="${item.id}" title="Unpin">×</button></div>`
      : `<div class="slot empty" data-slot="${i}"><span class="n">${i + 1}</span><span class="lbl">—</span></div>`;
  }).join('');
  host.querySelectorAll('.remove').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(btn.dataset.id);
    });
  });
}

function renderItems() {
  const host = $('itemsList');
  const slots = pinnedSlots();
  const slotOf = new Map(slots.map((it, i) => [it.id, i]));
  // Members first, then the rest — easier to find what's already in the stash.
  const sorted = [...items].sort((a, b) => {
    const am = Array.isArray(a.stashIds) && a.stashIds.includes(stashId);
    const bm = Array.isArray(b.stashIds) && b.stashIds.includes(stashId);
    if (am !== bm) return am ? -1 : 1;
    return (b.lastUsedAt || b.createdAt || 0) - (a.lastUsedAt || a.createdAt || 0);
  });
  host.innerHTML = sorted.map((item) => {
    const inStash = Array.isArray(item.stashIds) && item.stashIds.includes(stashId);
    const slot = slotOf.has(item.id) ? slotOf.get(item.id) : -1;
    const pinned = slot >= 0;
    return `
      <div class="item-row${inStash ? ' in' : ''}" data-id="${item.id}">
        <div class="check"></div>
        <div class="text">
          <div class="row-lbl">${escapeHtml(item.label)}</div>
          <div class="row-val">${escapeHtml(item.value)}</div>
        </div>
        <button class="pin-btn${pinned ? ' pinned' : ''}${inStash ? '' : ' hidden'}" data-id="${item.id}">${pinned ? `Slot ${slot + 1}` : 'Pin'}</button>
      </div>
    `;
  }).join('');

  host.querySelectorAll('.item-row').forEach((row) => {
    const id = row.dataset.id;
    row.addEventListener('click', (e) => {
      if (e.target.closest('.pin-btn')) return;
      toggleMembership(id);
    });
  });
  host.querySelectorAll('.pin-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      togglePin(btn.dataset.id);
    });
  });
}

async function toggleMembership(itemId) {
  const item = items.find((i) => i.id === itemId);
  if (!item) return;
  if (!Array.isArray(item.stashIds)) item.stashIds = [];
  const idx = item.stashIds.indexOf(stashId);
  if (idx >= 0) {
    item.stashIds.splice(idx, 1);
    // No longer a member → can't be pinned in this stash either.
    if (item.pins) delete item.pins[stashId];
  } else {
    item.stashIds.push(stashId);
  }
  // Persist immediately so changes survive a window close even if the user
  // forgets to hit Done.
  await window.restash.saveItems(items);
  renderSlots();
  renderItems();
}

// Toggle this item's pin IN THIS STASH (its numpad slot). The 3×3 numpad caps
// each stash at 9 pins.
async function togglePin(itemId) {
  const item = items.find((i) => i.id === itemId);
  if (!item) return;
  if (isPinned(item)) {
    delete item.pins[stashId];
  } else {
    if (pinnedSlots().length >= 9) return; // numpad full
    if (!item.pins) item.pins = {};
    item.pins[stashId] = nextPinOrder();
  }
  await window.restash.saveItems(items);
  renderSlots();
  renderItems();
}

async function persistAndClose() {
  // Every edit already persisted on change; save once more as a safety net.
  await window.restash.saveItems(items);
  window.restash.closeWindow();
}

async function deleteStash() {
  if (!confirm('Delete this stash? Items stay; only the grouping is removed.')) return;
  // Strip the id from any items referencing it before deleting the stash.
  for (const it of items) {
    if (Array.isArray(it.stashIds)) {
      it.stashIds = it.stashIds.filter((id) => id !== stashId);
    }
    if (it.pins) delete it.pins[stashId];
  }
  await window.restash.saveItems(items);
  await window.restash.deleteStash(stashId);
  window.restash.closeWindow();
}

function wire() {
  $('doneBtn').addEventListener('click', persistAndClose);
  $('closeBtn').addEventListener('click', persistAndClose);
  $('deleteBtn').addEventListener('click', deleteStash);
  // Esc anywhere = Done
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') persistAndClose();
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') persistAndClose();
  });
}

init();
