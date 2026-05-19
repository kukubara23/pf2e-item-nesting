const MODULE_ID = "pf2e-item-nesting";
const FLAG_PARENT = "parentId";

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initialized`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
});

/**
 * Add "Attach to..." and "Detach" options to the right-click menu
 * on items in a PF2e character sheet's inventory.
 */
Hooks.on("getCharacterSheetPF2eItemContext", addContextMenuOptions);
Hooks.on("getItemSheetPF2eContext", addContextMenuOptions);

function addContextMenuOptions(sheet, menuItems) {
  menuItems.push({
    name: "Attach to...",
    icon: '<i class="fa-solid fa-link"></i>',
    condition: (li) => {
      // Show this option for any item that isn't already attached
      const item = getItemFromElement(sheet, li);
      return item && !item.getFlag(MODULE_ID, FLAG_PARENT);
    },
    callback: (li) => {
      const item = getItemFromElement(sheet, li);
      if (item) openAttachDialog(item);
    },
  });

  menuItems.push({
    name: "Detach",
    icon: '<i class="fa-solid fa-link-slash"></i>',
    condition: (li) => {
      // Only show this option if the item IS attached to something
      const item = getItemFromElement(sheet, li);
      return item && !!item.getFlag(MODULE_ID, FLAG_PARENT);
    },
    callback: async (li) => {
      const item = getItemFromElement(sheet, li);
      if (item) {
        await item.unsetFlag(MODULE_ID, FLAG_PARENT);
        ui.notifications.info(`Detached "${item.name}"`);
      }
    },
  });
}

/**
 * Given an element from the sheet, find the actual Item document on the actor.
 * PF2e puts the item id in a data attribute on the list row.
 */
function getItemFromElement(sheet, element) {
  const el = element instanceof jQuery ? element[0] : element;
  const itemId = el?.dataset?.itemId ?? el?.closest("[data-item-id]")?.dataset?.itemId;
  return sheet.actor?.items?.get(itemId) ?? null;
}

/**
 * Show a dialog letting the user pick another item on the same actor
 * to attach this item to.
 */
async function openAttachDialog(item) {
  const actor = item.actor;
  if (!actor) return;

  // Build a list of every other item on the actor, excluding the item itself
  const candidates = actor.items
    .filter((other) => other.id !== item.id)
    .sort((a, b) => a.name.localeCompare(b.name));

  if (candidates.length === 0) {
    ui.notifications.warn("No other items to attach to.");
    return;
  }

  const optionsHtml = candidates
    .map((c) => `<option value="${c.id}">${c.name} (${c.type})</option>`)
    .join("");

  const content = `
    <form>
      <p>Attach <strong>${item.name}</strong> to:</p>
      <div class="form-group">
        <select name="parentId" style="width: 100%;">${optionsHtml}</select>
      </div>
    </form>
  `;

  // Use the V13 DialogV2 API
  const parentId = await foundry.applications.api.DialogV2.prompt({
    window: { title: "Attach Item" },
    content,
    ok: {
      label: "Attach",
      callback: (event, button) => button.form.elements.parentId.value,
    },
    rejectClose: false,
  });

  if (!parentId) return;

  await item.setFlag(MODULE_ID, FLAG_PARENT, parentId);
  const parent = actor.items.get(parentId);
  ui.notifications.info(`Attached "${item.name}" to "${parent?.name ?? "?"}"`);
}
