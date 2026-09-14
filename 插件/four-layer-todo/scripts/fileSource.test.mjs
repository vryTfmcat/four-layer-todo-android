import assert from "node:assert/strict";
import test from "node:test";
import {
  compareFileSourceOrder,
  findDuplicateTaskIds,
  getFileTaskPlacement,
  parseFileTask,
  parseFileTaskPool,
  resolveCanvasTaskLayout,
  selectNumericShadowCanonicalPath,
  serializeFileTask,
  serializeFileTaskPool,
} from "../src/fileSource.ts";

const root = "00_Inbox/待办";

test("task location is derived only from its directory", () => {
  assert.deepEqual(getFileTaskPlacement(root, `${root}/白板/A.md`), { location: "canvas" });
  assert.deepEqual(getFileTaskPlacement(root, `${root}/缓存工作台/收集箱/A.md`), { location: "inbox" });
  assert.deepEqual(getFileTaskPlacement(root, `${root}/缓存工作台/待办列表/A.md`), { location: "todo" });
  assert.deepEqual(getFileTaskPlacement(root, `${root}/缓存工作台/缓存列表/A.md`), { location: "cache" });
  assert.deepEqual(getFileTaskPlacement(root, `${root}/任务存储器/等待/A.md`), {
    location: "storage",
    poolTitle: "等待",
  });
  assert.equal(getFileTaskPlacement(root, `${root}/归档/2026-08-21/A.md`), null);
});

test("task markdown round-trips only canonical fields", () => {
  const content = serializeFileTask({
    id: "task-1",
    title: "frontmatter must not own this title",
    detail: "正文\n\n[[来源|关联原笔记]]",
    source: "笔记",
    priority: "P4",
    done: true,
    linkedNotePath: "来源.md",
  }, { sortKey: 1200, objectId: "object-1" });

  assert.match(content, /fourLayerTodo: true/);
  assert.doesNotMatch(content, /\ntitle:|\nlocation:|\ncolumnId:|\nx:|\ny:|\ntone:|relatedTaskIds/);
  const parsed = parseFileTask(content, "文件名标题", `${root}/缓存工作台/待办列表/文件名标题.md`);
  assert.equal(parsed?.title, "文件名标题");
  assert.equal(parsed?.detail, "正文");
  assert.equal(parsed?.sortKey, 1200);
  assert.equal(parsed?.objectId, "object-1");
  assert.equal(parsed?.done, true);
});

test("ordinary markdown is excluded from the managed index", () => {
  assert.equal(parseFileTask("---\nid: task-1\n---\n正文", "普通笔记"), null);
});

test("legacy placement fields are readable but never reserialized", () => {
  const parsed = parseFileTask(
    "---\nfourLayerTodo: true\nid: old\nlocation: cache\ncolumnId: old-pool\nx: 12\ny: 20\ntone: blue\n---\n# 旧标题\n\n详情",
    "旧标题",
  );
  assert.equal(parsed?.location, "cache");
  assert.equal(parsed?.columnId, "old-pool");
  const migrated = serializeFileTask(parsed, {
    sortKey: parsed?.sortKey || 1,
    objectId: parsed?.objectId,
  });
  assert.doesNotMatch(migrated, /\nlocation:|\ncolumnId:|\nx:|\ny:|\ntone:/);
});

test("task pool metadata is stored in _任务池.md format", () => {
  const content = serializeFileTaskPool({ hint: "等待条件", tone: "amber", sortKey: 20 });
  assert.deepEqual(parseFileTaskPool(content, { hint: "默认", tone: "green" }), {
    hint: "等待条件",
    tone: "amber",
    sortKey: 20,
  });
});

test("sort keys are stable and titles break ties", () => {
  const items = [
    { sortKey: 20, title: "B" },
    { sortKey: 10, title: "C" },
    { sortKey: 10, title: "A" },
  ].sort(compareFileSourceOrder);
  assert.deepEqual(items.map((item) => item.title), ["A", "C", "B"]);
});

test("active duplicate IDs are isolated while archived history is ignored", () => {
  assert.deepEqual(findDuplicateTaskIds([
    { id: "same", path: "待办/A.md" },
    { id: "same", path: "缓存/B.md" },
    { id: "same", path: "归档/C.md", archived: true },
    { id: "history", path: "归档/D.md", archived: true },
    { id: "history", path: "归档/E.md", archived: true },
  ]), [{ id: "same", paths: ["待办/A.md", "缓存/B.md"] }]);
});

test("same-directory numeric Sync shadows have one deterministic canonical path", () => {
  assert.equal(selectNumericShadowCanonicalPath([
    "待办/任务.md",
    "待办/任务 2.md",
    "待办/任务 3.md",
  ]), "待办/任务.md");
  assert.equal(selectNumericShadowCanonicalPath([
    "待办/任务 2.md",
    "待办/任务 2 2.md",
  ]), "待办/任务 2.md");
  assert.equal(selectNumericShadowCanonicalPath([
    "待办/任务.md",
    "缓存/任务 2.md",
  ]), null);
  assert.equal(selectNumericShadowCanonicalPath([
    "待办/A.md",
    "待办/B.md",
  ]), null);
});

test("missing Canvas nodes get deterministic fallback layout", () => {
  const layouts = new Map([["present", { x: 9, y: 8, tone: "sage" }]]);
  assert.deepEqual(resolveCanvasTaskLayout("present", 0, layouts), { x: 9, y: 8, tone: "sage" });
  assert.deepEqual(resolveCanvasTaskLayout("missing", 4, layouts), { x: 320, y: 290, tone: "cream" });
});
