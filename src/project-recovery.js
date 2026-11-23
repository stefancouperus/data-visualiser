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
export function resumeRecovery(p, entry, position) {
  // Verification may upgrade an older saved project. Initialise the baseline
  // after that upgrade so opening a second tab does not create a second project.
  Object.assign(tracker(p), {
    id: entry.id,
    revision: entry.revision,
    committed: JSON.stringify(p),
    position: JSON.stringify(position),
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
  if (copy.latest?.body === body && copy.latest.position === position)
    return copy.latest;
  if (!copy.latest && copy.committed === body && copy.position === position)
    return null;
  const d = p.datasets.find((d) => d.id === p.active);
  return (copy.latest = {
    id: copy.id,
    revision: copy.revision,
    writer: copy.writer,
    fork: copy.fork,
    seq: ++copy.seq,
    saved: Date.now(),
    body,
    workspace,
    position,
    info: {
      name: p.name,
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
    if (entry.id !== record.id) copy.fork = crypto.randomUUID();
    Object.assign(copy, {
      id: entry.id,
      revision: entry.revision,
      committed: record.body,
      position: record.position,
    });
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
export async function listRecoveries() {
  const db = await openDatabase();
  await restoreJournals();
  return (
    await read(db.transaction("summaries").objectStore("summaries").getAll())
  ).sort((a, b) => b.saved - a.saved);
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
