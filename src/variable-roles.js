import { setQuestionRoles } from "./open-answers.js";
import { esc } from "./chart.js";
import { get, modal } from "./ui.js";

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
export function editRoles(d, project, suggest, done) {
  const fields = fieldsFor(d);
  const existing = new Map(confirmedRoles(d).map((f) => [f.id, f.roles]));
  modal(
    "How do these questions fit your project?",
    `
    <label>What do you want to find out?<textarea id="role-focus" maxlength="2000">${esc(project.researchFocus || "")}</textarea></label>
    <label>What might explain the outcome? (optional)<input id="role-idea" maxlength="1000" value="${esc(d.explanation || "")}"></label>
    <p>${roles.map(([, name, meaning]) => "<strong>" + name + "</strong> · " + meaning).join("<br>")}</p>
    ${suggest ? `<div class="role-help">${sessionStorage.getItem("dv-session") ? "" : '<label>Course code for bot suggestions<input id="role-code" type="password"></label>'}<button type="button" id="suggest-roles">Suggest roles from my project</button><p role="status" id="role-status"></p></div>` : ""}
    <p>Tick any roles that fit. A question can have several roles or be left blank.</p>
    <div class="role-list">${fields.map((f) => `<fieldset data-role-field="${esc(f.id)}"><legend>${esc(f.label)}</legend>${roles.map(([r, name]) => `<label class="tick"><input type="checkbox" value="${r}" ${existing.get(f.id)?.includes(r) ? "checked" : ""}>${name}</label>`).join("")}<small class="role-reason"></small></fieldset>`).join("")}</div>`,
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
    status.textContent = "Reading your research question and question labels…";
    const boxes = [...form.querySelectorAll("[data-role-field]")];
    try {
      const result = await suggest(
        {
          focus,
          explanation,
          questions: fields.map(({ id, label, type }) => ({ id, label, type })),
        },
        get("role-code")?.value || "",
      );
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
      status.textContent = added
        ? `Suggestions added for ${added} question(s). Review the ticks, then confirm your choices.`
        : "No additional roles suggested. You can choose roles yourself.";
    } catch (err) {
      status.textContent = err.message;
    } finally {
      trigger.disabled = false;
    }
  };
  get("dialog").querySelector(".role-list").onchange = (e) => {
    const box = e.target.closest("fieldset");
    box.dataset.edited = "true";
    box.querySelector("small").textContent = "";
  };
}
