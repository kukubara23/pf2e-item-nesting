const MODULE_ID = "pf2e-item-nesting";

// Item types that can RECEIVE attachments (parents)
const PARENT_TYPES = new Set(["weapon", "armor", "shield", "equipment"]);

// Item types that CAN'T be attached (excluded as children)
const NON_ATTACHABLE_TYPES = new Set(["shield", "armor"]);

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initialized`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
});

/**
 * Add header buttons to physical item sheets.
 * - On parent-type items (weapon, armor, etc.): "Add Attachment"
 * - On any attached item: "Detach"
 */
Hooks.on("getHeaderControlsItemSheetPF2e", addHeaderButtons);

function addHeaderButtons(sheet, buttons) {
  const item = sheet.item;
  if (!item?.actor) return; // Only show on items that belong to an actor

  // "Add Attachment" button — shown on parent-type items
  if (PARENT_TYPES.has(item.type)) {
    buttons.unshift({
      label: "Add Attachment",
      class: "pf2e-item-nesting-attach",
      icon: "fa-solid fa-link",
      onclick: () => openAttachDialog(item),
    });
  }

  // "Detach" button — shown on items that are currently attached to something
  // PF2e stores the parent reference on the child as system.subitemOf
  if (item.system?.subitemOf) {
    buttons.unshift({
      label: "Detach",
      class: "pf2e-item-nesting-detach",
      icon: "fa-solid fa-link-slash",
      onclick: () => detachItem(item),
    });
  }
}

/**
 * Open the attach dialog for a given parent item.
 */
async function openAttachDialog(parent) {
  const actor = parent.actor;
  if (!actor) return;

  // Find candidate children: physical items on the same actor that aren't
  // the parent itself, aren't already attached, and aren't excluded types
  const candidates = actor.items.filter((i) => {
    if (!i.isOfType?.("physical")) return false;
    if (i.id === parent.id) return false;
    if (NON_ATTACHABLE_TYPES.has(i.type)) return false;
    if (i.system?.subitemOf) return false; // already attached to something
    return true;
  }).sort((a, b) => a.name.localeCompare(b.name));

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
    await parent.attach(child);
    ui.notifications.info(`Attached "${child.name}" to "${parent.name}".`);
  } catch (err) {
    console.error(`${MODULE_ID} | attach error:`, err);
    ui.notifications.error(`Couldn't attach: ${err.message}`);
  }
}

/**
 * Detach an item from its parent.
 */
async function detachItem(item) {
  try {
    if (typeof item.detach === "function") {
      await item.detach();
    } else {
      // Fallback: clear the subitemOf reference directly
      await item.update({ "system.subitemOf": null });
    }
    ui.notifications.info(`Detached "${item.name}".`);
  } catch (err) {
    console.error(`${MODULE_ID} | detach error:`, err);
    ui.notifications.error(`Couldn't detach: ${err.message}`);
  }
}
