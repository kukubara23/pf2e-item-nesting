const MODULE_ID = "pf2e-item-nesting";
const FLAG_PARENT = "parentId";
const NESTED_CLASS = "pf2e-item-nesting-child";

// Item types that can RECEIVE attachments (parents)
const PARENT_TYPES = new Set(["weapon", "armor", "shield", "equipment"]);

// Item types that CAN'T be children
const NON_ATTACHABLE_TYPES = new Set(["shield", "armor"]);

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initialized`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
});

/* ---------- Header buttons (from Step 3b) ---------- */

Hooks.on("getItemSheetPF2eHeaderButtons", addHeaderButtons);

function addHeaderButtons(sheet, buttons) {
  const item = sheet.item;
  if (!item?.actor) return;

  if (PARENT_TYPES.has(item.type)) {
    buttons.unshift({
      label: "Add Attachment",
      class: "pf2e-item-nesting-attach",
      icon: "fa-solid fa-link",
      onclick: () => openAttachDialog(item),
    });
  }

  if (item.getFlag(MODULE_ID, FLAG_PARENT)) {
    buttons.unshift({
      label: "Detach",
      class: "pf2e-item-nesting-detach",
      icon: "fa-solid fa-link-slash",
      onclick: () => detachItem(item),
    });
  }
}

async function openAttachDialog(parent) {
  const actor = parent.actor;
  if (!actor) return;

  const candidates = actor.items
    .filter((i) => {
      if (!i.isOfType?.("physical")) return false;
      if (i.id === parent.id) return false;
      if (NON_ATTACHABLE_TYPES.has(i.type)) return false;
      if (i.getFlag(MODULE_ID, FLAG_PARENT)) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  if (candidates.length === 0) {
    ui.notifications.warn("No attachable items available on this actor.");
    return;
  }

  const options = candidates
    .map((c) => `<option value="${c.id}">${c.name} (${c.type})</option>`)
    .join("");

  const content = `
    <form>
      <p>Attach an item to <strong>${parent.name}</strong>:</p>
      <div class="form-group">
        <select name="childId" style="width: 100%;">${options}</select>
      </div>
    </form>
  `;

  const childId = await foundry.applications.api.DialogV2.prompt({
    window: { title: `Attach to ${parent.name}` },
    content,
    ok: {
      label: "Attach",
      callback: (event, button) => button.form.elements.childId.value,
    },
    rejectClose: false,
  });

  if (!childId) return;

  const child = actor.items.get(childId);
  if (!child) return;

  try {
    await child.setFlag(MODULE_ID, FLAG_PARENT, parent.id);
    ui.notifications.info(`Attached "${child.name}" to "${parent.name}".`);
  } catch (err) {
    console.error(`${MODULE_ID} | attach error:`, err);
    ui.notifications.error(`Couldn't attach: ${err.message}`);
  }
}

async function detachItem(item) {
  try {
    await item.unsetFlag(MODULE_ID, FLAG_PARENT);
    ui.notifications.info(`Detached "${item.name}".`);
  } catch (err) {
    console.error(`${MODULE_ID} | detach error:`, err);
    ui.notifications.error(`Couldn't detach: ${err.message}`);
  }
}

/* ---------- Visual nesting (NEW in Step 3d) ---------- */

Hooks.on("renderCharacterSheetPF2e", applyVisualNesting);

function applyVisualNesting(sheet, html) {
  const actor = sheet.actor;
  if (!actor) return;

  // Normalize html: V13 ApplicationV2 passes an HTMLElement,
  // older versions pass a jQuery object.
  const root = html instanceof jQuery ? html[0] : (html?.element ?? html);
  if (!root?.querySelectorAll) return;

  // Step 1: Clean up any previous styling from this module.
  // (PF2e re-renders the sheet often; we don't want stale styles to accumulate.)
  for (const row of root.querySelectorAll(`.${NESTED_CLASS}`)) {
    row.classList.remove(NESTED_CLASS);
    row.style.paddingLeft = "";
    const icon = row.querySelector(".pf2e-item-nesting-indicator");
    if (icon) icon.remove();
  }

  // Step 2: Build a map of parent ID -> array of child items.
  // We only look at items that have our flag set.
  const childMap = new Map();
  for (const item of actor.items) {
    const parentId = item.getFlag(MODULE_ID, FLAG_PARENT);
    if (!parentId) continue;
    if (!childMap.has(parentId)) childMap.set(parentId, []);
    childMap.get(parentId).push(item);
  }

  // Step 3: Recursively place children under their parents.
  // Going top-down (parents before children) ensures nested chains
  // (A in B, B in C) end up in the right order.
  function placeChildren(parentId, depth) {
    const children = childMap.get(parentId);
    if (!children) return;

    let lastPlaced = root.querySelector(`li[data-item-id="${parentId}"]`);
    if (!lastPlaced) return; // parent's row isn't in the DOM (different tab, etc.)

    for (const child of children) {
      const childRow = root.querySelector(`li[data-item-id="${child.id}"]`);
      if (!childRow) continue;

      // Move the child's row to right after the parent (or the previous sibling)
      lastPlaced.after(childRow);
      lastPlaced = childRow;

      // Apply visual styling: indent + a chain-link icon
      childRow.classList.add(NESTED_CLASS);
      childRow.style.paddingLeft = `${depth * 20}px`;

      const nameEl = childRow.querySelector(".item-name");
      if (nameEl && !nameEl.querySelector(".pf2e-item-nesting-indicator")) {
        const icon = document.createElement("i");
        icon.className = "fa-solid fa-link pf2e-item-nesting-indicator";
        icon.style.marginRight = "4px";
        icon.style.opacity = "0.5";
        icon.style.fontSize = "0.85em";
        nameEl.prepend(icon);
      }

      // Recurse: handle this child's own children, if any
      placeChildren(child.id, depth + 1);
    }
  }

  // Start with every "top-level" item (no parent flag) and walk down
  for (const item of actor.items) {
    if (!item.getFlag(MODULE_ID, FLAG_PARENT)) {
      placeChildren(item.id, 1);
    }
  }
}
