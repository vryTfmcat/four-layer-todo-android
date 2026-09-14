import assert from "node:assert/strict";
import test from "node:test";
import {
  chooseStableMarkdownPath,
  isNumericConflictBasename,
  renameOperationKey,
  stableTaskFileStem,
  stripGeneratedLinkedNoteBacklinks,
} from "../src/syncGuards.ts";

const fallback = "Untitled task";

test("sanitizes task filenames deterministically", () => {
  assert.equal(stableTaskFileStem(' A/B: C? ', fallback), "A-B- C-");
  assert.equal(stableTaskFileStem("   ", fallback), fallback);
});

test("recognizes only numeric Sync conflict suffixes", () => {
  assert.equal(isNumericConflictBasename("Task 2", "Task", fallback), true);
  assert.equal(isNumericConflictBasename("Task 2 2", "Task", fallback), true);
  assert.equal(isNumericConflictBasename("Task 20 reasons", "Task", fallback), false);
  assert.equal(isNumericConflictBasename("Task", "Task", fallback), false);
});

test("keeps an existing conflict filename stable across repeated syncs", () => {
  const occupied = new Set(["todo/Task.md", "todo/Task 2.md"]);
  const first = chooseStableMarkdownPath(
    "todo",
    "Task",
    "todo/Task 2.md",
    (path) => occupied.has(path),
    fallback,
  );
  const second = chooseStableMarkdownPath(
    "todo",
    "Task",
    first,
    (path) => occupied.has(path),
    fallback,
  );
  assert.equal(first, "todo/Task 2.md");
  assert.equal(second, first);
});

test("never adds another suffix to a repeated Sync conflict name", () => {
  const occupied = new Set(["todo/Task.md", "todo/Task 2 2.md"]);
  assert.equal(
    chooseStableMarkdownPath(
      "todo",
      "Task",
      "todo/Task 2 2.md",
      (path) => occupied.has(path),
      fallback,
    ),
    "todo/Task 2 2.md",
  );
});

test("returns to the canonical filename when it becomes free", () => {
  const occupied = new Set(["todo/Task 2.md"]);
  assert.equal(
    chooseStableMarkdownPath(
      "todo",
      "Task",
      "todo/Task 2.md",
      (path) => occupied.has(path),
      fallback,
    ),
    "todo/Task.md",
  );
});

test("rename keys match exact old and new path pairs", () => {
  assert.notEqual(
    renameOperationKey("todo/Task.md", "todo/Task 2.md"),
    renameOperationKey("todo/Task.md", "todo/Task 3.md"),
  );
});

test("removes every generated backlink and legacy stray bracket", () => {
  const path = "Folder/Linked note.md";
  assert.equal(
    stripGeneratedLinkedNoteBacklinks(
      `User detail\n\n[[${path}|关联原笔记]]\n]\n\n[[${path}|关联原笔记]]`,
    ),
    "User detail",
  );
});

test("preserves ordinary user links", () => {
  assert.equal(
    stripGeneratedLinkedNoteBacklinks("Keep [[Folder/Note|my alias]]"),
    "Keep [[Folder/Note|my alias]]",
  );
});
