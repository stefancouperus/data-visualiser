import { projectMethods } from "./project-method.js";
// Keep the original database name so interview drafts from earlier releases remain available.
// A local resume restores the conversation. Its inclusion in shared downloads is optional.

const copies = new WeakMap();
const prefix = "dv-autosave-pending-";
let database;
function openDatabase() {
  if (!database) {
    database = new Promise((resolve, reject) => {
      const request = indexedDB.open("dv-interview-recovery", 1);
      request.onupgradeneeded = () => {
        for (const name of ["projects", "summaries"])
          request.result.createObjectStore(name);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      database = undefined;
      throw error;
    });
  }
  return database;
}
function read(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onabort = () =>
      reject(tx.error || Error("Local storage is unavailable."));
  });
}
function tracker(project) {
  if (!copies.has(project))
    copies.set(project, {
      id: crypto.randomUUID(),
      writer: crypto.randomUUID(),
      fork: crypto.randomUUID(),
      revision: 0,
      seq: 0,
      pending: Promise.resolve(),
    });
  return copies.get(project);
}
export const recoveryId = (p) => tracker(p).id;
// Requesting a backup hides this version from the in-workspace project picker.
// Home lists every device copy, including these and those from earlier releases.
export function downloadedContent(p) {
  return JSON.stringify({
    ...p,
    mode: undefined,
    figurePanels: undefined,
    comparisonStarted: undefined,
    puzzleSkipped: undefined,
    datasets: p.datasets.map((d) =>
      d.interviews
        ? {
            ...d,
            interviews: {
              ...d.interviews,
              source: undefined,
              passage: undefined,
            },
          }
        : d,
    ),
  });
}
export function preserveDownloadAcrossNavigation(p, change) {
  const copy = copies.get(p);
  const before = copy && JSON.stringify(p);
  const sameWork =
    copy && (before === copy.committed || before === copy.navigationBody);
  const archived =
    copy?.downloaded != null && copy.downloaded === downloadedContent(p);
  change();
  if (sameWork) copy.navigationBody = JSON.stringify(p);
  if (archived) copy.downloaded = downloadedContent(p);
}
export function archiveDownload(p, workspace, exported) {
  tracker(p).downloaded = exported;
  return saveRecovery(p, workspace);
}
export function isDownloaded(p) {
  const copy = copies.get(p);
  return copy?.downloaded != null && copy.downloaded === downloadedContent(p);
}
export function keepInRecents(p) {
  const copy = tracker(p);
  copy.downloaded = undefined;
  copy.pin = true;
}
export function resumeRecovery(p, entry, position) {
  // Verification may upgrade an older saved project. Initialise the baseline
  // after that upgrade so opening a second tab does not create a second project.
  Object.assign(tracker(p), {
    id: entry.id,
    revision: entry.revision,
    committed: JSON.stringify(p),
    position: JSON.stringify(position),
    hidden: !!entry.hidden,
    downloaded: entry.hidden ? downloadedContent(p) : undefined,
  });
}
async function commit(record) {
  const db = await openDatabase();
  const tx = db.transaction(["projects", "summaries"], "readwrite");
  const complete = transactionDone(tx);
  const summaries = tx.objectStore("summaries");
  let summary;
  const write = (id, previous) => {
    if (previous?.writer === record.writer && previous.seq >= record.seq) {
      summary = previous;
      return;
    }
    summary = {
      ...record.info,
      id,
      revision: (previous?.revision || 0) + 1,
      writer: record.writer,
      seq: record.seq,
      saved: record.saved,
    };
    summaries.put(summary, id);
    tx.objectStore("projects").put(
      { body: record.body, workspace: record.workspace },
      id,
    );
  };
  const found = summaries.get(record.id);
  found.onsuccess = () => {
    const previous = found.result;
    if (
      (previous?.revision || 0) === record.revision ||
      previous?.writer === record.writer
    ) {
      write(record.id, previous);
    } else {
      // Reading in a second tab must not republish work already downloaded
      // in the first, or overwrite a newer archived version with stale data.
      if (previous?.hidden && record.navigationOnly && !record.pin) {
        summary = { ...previous, archivedElsewhere: true };
        return;
      }
      // Two tabs edited the same revision. Keep the second writer's version separately.
      const target =
        record.fork !== record.id ? record.fork : crypto.randomUUID();
      const fork = summaries.get(target);
      fork.onsuccess = () => {
        if (fork.result && fork.result.writer !== record.writer)
          write(crypto.randomUUID(), undefined);
        else write(target, fork.result);
      };
    }
  };
  await complete;
  return summary;
}
function snapshot(p, workspace) {
  const copy = tracker(p);
  const body = JSON.stringify(p),
    position = JSON.stringify(workspace);
  const hidden = isDownloaded(p);
  if (
    copy.latest?.body === body &&
    copy.latest.position === position &&
    !!copy.latest.info.hidden === hidden &&
    (!copy.pin || copy.latest.pin)
  )
    return copy.latest;
  if (
    !copy.latest &&
    copy.committed === body &&
    copy.position === position &&
    !!copy.hidden === hidden &&
    !copy.pin
  )
    return null;
  const d = p.datasets.find((d) => d.id === p.active);
  return (copy.latest = {
    id: copy.id,
    revision: copy.revision,
    writer: copy.writer,
    fork: copy.fork,
    seq: ++copy.seq,
    navigationOnly: body === copy.committed || body === copy.navigationBody,
    pin: !!copy.pin,
    saved: Date.now(),
    body,
    workspace,
    position,
    info: {
      hidden,
      name: p.name,
      methods: projectMethods(p),
      source: d?.interviews?.source || d?.name || "",
      kind:
        d?.interviews ||
        (d?.kind === "text" && (d.coding?.bookDraft || d.coding?.book?.length))
          ? "coding"
          : d?.kind || "project",
    },
  });
}
function clearJournal(record) {
  try {
    const key = prefix + record.writer;
    const current = localStorage.getItem(key);
    if (current && JSON.parse(current).seq <= record.seq)
      localStorage.removeItem(key);
  } catch {
    /* A durable IndexedDB copy is already present. */
  }
}
// On tab close a browser can cancel an outstanding IndexedDB transaction.
// Keep a synchronous fallback just for the last uncommitted change.
export function protectDeparture(p, workspace) {
  if (!p.datasets.length) return true;
  try {
    const record = snapshot(p, workspace);
    if (record)
      localStorage.setItem(prefix + record.writer, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}
export async function saveRecovery(p, workspace, verifyPresence = false) {
  const copy = tracker(p);
  let record = snapshot(p, workspace);
  if (!record && verifyPresence) {
    await copy.pending;
    const db = await openDatabase();
    const present = await read(
      db.transaction("summaries").objectStore("summaries").getKey(copy.id),
    );
    if (!present) {
      copy.committed = undefined;
      record = snapshot(p, workspace);
    }
  }
  if (!record || copy.queued === record) return copy.pending;
  copy.queued = record;
  const save = async () => {
    // Advance the expected revision after any earlier write in this tab.
    record.id = copy.id;
    record.fork = copy.fork;
    record.revision = copy.revision;
    const entry = await commit(record);
    if (entry.archivedElsewhere) {
      // Keep our original revision so subsequent edits fork safely.
      copy.downloaded = downloadedContent(JSON.parse(record.body));
    } else {
      if (entry.id !== record.id) copy.fork = crypto.randomUUID();
      Object.assign(copy, { id: entry.id, revision: entry.revision });
    }
    Object.assign(copy, {
      hidden: !!entry.hidden,
      committed: record.body,
      position: record.position,
    });
    if (record.pin) copy.pin = false;
    if (copy.latest === record) copy.latest = null;
    clearJournal(record);
  };
  copy.pending = copy.pending
    .catch(() => {})
    .then(save)
    .finally(() => {
      if (copy.queued === record) copy.queued = null;
    });
  return copy.pending;
}
async function restoreJournals() {
  let keys;
  try {
    keys = Object.keys(localStorage).filter((key) => key.startsWith(prefix));
  } catch {
    return;
  }
  for (const key of keys) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;
    let record;
    try {
      record = JSON.parse(raw);
    } catch {
      continue;
    }
    if (
      !record?.id ||
      !record.writer ||
      !record.info ||
      typeof record.body !== "string"
    )
      continue;
    await commit(record);
    clearJournal(record);
  }
}
export async function listRecoveries({ includeBackups = false } = {}) {
  const db = await openDatabase();
  await restoreJournals();
  return (
    await read(db.transaction("summaries").objectStore("summaries").getAll())
  )
    .filter((entry) => includeBackups || !entry.hidden)
    .sort((a, b) => b.saved - a.saved);
}
export async function loadRecovery(id) {
  const db = await openDatabase();
  await restoreJournals();
  const tx = db.transaction(["projects", "summaries"]);
  const [stored, entry] = await Promise.all([
    read(tx.objectStore("projects").get(id)),
    read(tx.objectStore("summaries").get(id)),
  ]);
  if (!stored || !entry)
    throw Error("This project is no longer saved in this browser.");
  return {
    project:
      stored.format === "data-visualiser" ? stored : JSON.parse(stored.body),
    workspace: stored.workspace || {},
    entry,
  };
}
export async function removeRecovery(id) {
  const db = await openDatabase();
  const tx = db.transaction(["projects", "summaries"], "readwrite");
  const complete = transactionDone(tx);
  tx.objectStore("projects").delete(id);
  tx.objectStore("summaries").delete(id);
  await complete;
}
