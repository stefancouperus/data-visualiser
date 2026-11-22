// Recovery copies are independent of the student's explicitly saved device copy.
import { projectPackage } from "./tutor-history.js";

const copies = new WeakMap();
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
export async function listCodingCopies() {
  const db = await openDatabase();
  return (
    await read(db.transaction("summaries").objectStore("summaries").getAll())
  ).sort((a, b) => b.saved - a.saved);
}
export async function loadCodingCopy(id) {
  const db = await openDatabase();
  const tx = db.transaction(["projects", "summaries"]);
  const [project, summary] = await Promise.all([
    read(tx.objectStore("projects").get(id)),
    read(tx.objectStore("summaries").get(id)),
  ]);
  if (!project || !summary)
    throw Error("This recovery copy is no longer available.");
  return { project, summary };
}
export function useCodingCopy(project, summary) {
  copies.set(project, { id: summary.id, revision: summary.revision });
}
export async function removeCodingCopy(id) {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(["projects", "summaries"], "readwrite");
    tx.oncomplete = resolve;
    tx.onabort = () => reject(tx.error);
    tx.objectStore("projects").delete(id);
    tx.objectStore("summaries").delete(id);
  });
}
export async function saveCodingCopy(project, source) {
  let copy = copies.get(project);
  if (!copy) {
    copy = { id: crypto.randomUUID(), revision: 0 };
    copies.set(project, copy);
  }
  // Serialise writes from this tab. Separate tabs claiming the same revision
  // fork on conflict inside the transaction instead of overwriting each other.
  async function write() {
    const db = await openDatabase();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(["projects", "summaries"], "readwrite");
      const summaries = tx.objectStore("summaries");
      let id = copy.id,
        revision = copy.revision + 1;
      tx.oncomplete = () => {
        Object.assign(copy, { id, revision });
        resolve();
      };
      tx.onabort = () =>
        reject(tx.error || Error("Local recovery storage is unavailable."));
      const existing = summaries.get(id);
      existing.onsuccess = () => {
        if ((existing.result?.revision || 0) !== copy.revision) {
          id = crypto.randomUUID();
          revision = 1;
        }
        summaries.put(
          { id, revision, name: project.name, source, saved: Date.now() },
          id,
        );
        tx.objectStore("projects").put(projectPackage(project), id);
      };
    });
  }
  const next = (copy.pending || Promise.resolve()).then(write);
  copy.pending = next.catch(() => {});
  return next;
}
