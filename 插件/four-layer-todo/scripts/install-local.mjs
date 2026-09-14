import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const target = resolve(
  process.cwd(),
  "../../../../.obsidian/plugins/four-layer-todo",
);

await mkdir(target, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css", "versions.json"]) {
  await copyFile(resolve(process.cwd(), file), resolve(target, file));
}
await copyFile(
  resolve(process.cwd(), "assets/todo-icon.png"),
  resolve(target, "todo-icon.png"),
);

console.log(`Installed four-layer-todo to ${target}`);
