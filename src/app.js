import "./style.css";
import { combineTables } from "./combine.js";
import { uid, filteredRows, corpus, texts } from "./import.js";
import { importFiles } from "./import-ui.js";
import {
  fresh,
  verifyProject,
  reattach,
  settingsProject,
  linkage,
} from "./project.js";
import { newView, analyse, allCodes } from "./analysis.js";
import { fitModel } from "./model.js";
import { esc, figure, combinedSVG, exportSVG, blobSave } from "./chart.js";
import {
  icon,
  mark,
  button as b,
  opts,
  table,
  get,
  val,
  notice,
  modal,
  askForm,
  formselect,
} from "./ui.js";
import {
  landing,
  check,
  panel,
  datasetSelect,
  saveScreen,
  available,
} from "./screens.js";
const steps = ["Upload", "Check", "Explore", "Compare", "Save and export"],
  icons = ["upload", "check", "explore", "compare", "save"];
let proposal = null,
  recommend = false;
let undoViews = [],
  project = fresh(),
  step = 0,
  compact = false,
  bot = false,
  history = [],
  requesting = false,
  chosen = new Set(),
  scope = [],
  suggestions = [],
  lastQuestion = "";
const getData = () => project.datasets.find((d) => d.id === project.active);
const resetTutor = () => {
  proposal = null;
  recommend = false;
  history = [];
  chosen.clear();
  scope = [];
  suggestions = [];
  lastQuestion = "";
};
function activate(id) {
  undoViews = [];
  project.active = id;
  const v = newView(getData());
  project.views = [v, structuredClone(v)];
  resetTutor();
}
const modeNames = [
  ["hints", "Contextual hints"],
  ["request", "On request"],
  ["guided", "Guided exploration"],
];
const botURL = (import.meta.env.VITE_BOT_URL || "").replace(/\/$/, "");
function botBox() {
  return `<section class="bot ${step === 3 ? "botbelow" : ""}"><div class="topline"><h2>Data bot</h2>${b("closebot", "Close", "plain")}</div><label>Help mode<select id="mode">${opts(modeNames, project.mode)}</select></label><div class="bar">${b("scope", "What the bot can see")}</div>${!botURL ? "<p>Live help will be available when the workshop service is connected. You can explore, compare and export your data now.</p>" : !sessionStorage.getItem("dv-session") ? '<label>Workshop course code<input id="course" type="password" autocomplete="off"></label>' + b("unlock", "Unlock the bot") : ""}<div class="chatlog">${history.map((t) => `<div class="msg"><strong>${t.role === "user" ? "You" : "Data bot"}</strong><p>${esc(t.content)}</p></div>`).join("")}</div>${requesting ? '<p role="status">Waiting for the university model…</p>' : ""}
 ${proposal ? b("botpreview", "Preview suggested chart") : ""}${suggestions.map((s, i) => `<div class="card"><b>${esc(s.code)}</b><p>“${esc(s.quote)}”</p><small>${esc(s.reason)}</small><div>${b("acceptcode", "Review label", "", 'data-i="' + i + '"')} ${b("dismisscode", "Dismiss", "plain", 'data-i="' + i + '"')}</div></div>`).join("")}
 <label>Ask about your project<textarea id="question" maxlength="4000" placeholder="What is being counted here?">${esc(lastQuestion)}</textarea></label><div class="bar">${b("send", "Send", "primary", requesting || !botURL ? "disabled" : "")}</div></section>`;
}
function render() {
  const d = getData(),
    confirmed = d && project.confirmed.includes(d.id),
    headers = [
      "",
      "Check your upload",
      "Explore your data",
      "Compare two views",
      "Save and export",
    ];
  let content = step === 0 ? landing(!!localStorage.getItem("dv-project")) : "";
  if (step !== 0 && d) {
    content = `<div class="hero"><h1>${headers[step]}</h1></div>${datasetSelect(project)}`;
    if (step === 1)
      content += `<div class="bar">${b("upload", "Add files", "", 'data-route="' + (d.kind === "text" ? "coded" : "table") + '"')}</div>${check(d)}<div class="bar">${b("confirm", "Confirm and explore", "primary")}</div>`;
    else if (step === 2 || step === 3)
      content += `<div class="bar">${step === 2 ? b("compare", "Compare two views", "primary") : b("savecompare", "Save comparison", "primary")}${b("choose", "Help me choose")}${b("finding", "Show a finding")}${step === 3 ? `<label class="tick"><input id="linked" type="checkbox" ${project.linked ? "checked" : ""}>Link filters</label>` : ""}</div>${step === 3 ? '<p class="caption" id="comparisonNote"></p>' : ""}<div class="${step === 3 ? "pair" : ""}">${project.views
        .slice(0, step === 3 ? 2 : 1)
        .map((v, i) => panel(d, v, i))
        .join(
          "",
        )}</div>${step === 3 ? b("askboth", "Compare these views") : ""} ${undoViews.length ? b("undo", "Undo view change", "plain") : ""}<div id="hint"></div>`;
    else content += saveScreen(project);
  }
  const asideBot = bot && step !== 3;
  get("app").innerHTML =
    `<div class="shell ${compact ? "compact" : ""}"><aside class="rail"><div class="brand">${mark}<span>Data<br>visualiser</span></div><nav class="nav" aria-label="Workflow">${steps.map((s, i) => `<button title="${s}" aria-label="${s}" data-act="nav" data-i="${i}" ${step === i ? 'aria-current="step"' : ""} ${(i > 0 && !d) || (i > 1 && !confirmed) ? "disabled" : ""}>${icon(icons[i])}<span>${s}</span></button>`).join("")}</nav><div class="rail-bottom">${b("compact", icon("menu") + "<span>Collapse sidebar</span>", "plain", 'aria-label="Toggle sidebar"')}</div></aside><main class="main" id="workspace"><header class="top"><span>${esc(project.name)} &nbsp; / &nbsp; ${steps[step]}</span>${b("bot", icon("bot") + " Data bot")}</header><div class="content"><div class="${asideBot ? "withbot" : ""}"><div>${content}</div>${asideBot ? botBox() : ""}</div>${bot && step === 3 ? botBox() : ""}</div></main></div>`;
  if (d && (step === 2 || step === 3)) {
    for (let i = 0; i < (step === 3 ? 2 : 1); i++) {
      try {
        draw(i);
      } catch (e) {
        get("graphic" + i).textContent = e.message;
      }
    }
    if (step === 3) {
      const [l, r] = project.views;
      get("comparisonNote").textContent =
        l.filter === r.filter && l.value === r.value
          ? "Both panels use the same record filter. Each figure shows its counts and unit."
          : "The panels use different record filters.";
    }
    const hint =
      project.mode === "guided"
        ? "Compare the unit and denominator in two views of the same selection."
        : project.mode === "hints" &&
            d.kind === "text" &&
            d.passages.some((p) => !p.reviewed)
          ? "Some passages are unreviewed. Check coding coverage before interpreting a frequency."
          : project.mode === "hints" &&
              d.kind === "table" &&
              filteredRows(d).length < 20
            ? "Small sample: inspect the underlying counts alongside percentages."
            : "";
    if (hint) get("hint").innerHTML = `<p class="review">${esc(hint)}</p>`;
  }
}
function summary(i) {
  const d = getData(),
    v = project.views[i];
  if (v.task !== "model") return analyse(d, v);
  const rows = filteredRows(d).filter(
      (r) => !v.filter || r[v.filter] === v.value,
    ),
    m = fitModel(d, rows, { ...v, predictors: v.predictors || [] });
  return {
    ...m,
    title:
      v.title ||
      m.method + " · " + d.fields.find((f) => f.id === v.outcome).label,
    x: m.predictor,
    y: m.event ? "Probability of " + m.event : "Predicted outcome",
    unit: "95% confidence interval",
    note:
      m.n +
      " complete records · " +
      m.excluded +
      " excluded." +
      (m.held ? " Held at " + m.held + "." : "") +
      (m.reference ? " Reference: " + m.reference + "." : ""),
    records: [],
  };
}
function draw(i) {
  const a = summary(i),
    v = project.views[i];
  get("graphic" + i).replaceChildren(figure(a, v));
  if (a.coefficients)
    get("modeldetails" + i).innerHTML =
      "<details><summary>Coefficients and model details</summary>" +
      table(
        ["Term", "Estimate", "95% lower", "95% upper"],
        a.coefficients.map((c) => [
          c.term,
          ...[c.estimate, c.low, c.high].map((x) => x.toPrecision(4)),
        ]),
      ) +
      table(
        ["Model diagnostic", "Value"],
        Object.entries(a.diagnostics).map(([k, x]) => [
          k,
          x == null ? "Undefined" : Number(x.toPrecision(4)),
        ]),
      ) +
      "</details>";
}
function tidy(v, key) {
  const d = getData(),
    fs = d.fields?.filter((f) => f.type !== "metadata") || [];
  if (key === "task") {
    if (v.task === "model") {
      v.chart = "model";
      v.outcome = fs.find((f) => f.type === "number")?.id || v.x;
      v.predictors = [];
    } else {
      v.chart =
        v.task === "group" && d.kind === "text"
          ? "presence"
          : v.task === "two" && d.kind === "table"
            ? "grid"
            : "bars";
      v.y =
        v.task === "one"
          ? ""
          : d.kind === "text"
            ? allCodes(d).find((c) => c !== v.x) || ""
            : fs.find((f) => f.id !== v.x)?.id;
    }
  }
  if (key === "outcome" || key === "task") {
    v.positive = fs.find((f) => f.id === v.outcome)?.levels[0] || "";
    v.predictors = (v.predictors || []).filter((k) => k !== v.outcome);
  }
  if (key === "filter")
    v.value =
      (d.kind === "table"
        ? fs.find((f) => f.id === v.filter)?.levels[0]
        : v.filter === "source"
          ? d.sources[0]
          : Object.values(d.metadata || {}).find((m) => m[v.filter])?.[
              v.filter
            ]) || "";
  if (key === "x" && v.x === v.y)
    v.y =
      d.kind === "text"
        ? allCodes(d).find((c) => c !== v.x)
        : fs.find((f) => f.id !== v.x)?.id;
}
function goto(i) {
  if (
    (i > 0 && !getData()) ||
    (i > 1 && !project.confirmed.includes(project.active))
  )
    return;
  step = i;
  render();
  window.scrollTo(0, 0);
}
function setProject(p) {
  project = verifyProject(p);
  if (!getData() && project.datasets.length) activate(project.datasets[0].id);
  if (getData() && project.views.length !== 2) activate(project.active);
  resetTutor();
  goto(getData() ? (project.confirmed.includes(project.active) ? 2 : 1) : 0);
}
function chooseFiles(accept, multiple, handler) {
  const p = get("picker");
  p.value = "";
  p.accept = accept;
  p.multiple = multiple;
  p.onchange = async () => {
    try {
      if (p.files.length) await handler([...p.files]);
    } catch (e) {
      notice(e.message);
    }
  };
  p.click();
}
function snapshotViews() {
  undoViews.push(structuredClone(project.views));
  if (undoViews.length > 25) undoViews.shift();
}
function openBot(question = "") {
  bot = true;
  lastQuestion = question;
  render();
  get("question")?.focus();
}
function selectedPassages() {
  const d = getData();
  if (d?.kind !== "text") return [];
  return d.passages.filter((p) => chosen.has(p.id) || scope.includes(p.source));
}
function botContext() {
  const d = getData();
  if (!d) return { step: "Upload" };
  const basic = { stage: steps[step], dataset: d.name, unit: d.unit };
  if (step <= 1)
    return {
      ...basic,
      fields: d.fields?.map((f) => ({ name: f.label, type: f.type })),
      sourceCount: d.sources?.length,
    };
  const views = Array.from({ length: step >= 3 ? 2 : 1 }, (_, i) => {
    try {
      const a = summary(i);
      return {
        ...a,
        excerpt: undefined,
        points: a.points?.slice(0, 40),
        pointsTotal: a.points?.length,
        records: a.records?.slice(0, 120),
        recordsTotal: a.records?.length,
        settings: project.views[i],
      };
    } catch (e) {
      return { message: e.message };
    }
  });
  return {
    ...basic,
    views,
    fields: d.fields
      ?.filter((f) => f.type !== "metadata")
      .map((f) => ({ id: f.id, name: f.label, type: f.type })),
    codebook: d.kind === "text" ? allCodes(d) : undefined,
    passages: selectedPassages().map((p) => ({
      id: p.id,
      source: p.source,
      text: p.text,
      codes: p.codes,
    })),
  };
}
async function ask(question, skill) {
  if (requesting) throw Error("A tutor request is already pending.");
  if (!botURL)
    throw Error("The workshop tutor service has not been connected.");
  if (!sessionStorage.getItem("dv-session")) {
    openBot(question);
    throw Error("Enter the workshop course code first.");
  }
  const context = botContext();
  if (JSON.stringify(context).length > 115000)
    throw Error("Choose fewer sources or passages for the bot.");
  const previous = history.slice(-4),
    activeId = project.active;
  lastQuestion = "";
  requesting = true;
  history.push({ role: "user", content: question });
  render();
  try {
    const res = await fetch(botURL + "/ask", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + sessionStorage.getItem("dv-session"),
      },
      body: JSON.stringify({
        question,
        skill,
        mode: project.mode,
        context,
        history: previous,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (res.status === 401) sessionStorage.removeItem("dv-session");
      throw Error(data.error || "Tutor unavailable.");
    }
    if (project.active !== activeId) return;
    if (skill === "coding") {
      const clean = data.answer
        .trim()
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();
      const proposed = JSON.parse(clean).suggestions;
      if (!Array.isArray(proposed))
        throw Error("No readable coding suggestions returned.");
      const sources = new Map(context.passages.map((p) => [p.id, p.text]));
      suggestions = proposed.filter(
        (p) =>
          typeof p.code === "string" &&
          p.quote &&
          sources.get(p.id)?.includes(p.quote),
      );
      history.push({
        role: "assistant",
        content:
          suggestions.length +
          " evidence-linked suggestions are ready for review.",
      });
    } else if (skill === "recommend") {
      let pick;
      try {
        pick = JSON.parse(
          data.answer
            .trim()
            .replace(/^\x60\x60\x60(?:json)?/i, "")
            .replace(/\x60\x60\x60$/, "")
            .trim(),
        );
      } catch {
        pick = { explanation: data.answer };
      }
      const d = getData(),
        keys =
          d.kind === "text"
            ? allCodes(d)
            : d.fields.filter((f) => f.type !== "metadata").map((f) => f.id);
      history.push({
        role: "assistant",
        content: String(
          pick.explanation || "Choose a field or code to preview.",
        ),
      });
      if (
        ["one", "group", "two"].includes(pick.task) &&
        keys.includes(pick.x) &&
        (pick.task === "one" ||
          (d.kind === "text" && pick.task === "group") ||
          (keys.includes(pick.y) && pick.y !== pick.x))
      ) {
        const v = {
          ...newView(d),
          task: pick.task,
          x: pick.x,
          y: pick.task === "one" ? "" : pick.y,
          chart: pick.chart,
          measure: pick.measure,
        };
        if (available(d, v).includes(v.chart)) proposal = v;
      }
      recommend = false;
    } else history.push({ role: "assistant", content: data.answer });
  } finally {
    requesting = false;
    render();
  }
}
function download(p, name) {
  blobSave(new Blob([JSON.stringify(p)], { type: "application/json" }), name);
}

async function reviewAction(act, d, el) {
  const fields = d.fields || [],
    fl = fields.map((f) => [f.id, f.label]);
  if (act === "combinetables") {
    const other = project.datasets.filter(
      (t) => t.kind === "table" && t.id !== d.id,
    );
    if (!other.length)
      throw Error(
        "Import the second table first. Both files will appear in Current dataset.",
      );
    const id = await askForm(
      "Choose a table",
      formselect(
        "second",
        "Related table",
        other.map((t) => [t.id, t.name]),
      ),
      () => val("second"),
    );
    if (!id) return;
    const t = other.find((t) => t.id === id);
    const config = await askForm(
      "Combine records or columns",
      formselect("combineHow", "Method", [
        ["append", "Append records with the same columns"],
        ["join", "Add columns using a shared identifier"],
      ]) +
        formselect("key1", "Identifier in current table (for a join)", fl) +
        formselect(
          "key2",
          "Identifier in related table (for a join)",
          t.fields.map((f) => [f.id, f.label]),
        ),
      () => combineTables(d, t, val("combineHow"), val("key1"), val("key2")),
      "Preview",
    );
    if (!config) return;
    modal(
      "Review combined table",
      "<p>" +
        config.rows.length +
        " records. " +
        (config.matchCount != null
          ? config.matchCount +
            " matched; unmatched records keep blank values for the new fields."
          : "Both original tables will remain available.") +
        "</p>" +
        table(
          config.fields.map((f) => f.label),
          config.rows.slice(0, 8).map((r) => config.fields.map((f) => r[f.id])),
        ),
      () => {
        project.datasets.push(config);
        activate(config.id);
        goto(1);
      },
      "Keep combined table",
    );
    return;
  }
  if (act === "field") {
    const f = fields.find((x) => x.id === el.dataset.field);
    modal(
      "Review field",
      `<label>Question or chart label<input id="flabel" value="${esc(f.label)}" required></label>${formselect("ftype", "Data type", ["category", "ordered", "number", "multiple", "date", "text", "metadata"], f.type)}<label>Ordered categories (one per line)<textarea id="levels">${esc(f.levels.join("\n"))}</textarea></label><label>Multiple-answer separator<input id="fsep" value="${esc(f.separator || ";")}"></label>`,
      () => {
        const list = val("levels")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (
          val("ftype") === "ordered" &&
          f.levels.some((l) => !list.includes(l))
        )
          throw Error("Keep observed categories in the ordered list.");
        Object.assign(f, {
          label: val("flabel"),
          type: val("ftype"),
          levels: list,
          separator: val("fsep"),
        });
        render();
      },
    );
    return;
  }
  if (act === "unit") {
    modal(
      "What does one row represent?",
      `<label>Unit<input id="unit" required value="${esc(d.unit)}"></label>`,
      () => {
        d.unit = val("unit");
        render();
      },
    );
    return;
  }
  if (act === "exclude") {
    modal(
      "Exclude matching records",
      formselect("excludeField", "Field", fl) +
        `<label>Exact value<input id="excludeValue"></label>`,
      () => {
        const rule = { field: val("excludeField"), value: val("excludeValue") };
        if (!d.rows.some((r) => r[rule.field] === rule.value))
          throw Error("No records have that value.");
        d.rules.push(rule);
        render();
      },
    );
    return;
  }
  if (act === "delrule") {
    d.rules.splice(+el.dataset.i, 1);
    render();
    return;
  }
  if (act === "sources") {
    modal(
      "Confirm the full source list",
      `<p>Include sources with no coded passages.</p><label>One source per line<textarea id="sourceList">${esc(d.sources.join("\n"))}</textarea></label>`,
      () => {
        const list = val("sourceList")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (d.passages.some((p) => !list.includes(p.source)))
          throw Error("Keep each source that has imported text.");
        d.sources = [...new Set(list)];
        render();
      },
    );
    return;
  }
  if (act === "renamecode") {
    modal(
      "Rename or merge an existing code",
      formselect("oldcode", "Existing code", allCodes(d)) +
        `<label>New or existing label<input id="newcode" required></label>`,
      () => {
        const old = val("oldcode"),
          name = val("newcode").trim();
        if (!name) throw Error("Enter a label.");
        d.passages.forEach(
          (p) =>
            (p.codes = [
              ...new Set(p.codes.map((c) => (c === old ? name : c))),
            ]),
        );
        project.views.forEach((v) => {
          if (v.x === old) v.x = name;
          if (v.y === old) v.y = name;
        });
        render();
      },
    );
    return;
  }
  if (act === "tocorpus") {
    modal(
      "Use written survey answers",
      formselect("textcol", "Written answer", fl) +
        formselect("idcol", "Identify respondents with", [
          ["", "Original row number"],
          ...fl,
        ]),
      () => {
        const key = val("textcol"),
          id = val("idcol");
        const ids = d.rows.map((r, i) => (id ? r[id] : "Record " + (i + 1)));
        if (ids.some((x) => !x) || new Set(ids).size !== ids.length)
          throw Error(
            "Choose a unique, complete identifier or use row numbers.",
          );
        const passages = [],
          meta = {};
        d.rows.forEach((r, i) => {
          if (r[key]) passages.push(...texts(ids[i], [r[key]]));
          meta[ids[i]] = Object.fromEntries(
            fields
              .filter((f) => f.id !== key && f.type !== "metadata")
              .map((f) => [f.label, r[f.id]]),
          );
        });
        const c = corpus(
          d.name + " · " + fields.find((f) => f.id === key).label,
          passages,
          ids,
        );
        c.metadata = meta;
        project.datasets.push(c);
        activate(c.id);
        goto(1);
      },
    );
    return;
  }
  if (act === "multi") {
    modal(
      "Combine select-all-that-apply columns",
      `<label>Question label<input id="multiTitle" required></label><p>Choose one column for each possible answer. A non-empty value marks a selection. Set the unselected value if your export uses one.</p><label>Unselected value<input id="emptyVal" value="0"></label>` +
        fields
          .map(
            (f) =>
              `<label class="tick"><input name="mf" type="checkbox" value="${f.id}">${esc(f.label)}</label>`,
          )
          .join(""),
      () => {
        const items = fields.filter((f) =>
          document.querySelector(`input[name=mf][value="${f.id}"]:checked`),
        );
        if (items.length < 2)
          throw Error("Choose at least two answer columns.");
        const id = "m" + uid(),
          label = val("multiTitle");
        d.fields.push({
          id,
          label,
          raw: label,
          type: "multiple",
          levels: items.map((f) => f.label),
          separator: " | ",
        });
        d.rows.forEach(
          (r) =>
            (r[id] = items
              .filter((f) => r[f.id] && r[f.id] !== val("emptyVal"))
              .map((f) => f.label)
              .join(" | ")),
        );
        render();
      },
    );
    return;
  }
  if (act === "link") {
    const tables = project.datasets.filter((x) => x.kind === "table");
    if (!tables.length)
      throw Error(
        "Upload the metadata table first, then return to this collection in Check.",
      );
    const tid = await askForm(
      "Choose related table",
      formselect(
        "lt",
        "Metadata table",
        tables.map((t) => [t.id, t.name]),
      ),
      () => val("lt"),
    );
    if (!tid) return;
    const t = tables.find((x) => x.id === tid);
    const key = await askForm(
      "Choose a unique identifier",
      formselect(
        "key",
        "Identifier column",
        t.fields.map((f) => [f.id, f.label]),
      ),
      () => val("key"),
    );
    if (!key) return;
    modal(
      "Review source matches",
      `<p>Leave a source unmatched to keep it available for separate exploration.</p>` +
        d.sources
          .map((s, i) =>
            formselect(
              "map" + i,
              s,
              [
                ["", "Unmatched"],
                ...[...new Set(t.rows.map((r) => r[key]).filter(Boolean))],
              ],
              s,
            ),
          )
          .join(""),
      () => {
        const m = Object.fromEntries(
          d.sources.map((s, i) => [s, val("map" + i)]),
        );
        const joined = linkage(d, t, key, m);
        d.metadata = { ...d.metadata, ...joined };
        render();
        notice(Object.keys(joined).length + " sources linked.");
      },
    );
    return;
  }
}
function evidence(i, match) {
  const d = getData(),
    v = project.views[i],
    isText = d.kind === "text";
  if (!isText) {
    const rows = filteredRows(d).filter(
      (r) =>
        (!v.filter || r[v.filter] === v.value) &&
        (!match ||
          (r[v.x] === match.code && (!v.y || r[v.y] === match.source))),
    );
    const fields = d.fields.filter((f) => f.type !== "metadata");
    modal(
      "Underlying responses",
      `<p>${rows.length} records in selection. Showing the first 200.</p>` +
        table(
          fields.map((f) => f.label),
          rows.slice(0, 200).map((r) => fields.map((f) => r[f.id])),
        ),
      null,
      "Done",
    );
    return;
  }
  const ps = d.passages.filter(
    (p) =>
      (!v.filter ||
        (v.filter === "source"
          ? p.source
          : d.metadata?.[p.source]?.[v.filter]) === v.value) &&
      (!match || (p.source === match.source && p.codes.includes(match.code))) &&
      (!v.query || p.text.toLowerCase().includes(v.query.toLowerCase())),
  );
  let page = 0,
    query = "";
  const selected = new Set();
  function list() {
    const filtered = ps.filter(
      (p) => !query || p.text.toLowerCase().includes(query),
    );
    return (
      `<p>${filtered.length} matching passages</p>` +
      filtered
        .slice(page * 25, (page + 1) * 25)
        .map(
          (p) =>
            `<div class="excerpt"><label class="tick"><input name="pickp" type="checkbox" value="${p.id}" ${selected.has(p.id) ? "checked" : ""}>${esc(p.source)}</label><span data-passage-text="${p.id}">${esc(p.text)}</span><br><small>${esc(p.codes.join(" · "))}</small></div>`,
        )
        .join("") +
      `<div class="bar"><button type="button" id="prevp" ${page ? "" : "disabled"}>Previous</button><button type="button" id="nextp" ${(page + 1) * 25 < filtered.length ? "" : "disabled"}>Next</button></div>`
    );
  }
  modal(
    "Read and code passages",
    `<label>Find a passage<input id="searchPass"></label><div id="passlist">${list()}</div><button type="button" id="shortpass">Use highlighted words as a passage</button><label>Code to apply<input id="applycode" list="knowncodes"></label><datalist id="knowncodes">${opts(allCodes(d), "")}</datalist><div class="bar"><button type="button" id="suggestpass">Suggest codes for selected passages</button></div>`,
    () => {
      if (!selected.size) throw Error("Choose one or more passages.");
      const code = val("applycode").trim();
      for (const p of d.passages.filter((p) => selected.has(p.id))) {
        if (code && !p.codes.includes(code)) p.codes.push(code);
        p.reviewed = true;
      }
      render();
    },
    "Mark reviewed / apply code",
  );
  const refresh = () => {
    get("passlist").innerHTML = list();
    get("prevp").onclick = () => {
      page--;
      refresh();
    };
    get("nextp").onclick = () => {
      page++;
      refresh();
    };
    get("passlist").onchange = (e) => {
      if (e.target.name === "pickp") {
        if (e.target.checked) selected.add(e.target.value);
        else selected.delete(e.target.value);
      }
    };
  };
  refresh();
  get("searchPass").oninput = (e) => {
    query = e.target.value.toLowerCase();
    page = 0;
    refresh();
  };
  get("shortpass").onmousedown = (e) => e.preventDefault();
  get("shortpass").onclick = () => {
    const selection = window.getSelection();
    if (!selection.rangeCount || selection.isCollapsed) {
      get("formerror").textContent = "Select words within one passage first.";
      return;
    }
    const r = selection.getRangeAt(0),
      anchor = r.startContainer.parentElement?.closest("[data-passage-text]"),
      end = r.endContainer.parentElement?.closest("[data-passage-text]");
    if (!anchor || anchor !== end) {
      get("formerror").textContent = "Select words within a single passage.";
      return;
    }
    const original = d.passages.find(
      (p) => p.id === anchor.dataset.passageText,
    );
    const range = r.cloneRange();
    range.selectNodeContents(anchor);
    range.setEnd(r.startContainer, r.startOffset);
    const start = range.toString().length,
      quote = selection.toString();
    if (!quote.trim()) return;
    let p = d.passages.find(
      (p) => p.parent === original.id && p.start === start && p.text === quote,
    );
    if (!p) {
      p = {
        id: uid(),
        source: original.source,
        parent: original.id,
        start,
        text: quote,
        codes: [],
        reviewed: false,
      };
      d.passages.push(p);
      ps.unshift(p);
    }
    selected.clear();
    selected.add(p.id);
    page = 0;
    query = "";
    get("searchPass").value = "";
    refresh();
    get("formerror").textContent =
      "Shorter passage selected. You can apply a code or request suggestions.";
  };
  get("suggestpass").onclick = async () => {
    if (!selected.size || selected.size > 10) {
      get("formerror").textContent = "Choose 1–10 passages for a batch.";
      return;
    }
    chosen = selected;
    scope = [];
    get("dialog").close();
    openBot("Suggest codes for the selected passages.");
    try {
      await ask(lastQuestion, "coding");
    } catch (e) {
      notice(e.message);
    }
  };
}
const reviewActs = [
  "combinetables",
  "field",
  "exclude",
  "delrule",
  "unit",
  "sources",
  "renamecode",
  "link",
  "multi",
  "tocorpus",
];
async function action(act, el) {
  const d = getData(),
    i = Number(el.dataset.i || 0);
  if (reviewActs.includes(act)) return reviewAction(act, d, el);
  switch (act) {
    case "original": {
      const names = Object.keys(d.originals || {});
      modal(
        "Original transcript",
        formselect("origSource", "Source", names) +
          '<div class="excerpt" id="origText"></div>',
        null,
        "Done",
      );
      const show = () =>
        (get("origText").textContent = d.originals[val("origSource")] || "");
      get("origSource").onchange = show;
      show();
      return;
    }
    case "nav":
      goto(i);
      return;
    case "undo":
      if (!undoViews.length) throw Error("There are no view changes to undo.");
      project.views = undoViews.pop();
      break;
    case "resetview":
      snapshotViews();
      project.views[i] = newView(d);
      break;
    case "compact":
      compact = !compact;
      break;
    case "upload": {
      const route = el.dataset.route;
      let help =
        route === "survey"
          ? "Export a Qualtrics CSV with answer labels. Keep the original headers. Split multiple-answer columns when available."
          : route === "coded"
            ? "Choose your Word documents, coded spreadsheet, or Taguette all-highlights export. For Taguette select Highlights → See all highlights → Export this view."
            : "Choose files from your computer.";
      modal(
        "Upload " +
          (route === "survey"
            ? "a Qualtrics export"
            : route === "coded"
              ? "coded material"
              : "your data"),
        `<p>${help}</p>`,
        () => {
          chooseFiles(
            route === "survey" || route === "table"
              ? ".csv,.tsv,.xlsx"
              : ".docx,.txt,.csv,.tsv,.xlsx",
            true,
            async (files) => {
              const datasets = await importFiles(files, route);
              if (!datasets?.length) return;
              project.datasets.push(...datasets);
              if (project.name === "Untitled project")
                project.name = files[0].name.replace(/\.[^.]+$/, "");
              activate(datasets[0].id);
              goto(1);
            },
          );
        },
        "Choose files",
      );
      return;
    }
    case "confirm":
      if (!project.confirmed.includes(d.id)) {
        project.confirmed.push(d.id);
        activate(d.id);
      }
      goto(2);
      return;
    case "compare":
      project.views[1] = structuredClone(project.views[0]);
      project.views[1].chart =
        project.views[0].chart === "bars" ? "dots" : project.views[0].chart;
      goto(3);
      return;
    case "passages":
    case "answers":
      evidence(i);
      return;
    case "closebot":
      bot = false;
      break;
    case "bot":
      bot = !bot;
      break;
    case "botpreview": {
      if (!proposal) return;
      modal(
        "Preview suggested chart",
        '<div class="graphic" id="suggestedFig"></div>',
        () => {
          snapshotViews();
          project.views[step === 3 ? 1 : 0] = proposal;
          proposal = null;
          goto(step === 3 ? 3 : 2);
        },
        "Use this view",
      );
      get("suggestedFig").append(figure(analyse(d, proposal), proposal));
      return;
    }
    case "choose":
      recommend = true;
      openBot("Which view would help me explore these variables or codes?");
      return;
    case "finding":
      recommend = true;
      openBot("I would like to show this finding: ");
      return;
    case "caption":
      openBot("Suggest a concise caption for these figures.");
      return;
    case "askview":
      openBot(
        "What am I seeing in the " +
          (i ? "right" : "left") +
          " view, and what is counted?",
      );
      return;
    case "askboth":
      openBot("Compare these two views. What is easier to see in each?");
      return;
    case "scope": {
      const c = botContext();
      modal(
        "What the bot can see",
        `<p>The current question, recent conversation and the following project context accompany your request.</p><details><summary>Inspect current context</summary><pre style="white-space:pre-wrap">${esc(JSON.stringify(c, null, 2))}</pre></details>` +
          (d?.kind === "text"
            ? "<p>Also include these named sources</p>" +
              d.sources
                .map(
                  (s, j) =>
                    `<label class="tick"><input name="scope" type="checkbox" value="${j}" ${scope.includes(s) ? "checked" : ""}>${esc(s)}</label>`,
                )
                .join("")
            : ""),
        () => {
          if (d?.kind === "text")
            scope = d.sources.filter((s, j) =>
              document.querySelector(`input[name=scope][value="${j}"]:checked`),
            );
          render();
        },
      );
      return;
    }
    case "unlock": {
      const res = await fetch(botURL + "/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: val("course") }),
      });
      const json = await res.json();
      if (!res.ok) throw Error(json.error || "Could not unlock the tutor.");
      sessionStorage.setItem("dv-session", json.token);
      break;
    }
    case "send": {
      const q = val("question").trim();
      if (!q) throw Error("Enter a question.");
      await ask(
        q,
        recommend
          ? "recommend"
          : step === 1
            ? "imports"
            : chosen.size && /suggest.*cod/i.test(q)
              ? "coding"
              : project.views.some((v) => v.task === "model")
                ? "regression"
                : "charts",
      );
      return;
    }
    case "dismisscode":
      suggestions.splice(i, 1);
      break;
    case "acceptcode": {
      const s = suggestions[i];
      modal(
        "Review suggested code",
        `<p>${esc(s.quote)}</p><label>Code label<input id="approved" value="${esc(s.code)}" required></label>`,
        () => {
          const p = d.passages.find((p) => p.id === s.id);
          const code = val("approved").trim();
          if (!p || !code)
            throw Error("A matching passage and label are required.");
          if (!p.codes.includes(code)) p.codes.push(code);
          p.reviewed = true;
          suggestions.splice(i, 1);
          render();
        },
      );
      return;
    }
    case "savecompare":
      modal(
        "Save comparison",
        `<label>Name<input id="compname" required></label><label>What does this comparison show?<textarea id="compnote"></textarea></label>`,
        () => {
          project.saved.push({
            name: val("compname"),
            note: val("compnote"),
            dataset: d.id,
            views: structuredClone(project.views),
            linked: project.linked,
          });
          notice("Comparison saved in the project.");
          render();
        },
      );
      return;
    case "loadcomp": {
      const s = project.saved[i];
      activate(s.dataset);
      project.views = structuredClone(s.views);
      project.linked = s.linked;
      goto(3);
      return;
    }
    case "dupcomp": {
      const s = structuredClone(project.saved[i]);
      s.name += " (copy)";
      project.saved.push(s);
      break;
    }
    case "device":
      localStorage.setItem("dv-project", JSON.stringify(project));
      notice("Saved on this device.");
      return;
    case "deviceOpen":
      setProject(JSON.parse(localStorage.getItem("dv-project")));
      return;
    case "download":
    case "settings":
      download(
        act === "settings" ? settingsProject(project) : project,
        act === "settings"
          ? "visualiser-settings.json"
          : "visualiser-project.json",
      );
      return;
    case "open":
      chooseFiles(".json", false, async (files) => {
        const v = verifyProject(JSON.parse(await files[0].text()));
        setProject(v.settingsOnly ? reattach(v, project.datasets) : v);
      });
      return;
    case "previewexport":
    case "svg":
    case "png":
    case "copyfig": {
      const indices =
          val("panels") === "both"
            ? [0, 1]
            : [val("panels") === "left" ? 0 : 1],
        out = combinedSVG(
          indices.map((k) =>
            figure(summary(k), project.views[k], {
              width: Number(val("preset")),
            }),
          ),
          val("layout"),
        );
      if (act === "previewexport") {
        modal(
          "Figure preview",
          '<div class="graphic" id="previewFigure"></div>',
          null,
          "Done",
        );
        get("previewFigure").append(out);
      } else await exportSVG(out, act === "copyfig" ? "copy" : act);
      return;
    }
  }
  render();
}
document.addEventListener("click", async (e) => {
  const el = e.target.closest("[data-act]");
  try {
    if (el) {
      await action(el.dataset.act, el);
      return;
    }
    const cell = e.target.closest("[data-code]");
    if (cell)
      evidence(Number(cell.closest("[data-panel]").dataset.panel), {
        code: cell.dataset.code,
        source: cell.dataset.source,
      });
  } catch (err) {
    notice(err.message);
  }
});
document.addEventListener("change", (e) => {
  const t = e.target;
  if (t.id === "dataset") {
    activate(t.value);
    goto(project.confirmed.includes(t.value) ? step : 1);
    return;
  }
  if (t.id === "mode") {
    project.mode = t.value;
    render();
    return;
  }
  if (t.id === "linked") {
    project.linked = t.checked;
    if (project.linked)
      Object.assign(project.views[1], {
        filter: project.views[0].filter,
        value: project.views[0].value,
      });
    render();
    return;
  }
  const box = t.closest("[data-panel]");
  if (!box) return;
  snapshotViews();
  const i = Number(box.dataset.panel),
    v = project.views[i];
  if (t.hasAttribute("data-predictor")) {
    v.predictors = [...box.querySelectorAll("[data-predictor]:checked")].map(
      (el) => el.dataset.predictor,
    );
  } else if (t.hasAttribute("data-interaction")) v.interaction = t.checked;
  else if (t.dataset.key) {
    v[t.dataset.key] = t.value;
    tidy(v, t.dataset.key);
    if (
      step === 3 &&
      project.linked &&
      ["filter", "value"].includes(t.dataset.key)
    )
      Object.assign(project.views[1 - i], { filter: v.filter, value: v.value });
  } else return;
  render();
});
render();
