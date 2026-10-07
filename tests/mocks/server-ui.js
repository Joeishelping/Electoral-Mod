// Stand-in for @minecraft/server-ui that validates arguments the way the game does
// and asks player.respond(form) for an answer.

export const FormCancelationReason = { UserBusy: "UserBusy", UserClosed: "UserClosed" };

const isText = (t) => typeof t === "string" || (t && typeof t === "object");
function check(cond, msg) {
  if (!cond) throw new TypeError(`[server-ui mock] ${msg}`);
}

export class ActionFormData {
  constructor() { this.kind = "action"; this.buttons = []; this._body = ""; }
  title(t) { check(isText(t), "title"); this._title = t; return this; }
  body(t) { check(isText(t), "body"); this._body = t; return this; }
  button(text, icon) {
    check(isText(text), "button text");
    if (icon !== undefined) check(typeof icon === "string", "icon path");
    this.buttons.push(text);
    return this;
  }
  async show(player) {
    const r = await player.respond(this);
    if (r === null) return { canceled: true, cancelationReason: FormCancelationReason.UserClosed };
    check(Number.isInteger(r) && r >= 0 && r < this.buttons.length, "selection");
    return { canceled: false, selection: r };
  }
}

export class MessageFormData {
  constructor() { this.kind = "message"; }
  title(t) { check(isText(t), "title"); this._title = t; return this; }
  body(t) { check(isText(t), "body"); this._body = t; return this; }
  button1(t) { check(isText(t), "button1"); this.b1 = t; return this; }
  button2(t) { check(isText(t), "button2"); this.b2 = t; return this; }
  async show(player) {
    check(this.b1 !== undefined && this.b2 !== undefined, "message form needs two buttons");
    const r = await player.respond(this);
    if (r === null) return { canceled: true, cancelationReason: FormCancelationReason.UserClosed };
    return { canceled: false, selection: r };
  }
}

export class ModalFormData {
  constructor() { this.kind = "modal"; this.fields = []; }
  title(t) { check(isText(t), "title"); this._title = t; return this; }
  textField(label, placeholder, opts = {}) {
    check(isText(label) && isText(placeholder), "textField label/placeholder");
    check(opts.defaultValue === undefined || typeof opts.defaultValue === "string", "textField defaultValue");
    this.fields.push({ type: "text", label, value: opts.defaultValue ?? "" });
    return this;
  }
  slider(label, min, max, opts = {}) {
    check(isText(label), "slider label");
    check(Number.isFinite(min) && Number.isFinite(max) && min < max, `slider range ${min}..${max} (${label})`);
    const step = opts.valueStep ?? 1;
    check(step > 0, "slider step");
    const v = opts.defaultValue ?? min;
    check(Number.isFinite(v) && v >= min && v <= max, `slider default ${v} not in ${min}..${max} (${label})`);
    this.fields.push({ type: "slider", label, min, max, step, value: v });
    return this;
  }
  dropdown(label, items, opts = {}) {
    check(isText(label), "dropdown label");
    check(Array.isArray(items) && items.length > 0 && items.every(isText), `dropdown items (${label})`);
    const v = opts.defaultValueIndex ?? 0;
    check(Number.isInteger(v) && v >= 0 && v < items.length, `dropdown default ${v} (${label})`);
    this.fields.push({ type: "dropdown", label, items, value: v });
    return this;
  }
  toggle(label, opts = {}) {
    check(isText(label), "toggle label");
    this.fields.push({ type: "toggle", label, value: !!opts.defaultValue });
    return this;
  }
  submitButton(t) { check(isText(t), "submit"); return this; }
  async show(player) {
    const r = await player.respond(this);
    if (r === null) return { canceled: true, cancelationReason: FormCancelationReason.UserClosed };
    check(Array.isArray(r) && r.length === this.fields.length, "formValues length");
    return { canceled: false, formValues: r };
  }
}
