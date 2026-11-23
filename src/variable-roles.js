import { setQuestionRoles } from "./open-answers.js";
import { esc } from "./chart.js";
import { busyIndicator, get, modal } from "./ui.js";

const roles = [
  ["outcome", "Outcome", "The answer you want to understand."],
  [
    "grouping",
    "Grouping",
    "An answer you use to split respondents into groups.",
  ],
  [
    "explanatory",
    "Explanatory",
    "A question that measures a possible explanation you want to investigate.",
  ],
  [
    "open",
    "Open question",
    "Respondents answer in their own words. You can also tick any of the three roles above.",
  ],
];
const fieldsFor = (d) => d.fields.filter((f) => f.type !== "metadata");
export function confirmedRoles(d) {
  return d.fields
    ?.filter((f) => Array.isArray(f.roles) && f.type !== "metadata")
    .map((f) => ({
      id: f.id,
      label: f.label,
      roles: roles.map(([r]) => r).filter((r) => f.roles.includes(r)),
    }))
    .filter((f) => f.roles.length);
}
export function roleChoices(fields, preferred) {
  const score = (f) => Number(f.roles?.includes(preferred) || false);
  return [...fields]
    .sort((a, b) => score(b) - score(a))
    .map((f) => {
      const labels = roles
        .filter(([r]) => f.roles?.includes(r))
        .map(([, label]) => label);
      return [
        f.id,
        f.label + (labels.length ? " · " + labels.join(" / ") : ""),
      ];
    });
}
export function editRoles(d, project, suggest, done, ensureAccess) {
  const fields = fieldsFor(d);
  const existing = new Map(confirmedRoles(d).map((f) => [f.id, f.roles]));
  const roleNames = (selected) =>
    roles
      .filter(([key]) => selected.includes(key))
      .map(([, name]) => name)
      .join(" · ") || "Unassigned";
  const showRoles = (box) => {
    box.closest("details").querySelector(".role-summary").textContent =
      roleNames(
        [...box.querySelectorAll("input:checked")].map((el) => el.value),
      );
  };
  modal(
    "How do these questions fit your project?",
    `
    <label>What do you want to find out?<textarea id="role-focus" maxlength="2000">${esc(project.researchFocus || "")}</textarea></label>
    <label>What might explain the outcome? (optional)<input id="role-idea" maxlength="1000" value="${esc(d.explanation || "")}"></label>
    <details><summary>What do the four roles mean?</summary><p>${roles.map(([, name, meaning]) => "<strong>" + name + "</strong> · " + meaning).join("<br>")}</p></details>
    ${suggest ? `<div class="role-help"><button type="button" id="suggest-roles">Suggest roles from my project</button><p role="status" id="role-status"></p></div>` : ""}
    <p>Choose a question to edit its roles. Each question can have more than one.</p>
    <div class="role-list">${fields.map((f) => `<details name="question-roles"><summary>${esc(f.label)} <span class="role-summary">${esc(roleNames(existing.get(f.id) || []))}</span></summary><fieldset data-role-field="${esc(f.id)}" aria-label="${esc(f.label)}">${roles.map(([r, name]) => `<label class="tick"><input type="checkbox" value="${r}" ${existing.get(f.id)?.includes(r) ? "checked" : ""}>${name}</label>`).join("")}<small class="role-reason"></small></fieldset></details>`).join("")}</div>`,
    () => {
      project.researchFocus = get("role-focus").value.trim();
      d.explanation = get("role-idea").value.trim();
      for (const f of fields)
        setQuestionRoles(
          f,
          [
            ...get("dialog").querySelectorAll(
              `[data-role-field="${f.id}"] input:checked`,
            ),
          ].map((t) => t.value),
        );
      done();
    },
    "Confirm question roles",
  );
  get("dialog").querySelector(".role-list").onchange = (e) => {
    const box = e.target.closest("fieldset");
    showRoles(box);
    box.dataset.edited = "true";
    box.querySelector("small").textContent = "";
  };
  const trigger = get("suggest-roles");
  if (!trigger) return;
  trigger.onclick = async () => {
    const status = get("role-status"),
      form = get("modalform");
    const focus = get("role-focus").value.trim(),
      explanation = get("role-idea").value.trim();
    if (!focus) {
      status.textContent = "Enter your research question first.";
      get("role-focus").focus();
      return;
    }
    trigger.disabled = true;
    const boxes = [...form.querySelectorAll("[data-role-field]")];
    try {
      if (
        !(await ensureAccess("Suggest roles from my project")) ||
        get("modalform") !== form ||
        !get("dialog").open
      )
        return;
      status.innerHTML = busyIndicator(
        "Suggesting roles for your questions…",
        false,
      );
      const result = await suggest({
        focus,
        explanation,
        questions: fields.map(({ id, label, type }) => ({ id, label, type })),
      });
      if (get("modalform") !== form || !get("dialog").open) return;
      if (
        focus !== get("role-focus").value.trim() ||
        explanation !== get("role-idea").value.trim()
      ) {
        status.textContent =
          "Your project description changed. Ask again for updated suggestions.";
        return;
      }
      if (!Array.isArray(result.suggestions))
        throw Error(
          "The bot did not return a list. Try again or assign roles yourself.",
        );
      let added = 0;
      for (const box of boxes) {
        if (box.dataset.edited) continue;
        const confirmed = existing.get(box.dataset.roleField) || [];
        for (const input of box.querySelectorAll("input"))
          input.checked = confirmed.includes(input.value);
        box.querySelector("small").textContent = "";
        const pick = result.suggestions.find(
          (s) => s?.id === box.dataset.roleField && Array.isArray(s.roles),
        );
        if (!pick) continue;
        const inputs = [...box.querySelectorAll("input")].filter(
          (el) => !el.checked && pick.roles.includes(el.value),
        );
        if (!inputs.length) continue;
        inputs.forEach((el) => {
          el.checked = true;
        });
        box.querySelector("small").textContent =
          "Bot suggestion" +
          (typeof pick.reason === "string" && pick.reason
            ? " · " + pick.reason
            : "");
        added++;
      }
      boxes.forEach(showRoles);
      status.textContent = added
        ? `Suggestions added for ${added} question(s). Review the roles, then confirm your choices.`
        : "No additional roles suggested. You can choose roles yourself.";
    } catch (err) {
      status.textContent = err.message;
    } finally {
      trigger.disabled = false;
    }
  };
}
