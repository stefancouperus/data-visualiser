import { esc } from "./chart.js";
import { busyIndicator } from "./ui.js";

export function botSession() {
  const token = sessionStorage.getItem("dv-session");
  const expiry = token?.split(".")[1];
  if (expiry && /^\d+$/.test(expiry) && Number(expiry) <= Date.now()) {
    sessionStorage.removeItem("dv-session");
    return null;
  }
  return token;
}

// Some tasks already have an open form with selected files or unsaved choices.
// Keep that form intact behind the prompt so it can resume when access is granted.
export function confirmTaskAccess(title, verify) {
  if (document.querySelector(".course-access[open]"))
    return Promise.resolve(false);
  const previous = document.querySelector("#dialog[open]");
  const originalForm = previous?.firstElementChild;
  const gate = document.createElement("dialog");
  gate.className = "course-access";
  gate.setAttribute("aria-labelledby", "access-title");
  gate.innerHTML = `<form method="dialog">
    <h2 id="access-title">${esc(title)}</h2>
    <div class="dialog-body"><label>Workshop course code<input name="courseCode" type="password" autocomplete="off" autofocus aria-describedby="access-error"></label></div>
    <footer class="dialog-footer"><p id="access-error" role="alert"></p><div class="action-row dialog-actions">
      <button type="submit" class="primary">Confirm code</button><button type="button">Close</button>
    </div></footer></form>`;
  const form = gate.querySelector("form");
  const field = form.elements.namedItem("courseCode");
  const confirm = form.querySelector('[type="submit"]');
  const close = form.querySelector('[type="button"]');
  const error = form.querySelector('[role="alert"]');
  document.body.append(gate);
  if (previous) previous.classList.add("awaiting-course-code");
  return new Promise((resolve) => {
    let finished = false;
    function finish(accepted) {
      if (finished) return;
      finished = true;
      previous?.classList.remove("awaiting-course-code");
      if (gate.open) gate.close();
      gate.remove();
      resolve(
        accepted &&
          (!previous ||
            (previous.open && previous.firstElementChild === originalForm)),
      );
    }
    gate.oncancel = (event) => {
      event.preventDefault();
      finish(false);
    };
    gate.onclose = () => finish(false);
    close.onclick = () => finish(false);
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (confirm.disabled) return;
      const code = field.value.trim();
      if (!code) {
        error.textContent = "Enter your workshop course code.";
        field.setAttribute("aria-invalid", "true");
        field.focus();
        return;
      }
      field.readOnly = true;
      confirm.disabled = true;
      confirm.innerHTML = busyIndicator("Checking code…");
      field.removeAttribute("aria-invalid");
      error.textContent = "";
      try {
        const verified = await verify(code, () => !finished && gate.open);
        finish(verified);
      } catch (err) {
        if (finished) return;
        error.textContent = err.message;
        field.readOnly = false;
        confirm.disabled = false;
        confirm.textContent = "Confirm code";
        field.setAttribute("aria-invalid", "true");
        field.focus();
        field.select();
      }
    };
    gate.showModal();
    field.focus();
  });
}
