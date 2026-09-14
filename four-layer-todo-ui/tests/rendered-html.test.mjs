import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the four-layer todo workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(
    html,
    /<title>四层待办 · 让完整任务库退到注意力之后<\/title>/i,
  );
  assert.match(html, /四层待办/);
  assert.match(html, /朋友体验版 · 约 5 分钟/);
  assert.match(html, /开始体验/);
  assert.match(html, /白板/);
  assert.match(html, /翻到背面/);
  assert.match(html, /创建待办/);
  assert.match(html, /链接笔记/);
  assert.doesNotMatch(
    html,
    /数学拓扑学|拓扑学导论|形式系统如何指向现实|可建模性实验室|音素机/,
  );
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});

test("implements selectable task destinations without layer labels", async () => {
  const source = await readFile(
    new URL("../app/TodoWorkspace.tsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /移动到哪里？/);
  assert.match(source, /缓存工作台/);
  assert.match(source, /添加任务池/);
  assert.match(source, /查看关联任务/);
  assert.match(source, /3–4 后台/);
  assert.doesNotMatch(source, /第三层|第四层|第三与第四层|提到工作台/);
});
