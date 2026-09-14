# Four Layer Todo for Obsidian

[中文说明](README.zh.md)

Four-Layer Todo is a local-first task workspace for Obsidian. It keeps the
current task in a whiteboard while moving less immediate work through a
workbench, task pools, and long-term objects.

## Demo Video

[Watch the subtitled Four Layer Todo demo](发布素材/演示视频/Four-Layer-Todo-Demo-Subtitled.mp4)

## Features

- A whiteboard for the one to three tasks currently in focus.
- A reversible workbench with an inbox, to-do list, and cache list.
- Expandable Kanban-style task pools.
- Long-term objects with related tasks.
- Task connections, text notes, card movement, archiving, deletion, and
  completion.
- Markdown files and folders as the single source of task content and layers.
- Links to notes outside the task folder without moving the original file.
- Import and export through Obsidian's official Canvas format.

The plugin is local-first. It does not send task content to a network service.
The AI buttons are interface placeholders only.

## Interface Languages

Four Layer Todo includes complete English and Chinese interfaces. By default,
the plugin follows Obsidian's language. You can also choose **Automatic**,
**English**, or **Chinese** under **Settings → Community plugins → Four Layer
Todo**.

Changing the interface language never renames existing notes, task folders, or
frontmatter values. This keeps existing Chinese vaults compatible while making
the full interface usable for English-speaking users. New sample content is
created in the active interface language.

## Install From Source

```bash
npm install
npm run build
```

To install the development build into the current vault:

```bash
npm run install:local
```

Then enable **Four-Layer Todo** in Obsidian's Community Plugins settings and
run **Open Four-Layer Todo** from the command palette.

## Markdown / Canvas Source of Truth

Set the task-notes folder in the plugin settings. The default is `待办`
("Todo") for compatibility with existing vaults. There is no synchronization
toggle: the plugin always reads and writes the files in this folder.

Before the first 0.1.11 startup, let Obsidian Sync finish and disable or update
older plugin builds on other devices. The one-time migration rewrites managed
frontmatter; any duplicate IDs received from Sync are isolated for manual
review instead of being guessed or deleted.

- Only Markdown with `fourLayerTodo: true` is indexed; ordinary notes in the
  same folders are untouched.
- The file name is the title, the body is the detail, and frontmatter stores
  only the stable ID, priority, completion, order, long-term-object ID, and
  linked-note path.
- The directory is the only task-layer source. Moving or renaming a managed
  note updates the UI; Vault events never move a file from an in-memory copy.
- Each direct child folder under `任务存储器/` is a task pool. Its `_任务池.md`
  stores the pool description, color, and order.
- The **Load tasks** button in settings manually rebuilds the task index from
  the configured task folder and refreshes the plugin view. This operation is
  read-only: it never writes, moves, copies, or deletes files.
- `白板/任务白板.canvas` stores file nodes, coordinates, colors, connections,
  and text notes only. Missing or invalid Canvas data cannot change a task's
  directory.
- `data.json` stores only the task root, language, transparent-interface
  preference, and file-schema migration version. It contains no task body or
  workspace snapshot.
- Active duplicate IDs are excluded from the normal index and listed with all
  conflicting paths in plugin settings. Resolve them manually before editing
  or moving those tasks.
- Deleting a managed note removes its task card.
- Linking a note inside the task folder moves it to the selected task area.
  Linking a note outside the task folder creates a backlink-style task card and
  leaves the original file in place.

The synchronized folder layout is:

```text
待办/
├── 白板/
├── 缓存工作台/
│   ├── 收集箱/
│   ├── 待办列表/
│   └── 缓存列表/
├── 任务存储器/
│   └── <task-pool>/
├── 归档/
│   └── YYYY-MM-DD/
└── 长期对象/
```

Archiving moves the managed note into the dated archive folder. Deleting sends
the managed Markdown note to Obsidian's trash.

## Development Checks

```bash
npm run build
npm test
npm run lint
node --check main.js
```

## License

[MIT](LICENSE)
