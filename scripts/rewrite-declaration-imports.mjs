import {
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { fileURLToPath } from "node:url";

const distRoot = fileURLToPath(new URL("../dist/", import.meta.url));

function declarationFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = `${directory}/${entry.name}`;
    return entry.isDirectory()
      ? declarationFiles(path)
      : path.endsWith(".d.ts")
        ? [path]
        : [];
  });
}

for (const path of declarationFiles(distRoot)) {
  const source = readFileSync(path, "utf8");
  const rewritten = source.replace(
    /((?:from\s+|import\s*\()["'][.]{1,2}\/[^"']+)\.ts(["'])/g,
    "$1.js$2",
  );
  if (rewritten !== source) {
    writeFileSync(path, rewritten, "utf8");
  }
}
