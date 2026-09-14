import { build } from "esbuild";
import {
  cp,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDir = dirname(fileURLToPath(import.meta.url));
const projectDir = resolve(sourceDir, "..");
const outputDir = join(projectDir, "dist-friend");

await rm(outputDir, { recursive: true, force: true });
await mkdir(outputDir, { recursive: true });

await build({
  entryPoints: [join(sourceDir, "friend-entry.tsx")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  minify: true,
  outfile: join(outputDir, "app.js"),
  define: {
    "process.env.NODE_ENV": '"production"',
  },
});

const baseCss = await readFile(join(projectDir, "app/globals.css"), "utf8");
const standaloneCss = baseCss.replace(/^@import "tailwindcss";\s*/u, "");

await writeFile(join(outputDir, "app.css"), standaloneCss, "utf8");
await cp(join(sourceDir, "体验说明.md"), join(outputDir, "GUIDE.md"));
await cp(join(sourceDir, "反馈问题.md"), join(outputDir, "FEEDBACK.md"));

await writeFile(
  join(outputDir, "index.html"),
  `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="按注意力距离组织任务的四层待办交互原型" />
    <title>四层待办 · 朋友体验版</title>
    <link rel="stylesheet" href="./app.css" />
  </head>
  <body>
    <div id="root"></div>
    <script src="./app.js"></script>
  </body>
</html>
`,
  "utf8",
);

await writeFile(
  join(outputDir, "START-HERE.txt"),
  "这是一个完全独立的本地体验包。\\n\\n1. 解压整个文件夹。\\n2. 双击 index.html。\\n3. 不需要安装 Obsidian、Node 或其他软件。\\n4. 所有内容都是演示数据，只保存在当前浏览器。\\n",
  "utf8",
);

console.log(outputDir);
