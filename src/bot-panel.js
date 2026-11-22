// Only window preferences are persisted. Conversation and project data stay separate.
const prefKey = "dv-tutor-window";
let prefs = {};
try {
  prefs = JSON.parse(localStorage.getItem(prefKey)) || {};
} catch {
  /* Start with defaults. */
}
export const isDocked = () => prefs.docked === true && window.innerWidth >= 900;
function save() {
  try {
    localStorage.setItem(prefKey, JSON.stringify(prefs));
  } catch {
    /* Preferences are optional. */
  }
}
export function toggleDock() {
  prefs.docked = !isDocked();
  save();
}
const limit = (n, min, max) => Math.max(min, Math.min(max, n));
export function layoutBot() {
  const panel = document.querySelector("#data-bot.floating");
  if (!panel) return;
  const width = limit(
    prefs.w || 390,
    Math.min(280, innerWidth - 16),
    innerWidth - 16,
  );
  const height = limit(
    prefs.h || 440,
    Math.min(220, innerHeight - 16),
    innerHeight - 16,
  );
  const x = limit(
    prefs.x ?? innerWidth - width - 20,
    8,
    innerWidth - width - 8,
  );
  const y = limit(prefs.y ?? 76, 8, innerHeight - height - 8);
  Object.assign(panel.style, {
    width: width + "px",
    height: height + "px",
    left: x + "px",
    top: y + "px",
  });
}
document.addEventListener("pointerdown", (event) => {
  const handle = event.target.closest("[data-window-handle]");
  const panel = handle?.closest(".floating");
  if (!panel || event.button !== 0 || event.target.closest("button")) return;
  event.preventDefault();
  const start = panel.getBoundingClientRect(),
    dx = event.clientX,
    dy = event.clientY;
  handle.setPointerCapture(event.pointerId);
  const move = (e) => {
    if (e.pointerId !== event.pointerId) return;
    if (handle.dataset.windowHandle === "resize") {
      prefs.w = limit(
        start.width + e.clientX - dx,
        Math.min(280, innerWidth - 16),
        innerWidth - start.left - 8,
      );
      prefs.h = limit(
        start.height + e.clientY - dy,
        Math.min(220, innerHeight - 16),
        innerHeight - start.top - 8,
      );
      prefs.x = start.left;
      prefs.y = start.top;
    } else {
      prefs.x = limit(
        start.left + e.clientX - dx,
        8,
        innerWidth - start.width - 8,
      );
      prefs.y = limit(
        start.top + e.clientY - dy,
        8,
        innerHeight - start.height - 8,
      );
    }
    layoutBot();
  };
  const end = () => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("lostpointercapture", end);
    save();
  };
  handle.addEventListener("pointermove", move);
  handle.addEventListener("lostpointercapture", end);
});
window.addEventListener("resize", layoutBot);
