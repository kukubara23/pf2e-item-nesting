const MODULE_ID = "pf2e-item-nesting";
const FLAG_PARENT = "parentId";

// Item types that can RECEIVE attachments (parents)
const PARENT_TYPES = new Set(["weapon", "armor", "shield", "equipment"]);

// Item types that CAN'T be children (don't usually get attached to things)
const NON_ATTACHABLE_TYPES = new Set(["shield", "armor"]);

Hooks.once("init", () => {
  console.log(`${MODULE_ID} | initialized`);
});

Hooks.once("ready", () => {
  console.log(`${MODULE_ID} | ready`);
});

/**
 * Add header buttons to physical item sheets.
 * - "Add Attachment" on parent-type items
 * - "Detach" on items that are already attached to something
 */
Hooks.on("getItemSheetPF2eHeaderButtons", addHeaderButtons);

function addHeaderButtons(sheet, buttons) {
  const item = sheet.item;
  if (!item?.actor) return; // Only on actor-owned items

  // "Add Attachment" — shown on parent-type items
  if (PARENT_TYPES.has(item.type)) {
    buttons.unshift({
      label: "Add Attachment",
      class: "pf2e-item-nesting-attach",
      icon: "fa-solid fa-link",
      onclick: () => openAttachDialog(item),
    });
  }

  // "Detach" — shown on items that have our flag set
  if (item.getFlag(MODULE_ID, FLAG_PARENT)) {
    buttons.unshift({
      label: "Detach",
      class: "pf2e-item-nesting-detach",
      icon: "fa-solid fa-link-slash",
      onclick: () => detachItem(item),
    });
  }
}

/**
 * Open the attach dialog. The parent is fixed (the sheet we're on);
 * the user picks which child to attach.
 */
async function openAttachDialog(parent) {
  const actor = parent.actor;
  if (!actor) return;

  // Candidate children:
  // - physical items on the same actor
  // - not the parent itself
  // - not types we exclude
  // - not already attached (to anything, including this parent)
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

/**
 * Remove the attachment flag from an item.
 */
async function detachItem(item) {
  try {
    await item.unsetFlag(MODULE_ID, FLAG_PARENT);
    ui.notifications.info(`Detached "${item.name}".`);
  } catch (err) {
    console.error(`${MODULE_ID} | detach error:`, err);
    ui.notifications.error(`Couldn't detach: ${err.message}`);
  }
}
