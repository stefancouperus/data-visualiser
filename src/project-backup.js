import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { fileStem } from "./coded-docx.js";

const projectFile = "project.json";

export const reportFilename = (p) =>
  fileStem(p.name || "Data visualiser", "Data visualiser") +
  " - project report.docx";

export function projectBackup(project, report) {
  const files = {
    [projectFile]: strToU8(JSON.stringify(project)),
    [reportFilename(project)]: [report, { level: 0 }],
  };
  return {
    blob: new Blob([zipSync(files, { level: 1 })], { type: "application/zip" }),
    name:
      fileStem(project.name || "Data visualiser", "Data visualiser") +
      " - project.zip",
  };
}

export async function readProjectFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    // Read just the editable project. The Word file can also be opened independently.
    let files;
    try {
      files = unzipSync(bytes, {
        filter: (entry) => entry.name === projectFile,
      });
      if (files[projectFile]) return JSON.parse(strFromU8(files[projectFile]));
    } catch {
      /* A damaged or unrelated archive cannot supply a saved project. */
    }
    throw Error(
      "This ZIP does not contain a readable Data visualiser project. Choose the ZIP from Download project with data, or its project.json file.",
    );
  }
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw Error(
      "Choose a Data visualiser project backup (.zip) or a saved project (.json). For a survey or transcript, use an upload option.",
    );
  }
}
