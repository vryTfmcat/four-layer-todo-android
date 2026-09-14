# Changelog

## 0.1.13 - 2026-08-28

- Restore vertical touch scrolling on Android and other narrow mobile layouts
  by giving the Obsidian view a dedicated mobile scroll path.
- Let the workbench, task storage, and long-term object pages grow naturally on
  mobile while preserving desktop column scrolling and whiteboard dragging.
- Add a regression guard for the mobile overflow and touch-action rules.

## 0.1.12 - 2026-08-22

- Preserve user-arranged workspace leaf placement by letting Obsidian manage
  registered view cleanup instead of detaching leaves during plugin unload.
- Add a regression guard that rejects future lifecycle code which detaches
  workspace leaves.

## 0.1.11 - 2026-08-21

- Make Markdown files and their folders the only source of task content and
  layer placement; `data.json` now stores settings and the migration version
  only.
- Store whiteboard coordinates, colors, connections, and text notes only in
  `任务白板.canvas`. Canvas failures never roll back an already committed task
  move.
- Replace whole-workspace autosaves with targeted create, update, move,
  archive, delete, and Canvas-layout commands followed by a read-only index
  refresh.
- Add `_任务池.md` metadata files for task-pool descriptions, colors, and
  ordering.
- Migrate legacy workspace-only tasks and remove duplicated title, placement,
  and layout fields from managed task frontmatter.
- Isolate active duplicate task IDs, show every conflicting path in settings,
  and block edits or moves until the conflict is resolved manually. Archived
  historical duplicates remain valid.
- Keep same-folder numeric Sync shadow copies on disk but ignore them in the
  task index, so deterministic conflict copies cannot hide the canonical task.
- Add a read-only settings button that reloads managed Markdown tasks from the
  configured task folder and refreshes every open plugin view.
- Show every active duplicate-ID file in its actual layer as a read-only
  conflict card while continuing to block edits, moves, and automatic cleanup.
- Add file-source, sorting, conflict, Canvas fallback, and simulated Vault
  race tests.

## 0.1.10

- Remove unused React compatibility shims that caused false unsafe-type
  findings in the community plugin scorecard.
- Route asynchronous UI actions through void callbacks with explicit error
  handling.
- Remove the deprecated settings-tab `display()` implementation and use only
  Obsidian 1.13 declarative settings definitions.
- Replace unsupported multi-column CSS and extended system-font fallbacks with
  Obsidian-compatible grid and interface font styles.
- Remove `!important` overrides while preserving reduced-motion and transparent
  interface behavior through selector specificity.
- Add typed ESLint checks, pull-request CI, and a contributing guide.
- Make startup and externally received Markdown updates read-only from the
  plugin side, preventing Obsidian Sync downloads from being immediately
  written back and turned into numeric conflict copies.
- Remove every generated linked-note backlink, including a legacy malformed
  trailing bracket variant, before writing one canonical backlink.

## 0.1.9

- Give every synchronized card, including whiteboard and linked-note cards, a
  managed Markdown file keyed by its stable task ID.
- Reconcile native Canvas file nodes with task IDs and move managed task files
  to the layer selected in Canvas without duplicating cards across layers.
- Preserve links to original notes in task frontmatter and a single generated
  backlink while moving and opening the managed task card instead of the source.
- Clean up repeated generated backlinks and legacy self-referencing task links
  during synchronization.
- Keep numeric Obsidian Sync conflict filenames stable instead of feeding
  suffixes such as `2` back into task titles or another rename cycle.
- Archive a linked-note task card when unlinking it, without moving or deleting
  the original note.

## 0.1.8

- Declare the Obsidian 1.13.0 minimum required by the settings and file APIs.

## 0.1.7

- Synchronize the pnpm lockfile with the fixed Preact 10.29.8 dependency.

## 0.1.6

- Add a complete English interface with automatic language detection and an
  explicit English/Chinese language setting.
- Keep existing Chinese task folders, frontmatter values, and task content
  compatible when the interface language changes.
- Translate fresh guided sample content into the active interface language.
- Upgrade Preact to 10.29.8 to remove the known JSON VNode injection advisory.
- Fix the plugin view root height so the whiteboard fills the Obsidian view.
- Use declarative settings definitions compatible with Obsidian 1.13+.

## 0.1.5

- Use the plugin stylesheet instead of injecting styles at runtime.
- Preserve user-arranged workspace leaves when the plugin unloads.
- Publish the required Obsidian release assets individually.

## 0.1.4 - 2026-08-06

- Restore Markdown-to-plugin synchronization during startup before writing
  workspace state back to the vault.
- Synchronize task-pool folders, including empty pools, and derive a task's
  location from its Markdown path when it is moved between pools.
- Serialize vault events so simultaneous folder and note changes cannot
  overwrite one another in `data.json`.
- Use `待办/白板/任务白板.canvas` as the persisted whiteboard and synchronize
  card positions, text notes, and connections with Obsidian's official Canvas.
- Stop creating whiteboard-only Markdown copies, preventing sync conflicts and
  repeated numeric filename suffixes.
- Move managed Markdown files together with their cards when using the card
  menu, including moves into and out of the whiteboard.
- Represent whiteboard cards backed by Markdown as native Canvas file nodes and
  preserve their note paths so the open-note action keeps working after reload.
- Resolve managed notes by their stable task ID when an older card does not yet
  contain a linked note path.
- When adding a note, move files already inside the configured task folder to
  the selected task layer; link notes outside that folder without moving them.
- Exclude archived notes from active task synchronization while keeping them in
  dated folders under `待办/归档/`.

## 0.1.3 - 2026-07-26

- Explicitly route mouse-wheel events over the workbench's Inbox, To-do List, and Cache List to their own scroll containers in Obsidian.

## 0.1.2 - 2026-07-26

- Add the repository license and a bilingual marketplace README.
- Use Preact-compatible production output to remove bundled dynamic script paths.
- Store workspace state exclusively through Obsidian's plugin data APIs.
- Fix workbench columns so mouse-wheel scrolling works while the pointer is over the inbox, to-do list, or cache list.

## 0.1.1 - 2026-07-26

- Rename the manifest display name to `Four Layer Todo` for Obsidian's
  community-plugin directory naming requirements.

## 0.1.0 - 2026-07-26

### 中文

- 首次公开版本：白板、缓存工作台、任务存储器和长期对象。
- 支持任务移动、完成、归档、删除、任务池和关联任务。
- 支持可选 Markdown 双向同步、链接笔记分流和 Obsidian Canvas 互通。
- 修复连线即时保存、同名笔记移动、待办文件夹笔记分流和归档失败反馈。
- 样例迁移不再删除用户 `待办/` 文件；缺失的引导连线会安全补回。

### English

- First public release with a whiteboard, workbench, task storage, and
  long-term objects.
- Supports task movement, completion, archiving, deletion, task pools, and
  related tasks.
- Includes optional bidirectional Markdown synchronization, note-link routing,
  and Obsidian Canvas interoperability.
- Fixes immediate connection persistence, duplicate-name moves, task-folder
  note routing, and archive failure feedback.
- Sample migrations no longer delete user files in `待办/`; missing guided
  connections are restored safely.
