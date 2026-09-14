import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  findDuplicateTaskIds,
  getFileTaskPlacement,
  parseFileTask,
  resolveCanvasTaskLayout,
  selectNumericShadowCanonicalPath,
  serializeFileTask,
} from "../src/fileSource.ts";

const root = "待办";

class MemoryVault {
  files = new Map();
  listeners = new Set();
  operations = [];
  failCanvasWrites = false;

  on(listener) {
    this.listeners.add(listener);
  }

  emit(event) {
    for (const listener of this.listeners) listener(event);
  }

  create(path, content) {
    this.files.set(path, content);
    this.operations.push(["create", path]);
    this.emit({ type: "create", path });
  }

  rename(oldPath, newPath) {
    const content = this.files.get(oldPath);
    if (content === undefined) throw new Error(`missing ${oldPath}`);
    if (this.files.has(newPath)) throw new Error(`occupied ${newPath}`);
    this.files.delete(oldPath);
    this.files.set(newPath, content);
    this.operations.push(["rename", oldPath, newPath]);
    this.emit({ type: "rename", path: newPath, oldPath });
  }

  writeCanvas() {
    if (this.failCanvasWrites) throw new Error("simulated Canvas failure");
    this.operations.push(["canvas", `${root}/白板/任务白板.canvas`]);
  }
}

class MemoryFileRepository {
  constructor(vault) {
    this.vault = vault;
    this.mutationQueue = Promise.resolve();
    this.eventQueue = Promise.resolve();
    this.snapshot = { tasks: [], conflicts: [] };
    vault.on(() => {
      this.eventQueue = this.eventQueue
        .then(() => this.mutationQueue.catch(() => undefined))
        .then(() => this.refresh());
    });
  }

  refresh() {
    const entries = [];
    for (const [path, content] of this.vault.files) {
      const placement = getFileTaskPlacement(root, path);
      if (!placement || path.includes("/归档/")) continue;
      const title = path.slice(path.lastIndexOf("/") + 1).replace(/\.md$/, "");
      const task = parseFileTask(content, title, path);
      if (task) entries.push({ task, path, placement });
    }
    const entriesById = Map.groupBy(entries, ({ task }) => task.id);
    const shadowPaths = new Set();
    for (const group of entriesById.values()) {
      const canonicalPath = selectNumericShadowCanonicalPath(
        group.map(({ path }) => path),
      );
      if (!canonicalPath) continue;
      for (const { path } of group) {
        if (path !== canonicalPath) shadowPaths.add(path);
      }
    }
    const indexedEntries = entries.filter(({ path }) => !shadowPaths.has(path));
    const conflicts = findDuplicateTaskIds(indexedEntries.map(({ task, path }) => ({
      id: task.id,
      path,
    })));
    const conflictIds = new Set(conflicts.map((conflict) => conflict.id));
    this.snapshot = {
      tasks: indexedEntries.filter(({ task }) => !conflictIds.has(task.id)),
      conflicts,
    };
  }

  moveTask(taskId, folder) {
    const result = this.mutationQueue.catch(() => undefined).then(async () => {
      this.refresh();
      const conflict = this.snapshot.conflicts.find((item) => item.id === taskId);
      if (conflict) throw new Error(`duplicate ${taskId}`);
      const entry = this.snapshot.tasks.find(({ task }) => task.id === taskId);
      if (!entry) throw new Error(`missing ${taskId}`);
      const nextPath = `${folder}/${entry.path.slice(entry.path.lastIndexOf("/") + 1)}`;
      const canvasChanged = entry.placement.location === "canvas" || folder === `${root}/白板`;
      this.vault.rename(entry.path, nextPath);
      this.refresh();
      if (canvasChanged) {
        try {
          this.vault.writeCanvas();
        } catch {
          // File position is already committed and is deliberately not rolled back.
        }
      }
    });
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  async idle() {
    await this.mutationQueue;
    await this.eventQueue;
    this.refresh();
  }
}

function taskMarkdown(id, title = id) {
  return serializeFileTask({
    id,
    title,
    detail: `detail ${id}`,
    source: "文本",
    priority: "P3",
  }, { sortKey: 1 });
}

test("rename/modify/create event bursts never move a task back", async () => {
  const vault = new MemoryVault();
  const oldPath = `${root}/缓存工作台/缓存列表/竞态.md`;
  const newPath = `${root}/缓存工作台/待办列表/竞态.md`;
  vault.create(oldPath, taskMarkdown("race"));
  const repo = new MemoryFileRepository(vault);
  repo.refresh();
  await repo.moveTask("race", `${root}/缓存工作台/待办列表`);
  vault.emit({ type: "rename", path: newPath, oldPath });
  vault.emit({ type: "modify", path: newPath });
  vault.emit({ type: "create", path: newPath });
  await repo.idle();
  assert.equal(vault.files.has(oldPath), false);
  assert.equal(vault.files.has(newPath), true);
  assert.equal(repo.snapshot.tasks[0].placement.location, "todo");
});

test("rapid moves, restart, and an external manual move keep directory truth", async () => {
  const vault = new MemoryVault();
  vault.create(`${root}/缓存工作台/缓存列表/连续.md`, taskMarkdown("rapid"));
  const repo = new MemoryFileRepository(vault);
  repo.refresh();
  const first = repo.moveTask("rapid", `${root}/缓存工作台/待办列表`);
  const second = repo.moveTask("rapid", `${root}/任务存储器/等待条件`);
  await Promise.all([first, second]);
  await repo.idle();

  const restarted = new MemoryFileRepository(vault);
  restarted.refresh();
  assert.equal(restarted.snapshot.tasks[0].placement.location, "storage");
  const storagePath = restarted.snapshot.tasks[0].path;
  const inboxPath = `${root}/缓存工作台/收集箱/连续.md`;
  vault.rename(storagePath, inboxPath);
  await restarted.idle();
  assert.equal(restarted.snapshot.tasks[0].placement.location, "inbox");
  assert.equal(vault.files.has(storagePath), false);
});

test("Canvas failure or missing layout never changes the committed directory", async () => {
  const vault = new MemoryVault();
  vault.create(`${root}/缓存工作台/待办列表/白板任务.md`, taskMarkdown("canvas"));
  const repo = new MemoryFileRepository(vault);
  repo.refresh();
  vault.failCanvasWrites = true;
  await repo.moveTask("canvas", `${root}/白板`);
  await repo.idle();
  assert.equal(repo.snapshot.tasks[0].placement.location, "canvas");
  assert.deepEqual(resolveCanvasTaskLayout("canvas", 0, new Map()), {
    x: 40,
    y: 100,
    tone: "cream",
  });
});

test("duplicate IDs produce diagnostics and no file operation", async () => {
  const vault = new MemoryVault();
  vault.create(`${root}/缓存工作台/待办列表/A.md`, taskMarkdown("duplicate"));
  vault.create(`${root}/缓存工作台/缓存列表/B.md`, taskMarkdown("duplicate"));
  const repo = new MemoryFileRepository(vault);
  repo.refresh();
  const before = vault.operations.length;
  await assert.rejects(
    repo.moveTask("duplicate", `${root}/白板`),
    /duplicate/,
  );
  assert.equal(vault.operations.length, before);
  assert.equal(repo.snapshot.tasks.length, 0);
  assert.equal(repo.snapshot.conflicts[0].paths.length, 2);
});

test("same-folder numeric Sync shadows do not hide the canonical task", () => {
  const vault = new MemoryVault();
  const folder = `${root}/缓存工作台/待办列表`;
  vault.create(`${folder}/正常任务.md`, taskMarkdown("sync-shadow"));
  vault.create(`${folder}/正常任务 2.md`, taskMarkdown("sync-shadow"));
  const repo = new MemoryFileRepository(vault);
  repo.refresh();
  assert.equal(repo.snapshot.tasks.length, 1);
  assert.equal(repo.snapshot.tasks[0].path, `${folder}/正常任务.md`);
  assert.deepEqual(repo.snapshot.conflicts, []);
  assert.equal(vault.files.size, 2);
});

test("runtime source has no whole-workspace UI save or persisted workspace", () => {
  const ui = readFileSync("src/ui/TodoWorkspace.tsx", "utf8");
  const main = readFileSync("src/main.tsx", "utf8");
  assert.doesNotMatch(ui, /storage\?*\.save\s*\(/);
  assert.match(ui, /loadSnapshot/);
  const start = main.indexOf("private async persistWorkspace()");
  const end = main.indexOf("\n  }", start);
  const persistMethod = start >= 0 && end >= 0 ? main.slice(start, end) : "";
  assert.match(persistMethod, /fileSchemaVersion/);
  assert.doesNotMatch(persistMethod, /workspace\s*:/);
  assert.doesNotMatch(main, /markdownSyncEnabled/);
  assert.doesNotMatch(main, /private saveWorkspace/);
  assert.doesNotMatch(main, /private async loadNativeCanvas/);
});

test("settings reload button rebuilds the index without mutating Vault files", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  assert.match(main, /从待办文件夹加载 Markdown 任务/);
  assert.match(main, /\.setButtonText\(this\.plugin\.t\("加载任务"\)\)/);
  const start = main.indexOf("  loadTasksFromFolder():");
  const end = main.indexOf("\n  private async persistWorkspace()", start);
  const loadMethod = start >= 0 && end >= 0 ? main.slice(start, end) : "";
  assert.match(loadMethod, /waitForMarkdownMutations\(\)/);
  assert.match(loadMethod, /refreshFileIndex\(true, false\)/);
  assert.doesNotMatch(
    loadMethod,
    /vault\.(?:create|modify|rename|delete)|fileManager\.|adapter\.(?:write|remove|rename)/,
  );
});

test("duplicate task files are visible as read-only conflict cards", () => {
  const main = readFileSync("src/main.tsx", "utf8");
  const ui = readFileSync("src/ui/TodoWorkspace.tsx", "utf8");
  assert.match(main, /conflict-display:/);
  assert.match(main, /readOnlyConflict: Boolean\(conflictPaths\)/);
  assert.match(main, /conflictDisplayTasks\.has\(id\)/);
  assert.match(ui, /if \(task\.readOnlyConflict\) return null/);
  assert.match(ui, /draggable=\{!task\.readOnlyConflict/);
  assert.match(ui, /ID 冲突 · 只读/);
});
