// Browsers expose paths relative to the folder a student chose. Keep subfolder
// names only when two interviews would otherwise receive the same identifier.
export function transcriptFolder(input) {
  const files = input
    .filter((file) => {
      const path = file.webkitRelativePath || file.name;
      return (
        /\.(docx|txt)$/i.test(file.name) &&
        !path
          .split("/")
          .some((part) => part.startsWith(".") || part.startsWith("~$"))
      );
    })
    .sort((a, b) =>
      (a.webkitRelativePath || a.name).localeCompare(
        b.webkitRelativePath || b.name,
      ),
    );
  if (!files.length)
    throw Error(
      "This folder has no Word (.docx) or text (.txt) transcripts. For spreadsheets, use Upload coded interviews.",
    );
  const counts = new Map();
  for (const f of files) counts.set(f.name, (counts.get(f.name) || 0) + 1);
  return {
    name: files[0].webkitRelativePath?.split("/")[0] || "Interviews",
    files: files.map((file) => {
      if (counts.get(file.name) === 1) return file;
      const path = file.webkitRelativePath?.split("/").slice(1).join("/");
      return path
        ? new File([file], path, {
            type: file.type,
            lastModified: file.lastModified,
          })
        : file;
    }),
    skipped: input.length - files.length,
  };
}
