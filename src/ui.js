import { esc } from "./chart.js";
const paths = {
  box: "M3 12h5m8 0h5M3 9v6m18-6v6M8 7h8v10H8zM12 7v10",
  gap: "M8 7h9m-12 9h9M4 7a2 2 0 1 0 4 0 2 2 0 1 0-4 0m13 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0M1 16a2 2 0 1 0 4 0 2 2 0 1 0-4 0m13 0a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
  bars: "M3 4v16h18M6 7h12M6 12h8M6 17h15",
  dots: "M3 20h18M6 14h.1m5-6h.1m5 4h.1",
  stack: "M3 5h18v5H3zM8 5v5m5-5v5M3 14h18v5H3zM12 14v5m5-5v5",
  grid: "M3 3h18v18H3zM9 3v18m6-18v18M3 9h18M3 15h18",
  hist: "M3 20h18M4 20v-7h5v7m0-1V5h5v15m0-1v-9h5v10",
  scatter: "M3 3v17h18M7 15h1m1-5h1m2 3h1m2-6h1m2-2h1",
  line: "M3 3v17h18M6 15l4-6 4 3 6-8",
  small: "M3 4h7v7H3zM14 4h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  presence: "M3 3h18v18H3zM12 3v18M3 12h18m-15-5 2 2 2-3m5 10 2 2 2-3",
  excerpts: "M4 3h16v18H4zM7 7h10M7 11h8M7 15h10",
  upload: "M12 16V3m-5 5 5-5 5 5M4 15v5h16v-5",
  check: "m3 12 5 5L20 5",
  explore: "M3 20h18M6 16v-4m5 4V6m5 10V9",
  compare: "M3 5h7v14H3zM14 5h7v14h-7z",
  save: "M4 4h13l3 3v13H4zM8 4v6h8V4m-8 16v-7h8v7",
  text: "M5 3h14v18H5zM8 8h8m-8 4h8m-8 4h5",
  table: "M3 5h18v14H3zM3 10h18M9 5v14",
  bot: "M3 4h18v13h-10l-5 4v-4H3zM7 9h10",
  menu: "M3 5h18v14H3zM9 5v14",
  project: "M3 7h7l2 2h9v11H3z",
};
export const icon = (k) =>
  `<svg aria-hidden="true" class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[k] || paths.text}"/></svg>`;
// Four bars echo the app mark. The accompanying text carries the status for
// assistive technology and when animation is switched off.
export const activityIcon =
  '<svg class="bot-activity-icon" viewBox="0 0 36 36" aria-hidden="true" focusable="false"><rect width="36" height="36" rx="8" fill="currentColor"/><g fill="white"><rect x="7" y="14" width="3.5" height="13" rx="1"/><rect x="13" y="7" width="3.5" height="20" rx="1"/><rect x="19" y="12" width="3.5" height="15" rx="1"/><rect x="25" y="9" width="3.5" height="18" rx="1"/></g></svg>';
export const busyIndicator = (message, announce = true) =>
  `<span class="bot-working"${announce ? ' role="status"' : ""}>${activityIcon}<span>${esc(message)}</span></span>`;
export const mark = '<img class="mark" src="./data-visualiser.svg" alt="">';
export const pict = (k) =>
  k === "survey"
    ? '<svg class="pict" viewBox="0 0 68 43" aria-hidden="true"><g fill="#3964bd"><rect x="6" y="15" width="10" height="21" rx="2"/><rect x="22" y="5" width="10" height="31" rx="2"/><rect x="38" y="20" width="10" height="16" rx="2"/></g><path d="M1 37h55" stroke="#99aed9"/></svg>'
    : '<svg class="pict" viewBox="0 0 68 43" aria-hidden="true"><g stroke="#397768" stroke-width="2" fill="none"><path d="M3 5h41v24H21l-9 7v-7H3z"/><path d="M48 15h8v22h-6l-3 4-7-4H27"/><path d="M10 13h26m-26 7h18"/></g></svg>';
export const button = (act, title, cls = "", extra = "") =>
  `<button type="button" class="${cls}" data-act="${act}" ${extra}>${title}</button>`;
export const opts = (values, sel) =>
  values
    .map((x) => {
      const [v, l] = Array.isArray(x) ? x : [x, x];
      return `<option value="${esc(v)}" ${v === sel ? "selected" : ""}>${esc(l)}</option>`;
    })
    .join("");
export const select = (key, label, values, value) =>
  `<label>${esc(label)}<select data-key="${key}">${opts(values, value)}</select></label>`;
export const input = (key, label, value = "") =>
  `<label>${esc(label)}<input data-key="${key}" value="${esc(value)}"></label>`;
export const formselect = (id, label, values, value) =>
  `<label>${esc(label)}<select id="${id}">${opts(values, value)}</select></label>`;
export const table = (headers, rows) =>
  `<div class="scroll"><table><thead><tr>${headers.map((h) => "<th>" + esc(h) + "</th>").join("")}</tr></thead><tbody>${rows.map((r) => "<tr>" + r.map((v) => "<td>" + esc(v) + "</td>").join("") + "</tr>").join("")}</tbody></table></div>`;
export const get = (id) => document.getElementById(id);
export const notice = (msg) => {
  const n = get("notice");
  n.textContent = msg;
  n.hidden = false;
  clearTimeout(n._timer);
  n._timer = setTimeout(() => (n.hidden = true), 6500);
};
export function modal(title, content, onOK, accept = "Apply") {
  const d = get("dialog");
  if (d.open) d.close();
  d.setAttribute("aria-labelledby", "dialog-title");
  d.innerHTML = `<form method="dialog" id="modalform">
    <h2 id="dialog-title">${esc(title)}</h2>
    <div class="dialog-body">${content}</div>
    <footer class="dialog-footer"><p role="alert" id="formerror"></p>
      <div class="action-row dialog-actions">${onOK ? `<button type="submit" class="primary">${esc(accept)}</button>` : ""}<button type="button" id="closeDialog">Close</button></div>
    </footer></form>`;
  d.showModal();
  d.oncancel = null;
  get("closeDialog").onclick = () => d.close();
  get("modalform").onsubmit = async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    try {
      const result = await onOK?.();
      if (result !== false && get("modalform") === form) d.close();
    } catch (err) {
      get("formerror").textContent = err.message;
    }
  };
}
export function askForm(
  title,
  content,
  read,
  accept = "Continue",
  beforeSubmit,
) {
  return new Promise((resolve) => {
    const submit = () => {
      const value = read();
      resolve(value);
    };
    const onOK = beforeSubmit
      ? async () => {
          const form = get("modalform");
          if (
            !(await beforeSubmit()) ||
            get("modalform") !== form ||
            !get("dialog").open
          )
            return false;
          submit();
        }
      : submit;
    modal(title, content, onOK, accept);
    const d = get("dialog");
    d.oncancel = () => resolve(null);
    get("closeDialog").onclick = () => {
      resolve(null);
      d.close();
    };
  });
}
export const val = (id) => get(id)?.value || "";
