// Thin wrappers over @minecraft/server-ui so menus read as plain async functions.

import { system } from "@minecraft/server";
import { ActionFormData, FormCancelationReason, MessageFormData, ModalFormData } from "@minecraft/server-ui";

const wait = (ticks) => new Promise((resolve) => system.runTimeout(resolve, ticks));

async function show(player, form) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const res = await form.show(player);
    if (res.canceled && res.cancelationReason === FormCancelationReason.UserBusy) {
      await wait(5);
      continue;
    }
    return res;
  }
  return { canceled: true };
}

/** buttons: array of strings or { text, icon }. Returns index or undefined. */
export async function menu(player, title, body, buttons) {
  const form = new ActionFormData().title(title).body(body || "");
  for (const b of buttons) {
    if (typeof b === "string") form.button(b);
    else if (b.icon) form.button(b.text, b.icon);
    else form.button(b.text);
  }
  const res = await show(player, form);
  return res.canceled ? undefined : res.selection;
}

/** Menu where each option carries its own action; "Back" handled by returning false. */
export async function choose(player, title, body, options) {
  const visible = options.filter(Boolean);
  const idx = await menu(player, title, body, visible.map((o) => ({ text: o.text, icon: o.icon })));
  if (idx === undefined) return undefined;
  return visible[idx];
}

export async function confirm(player, title, body, yes = "§aConfirm", no = "Cancel") {
  const form = new MessageFormData().title(title).body(body).button1(yes).button2(no);
  const res = await show(player, form);
  return !res.canceled && res.selection === 0;
}

export async function notice(player, title, body) {
  await menu(player, title, body, ["OK"]);
}

/**
 * fields: [{ key, type: "text"|"slider"|"dropdown"|"toggle", label, ... }]
 *   text:     placeholder, value
 *   slider:   min, max, step, value
 *   dropdown: options (strings), value (index)
 *   toggle:   value (bool)
 * Returns { key: value } or undefined when cancelled.
 */
export async function modal(player, title, fields, submit = "Save") {
  const form = new ModalFormData().title(title);
  for (const f of fields) {
    switch (f.type) {
      case "text":
        form.textField(f.label, f.placeholder ?? "", { defaultValue: String(f.value ?? "") });
        break;
      case "slider": {
        const v = Math.min(f.max, Math.max(f.min, Math.round(Number(f.value ?? f.min))));
        form.slider(f.label, f.min, f.max, { valueStep: f.step ?? 1, defaultValue: v });
        break;
      }
      case "dropdown":
        form.dropdown(f.label, f.options.length ? f.options : ["(none)"], { defaultValueIndex: Math.max(0, Math.min((f.options.length || 1) - 1, f.value ?? 0)) });
        break;
      case "toggle":
        form.toggle(f.label, { defaultValue: !!f.value });
        break;
    }
  }
  form.submitButton(submit);
  const res = await show(player, form);
  if (res.canceled || !res.formValues) return undefined;
  const out = {};
  fields.forEach((f, i) => (out[f.key] = res.formValues[i]));
  return out;
}

// ---------- text helpers ----------

export function bar(frac, width = 20, color = "§a") {
  const n = Math.max(0, Math.min(width, Math.round(frac * width)));
  return `${color}${"|".repeat(n)}§8${"|".repeat(width - n)}§r`;
}

export const pct = (x, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export function fmt(n) {
  return Math.round(n).toLocaleString ? Math.round(n).toLocaleString("en-US") : String(Math.round(n));
}

export function wrapList(items, empty = "§7none") {
  return items.length ? items.join("\n") : empty;
}
