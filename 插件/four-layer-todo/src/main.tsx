import { createRoot, type Root } from "react-dom/client";
import {
  TodoWorkspace,
  type LinkedNoteSuggestion,
  type LongTermObject,
  type NativeCanvasFile,
  type NoteTaskTarget,
  type TaskItem,
  type WorkspaceState,
  type WorkspaceStorage,
} from "./ui/TodoWorkspace";
import todoIconDataUrl from "../assets/todo-icon.png";
import {
  getLanguage,
  ItemView,
  Notice,
  normalizePath,
  Plugin,
  PluginSettingTab,
  type SettingDefinitionItem,
  TFile,
  TFolder,
  WorkspaceLeaf,
} from "obsidian";
import {
  resolveLocale,
  setActiveLocale,
  tr,
  translateGuidedWorkspace,
  type AppLocale,
  type LanguageSetting,
} from "./i18n";
import {
  chooseStableMarkdownPath,
  stableTaskFileStem,
} from "./syncGuards";
import {
  compareFileSourceOrder,
  findDuplicateTaskIds,
  frontmatterNumber as getNumber,
  frontmatterString as getString,
  getFileTaskPlacement as getTaskLocationFromPath,
  parseFileTask as parseTaskNote,
  parseFileTaskPool,
  parseSimpleFrontmatter as parseFrontmatter,
  resolveCanvasTaskLayout,
  selectNumericShadowCanonicalPath,
  serializeFileTask,
  serializeFileTaskPool,
  type FileTaskData,
  type FileTaskLocation,
  type FileTaskPoolMetadata,
} from "./fileSource";

const VIEW_TYPE = "four-layer-todo-workspace";
const NATIVE_CANVAS_FILE_NAME = "任务白板.canvas";
const NATIVE_CANVAS_TASK_MARKER = "<!-- four-layer-todo-task -->";
const TASK_POOL_TONES = ["green", "amber", "blue", "violet"];
const POOL_METADATA_FILE_NAME = "_任务池.md";
const FILE_SCHEMA_VERSION = 1;
const DEFAULT_SETTINGS: FourLayerTodoSettings = {
  taskNotesFolder: "待办",
  language: "auto",
  transparentUi: false,
  fileSchemaVersion: 0,
};
const GUIDED_CANVAS_CONNECTIONS = [
  {
    id: "guide-connection-focus-next",
    fromId: "guide-canvas-focus",
    toId: "guide-canvas-next-step",
  },
  {
    id: "guide-connection-focus-pause",
    fromId: "guide-canvas-focus",
    toId: "guide-canvas-pause",
  },
];
const LEGACY_SAMPLE_IDS = new Set([
  "canvas-main",
  "canvas-structure",
  "canvas-cache",
  "canvas-storage",
  "inbox-1",
  "inbox-2",
  "inbox-3",
  "todo-1",
  "todo-2",
  "todo-3",
  "cache-1",
  "cache-2",
  "store-1",
  "store-2",
  "store-3",
  "store-4",
  "store-5",
  "store-6",
  "store-7",
  "store-8",
  "store-9",
  "object-photo",
  "object-health",
  "object-learning",
  "object-food",
  "object-rhythm",
  "object-tools",
]);

type FourLayerTodoSettings = {
  taskNotesFolder: string;
  language: LanguageSetting;
  transparentUi: boolean;
  fileSchemaVersion: number;
};

type PluginData = {
  settings?: Partial<FourLayerTodoSettings>;
};

type LegacyPluginData = PluginData & {
  workspace?: WorkspaceState;
};

type TaskLocation = FileTaskLocation;
type MarkdownTask = FileTaskData;

type TaskRecord = {
  task: TaskItem;
  location: TaskLocation;
  columnId?: string;
};

type IndexedMarkdownTask = {
  file: TFile;
  content: string;
  task?: MarkdownTask;
};

type IndexedMarkdownLongTermObject = {
  file: TFile;
  content: string;
  object?: LongTermObject;
  sortKey?: number;
};

type TaskPoolMetadata = FileTaskPoolMetadata;

export type FileIndexDiagnostics = {
  taskCount: number;
  objectCount: number;
  poolCount: number;
  shadowCopyCount: number;
  duplicateTaskIds: Array<{ id: string; paths: string[] }>;
};

type NativeCanvasNode = {
  id: string;
  type: "file" | "text";
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  file?: string;
  text?: string;
};

type NativeCanvasEdge = {
  id: string;
  fromNode: string;
  fromSide: "top" | "right" | "bottom" | "left";
  toNode: string;
  toSide: "top" | "right" | "bottom" | "left";
  toEnd: "arrow";
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeTaskFolder(folder: string): string {
  return normalizePath(folder.trim().replace(/^\/+|\/+$/g, ""));
}

function isLegacySampleId(id: string): boolean {
  return LEGACY_SAMPLE_IDS.has(id);
}

function createGuidedSampleWorkspace(): WorkspaceState {
  const createTask = (
    id: string,
    title: string,
    detail: string,
    source: TaskItem["source"],
    priority: TaskItem["priority"],
    object: string,
    meta?: string,
  ): TaskItem => ({
    id,
    title,
    detail,
    source,
    priority,
    object,
    meta,
  });
  const habit = "建立可持续的任务习惯";
  const notes = "保持 Obsidian 笔记可用";
  const space = "为兴趣保留空间";
  const canvasCards: WorkspaceState["canvasCards"] = [
    {
      ...createTask(
        "guide-canvas-focus",
        "确定这一轮只推进的事项",
        "从“新手路线”挑选一张最重要的卡片拖到这里。白板只保留当前准备处理的 1 至 3 项，其他任务先留在工作台或任务池中。",
        "文本",
        "P5",
        habit,
        "白板起点",
      ),
      x: 335,
      y: 116,
      tone: "sage",
      done: false,
    },
    {
      ...createTask(
        "guide-canvas-next-step",
        "把目标拆成下一个可见动作",
        "把模糊目标改写成能够马上开始的动作，例如“写下三个问题”而不是“研究这个主题”。可以用连线表达它和主任务的关系。",
        "文本",
        "P4",
        habit,
        "拆解任务",
      ),
      x: 86,
      y: 320,
      tone: "cream",
      done: false,
    },
    {
      ...createTask(
        "guide-canvas-pause",
        "中断前保存工作现场",
        "离开前补一句已经做到哪里、下一步是什么。之后可把卡片移到缓存列表，回来时不必重新回忆上下文。",
        "文本",
        "P4",
        habit,
        "恢复现场",
      ),
      x: 694,
      y: 332,
      tone: "lavender",
      done: false,
    },
  ];
  const storeColumns: WorkspaceState["storeColumns"] = [
    {
      id: "guide-route",
      title: "新手路线",
      hint: "按顺序体验核心流程",
      tone: "green",
      tasks: [
        createTask(
          "guide-store-create",
          "练习：创建一张文本待办",
          "点击绿色加号，填写简短标题和具体内容。标题说明要做什么，内容记录完成标准或下一步。",
          "文本",
          "P5",
          habit,
        ),
        createTask(
          "guide-store-archive",
          "练习：将完成的任务归档",
          "通过卡片右上角菜单选择归档。插件会在待办/归档下按当天日期建立文件夹，并保留对应 Markdown 文件。",
          "笔记",
          "P4",
          habit,
        ),
        createTask(
          "guide-store-link",
          "练习：链接一篇已有 Markdown 笔记",
          "点击 ⛓，空搜索会优先显示待办文件夹中的笔记；输入文字后会搜索整个库。普通笔记将作为双链任务加入，不会被移动。",
          "笔记",
          "P4",
          notes,
        ),
      ],
    },
    {
      id: "guide-waiting",
      title: "等待条件",
      hint: "条件未满足时不占用注意力",
      tone: "amber",
      tasks: [
        createTask(
          "guide-waiting-material",
          "等待：外部资料到齐后再继续",
          "把无法行动的任务放在这里，并在内容中写明缺少什么条件。条件出现后再移动到待办列表或白板。",
          "文本",
          "P3",
          notes,
        ),
        createTask(
          "guide-waiting-time",
          "等待：安排下一次专注时段",
          "当任务需要完整时间块时，不必塞进白板。先保存在等待条件，等到有合适时段后再启动。",
          "文本",
          "P3",
          habit,
        ),
      ],
    },
    {
      id: "guide-possible",
      title: "可能处理",
      hint: "保存可能性，暂不承诺",
      tone: "blue",
      tasks: [
        createTask(
          "guide-possible-interest",
          "可能：给感兴趣的主题开一张候选卡",
          "先记录想继续了解的主题，不必给日期。等它多次出现或与长期对象相关时，再决定是否进入待办。",
          "文本",
          "P2",
          space,
        ),
        createTask(
          "guide-possible-method",
          "可能：整理未来想尝试的方法",
          "将方法、工具或灵感保存在后台，避免它们打断当前工作。定期回顾时再挑一项做小范围试验。",
          "笔记",
          "P2",
          space,
        ),
      ],
    },
    {
      id: "guide-review",
      title: "长期回顾",
      hint: "定期检查系统是否仍有帮助",
      tone: "violet",
      tasks: [
        createTask(
          "guide-review-whiteboard",
          "每周回顾：哪些任务值得进入白板？",
          "回顾任务池和缓存列表，只把现在确实能推进的任务送到待办或白板。其余任务继续留在合适的位置。",
          "笔记",
          "P3",
          habit,
        ),
        createTask(
          "guide-review-space",
          "每周回顾：哪些想法应继续保留？",
          "查看可能处理与长期对象，删除已经不再有价值的条目，或把反复出现的想法升级为长期对象。",
          "文本",
          "P3",
          space,
        ),
      ],
    },
  ];

  return translateGuidedWorkspace({
    canvasCards,
    canvasConnections: clone(GUIDED_CANVAS_CONNECTIONS),
    canvasTextNotes: [
      {
        id: "guide-canvas-note",
        content: "白板提示：拖动卡片调整位置；使用 ↗ 连接任务；右下角 + 创建待办，⛓ 链接已有笔记。",
        x: 430,
        y: 590,
      },
    ],
    longTermObjects: [
      {
        id: "guide-object-habit",
        kind: "目标",
        title: habit,
        description: "让每天的任务选择变得更少、更清楚：白板只承载当前行动，其他事项有稳定的存放位置和回顾节奏。",
        activity: "从“新手第一轮”开始体验完整流转",
        tone: "mint",
        relatedTaskIds: [
          "guide-canvas-focus",
          "guide-canvas-next-step",
          "guide-canvas-pause",
          "guide-todo-flow",
          "guide-todo-opening",
          "guide-store-create",
          "guide-store-archive",
          "guide-waiting-time",
          "guide-review-whiteboard",
        ],
      },
      {
        id: "guide-object-notes",
        kind: "长期想法",
        title: notes,
        description: "任务不替代笔记。需要长期阅读、写作和积累的内容继续留在 Vault 中，通过双链连接到需要行动的地方。",
        activity: "练习把已有 Markdown 笔记链接为任务",
        tone: "lilac",
        relatedTaskIds: [
          "guide-inbox-clarify",
          "guide-cache-resume",
          "guide-store-link",
          "guide-waiting-material",
        ],
      },
      {
        id: "guide-object-space",
        kind: "兴趣",
        title: space,
        description: "不把每一个好奇心都变成紧急任务。用可能处理和长期对象保留线索，等到时机成熟再投入注意力。",
        activity: "在每周回顾中检查可能处理",
        tone: "sky",
        relatedTaskIds: [
          "guide-inbox-capture",
          "guide-possible-interest",
          "guide-possible-method",
          "guide-review-space",
        ],
      },
    ],
    inbox: [
      createTask(
        "guide-inbox-clarify",
        "判断它是任务、资料还是长期方向",
        "能在一次行动中推进的是任务；只需阅读或保存的是资料；会持续影响多个选择的内容适合建成长期对象。",
        "笔记",
        "P3",
        notes,
        "分类练习",
      ),
      createTask(
        "guide-inbox-capture",
        "把突然想到的事先放进收集箱",
        "收集箱只负责接住输入，不要求立刻确定优先级或截止时间。稍后再决定它要进入待办、任务池、长期对象，还是仅保留为笔记。",
        "文本",
        "P3",
        space,
        "收集练习",
      ),
    ],
    todo: [
      createTask(
        "guide-todo-flow",
        "新手第一轮：完成一次任务流转",
        "将一张任务池卡片放上白板，做完后移动到归档；如果中断，则移动到缓存列表并写下下一步。这个练习会覆盖插件最常用的路径。",
        "笔记",
        "P5",
        habit,
        "建议从这里开始",
      ),
      createTask(
        "guide-todo-opening",
        "建立每日打开时的起始动作",
        "每次打开先看白板，再从待办列表选一件可以在当前时间开始的任务。不要在完整任务库里反复挑选。",
        "文本",
        "P4",
        habit,
        "使用习惯",
      ),
    ],
    cache: [
      createTask(
        "guide-cache-resume",
        "恢复一个被中断的任务",
        "缓存列表中的卡片必须写明已完成部分和下一步。恢复时先读这两句，再决定把它放回白板还是继续保留。",
        "笔记",
        "P3",
        notes,
        "恢复练习",
      ),
    ],
    storeColumns,
    transparentUi: false,
  });
}

function removeLegacySampleData(state: WorkspaceState): WorkspaceState {
  const canvasCards = state.canvasCards.filter(
    (task) => !isLegacySampleId(task.id),
  );
  const canvasCardIds = new Set(canvasCards.map((task) => task.id));
  const canvasConnections = (state.canvasConnections ?? []).filter(
    (connection) =>
      canvasCardIds.has(connection.fromId) && canvasCardIds.has(connection.toId),
  );
  const canvasTextNotes = (state.canvasTextNotes ?? []).filter(
    (note) => !isLegacySampleId(note.id),
  );
  const inbox = state.inbox.filter((task) => !isLegacySampleId(task.id));
  const todo = state.todo.filter((task) => !isLegacySampleId(task.id));
  const cache = state.cache.filter((task) => !isLegacySampleId(task.id));
  const storeColumns = state.storeColumns.map((column) => ({
    ...column,
    tasks: column.tasks.filter((task) => !isLegacySampleId(task.id)),
  }));
  const longTermObjects = (state.longTermObjects ?? []).filter(
    (object) => !isLegacySampleId(object.id),
  );

  const changed =
    canvasCards.length !== state.canvasCards.length ||
    canvasConnections.length !== (state.canvasConnections ?? []).length ||
    canvasTextNotes.length !== (state.canvasTextNotes ?? []).length ||
    inbox.length !== state.inbox.length ||
    todo.length !== state.todo.length ||
    cache.length !== state.cache.length ||
    storeColumns.some(
      (column, index) =>
        column.tasks.length !== state.storeColumns[index]?.tasks.length,
    ) ||
    longTermObjects.length !== (state.longTermObjects ?? []).length;

  return changed
    ? {
        ...state,
        canvasCards,
        canvasConnections,
        canvasTextNotes,
        inbox,
        todo,
        cache,
        storeColumns,
        longTermObjects,
      }
    : state;
}

function getTaskRecords(state: WorkspaceState): TaskRecord[] {
  return [
    ...state.canvasCards.map((task) => ({ task, location: "canvas" as const })),
    ...state.inbox.map((task) => ({ task, location: "inbox" as const })),
    ...state.todo.map((task) => ({ task, location: "todo" as const })),
    ...state.cache.map((task) => ({ task, location: "cache" as const })),
    ...state.storeColumns.flatMap((column) =>
      column.tasks.map((task) => ({
        task,
        location: "storage" as const,
        columnId: column.id,
      })),
    ),
  ];
}

function serializeTaskNote(
  taskOrRecord: TaskItem | TaskRecord,
  options?: { sortKey: number; objectId?: string },
): string {
  const task = "task" in taskOrRecord ? taskOrRecord.task : taskOrRecord;
  const resolvedOptions = options ?? {
    sortKey: Date.now(),
    objectId: undefined,
  };
  return serializeFileTask(task, resolvedOptions);
}

function markdownValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function serializeLongTermObjectNote(
  object: LongTermObject,
  sortKey = Date.now(),
): string {
  return [
    "---",
    "fourLayerTodoObject: true",
    `id: ${markdownValue(object.id)}`,
    `kind: ${markdownValue(object.kind)}`,
    `activity: ${markdownValue(object.activity)}`,
    `tone: ${markdownValue(object.tone)}`,
    `sortKey: ${markdownValue(sortKey)}`,
    "---",
    "",
    object.description.trim(),
    "",
  ].join("\n");
}

function serializeTaskPoolMetadata(metadata: TaskPoolMetadata): string {
  return serializeFileTaskPool(metadata);
}

function getLongTermObjectKind(
  value: unknown,
): LongTermObject["kind"] | undefined {
  const canonical = {
    Interest: "兴趣",
    Goal: "目标",
    "Long-term idea": "长期想法",
  }[String(value)] ?? String(value);
  return ["兴趣", "目标", "长期想法"].includes(canonical)
    ? (canonical as LongTermObject["kind"])
    : undefined;
}

function parseLongTermObjectNote(
  content: string,
  fileTitle: string,
): LongTermObject | null {
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter || frontmatter.fourLayerTodoObject !== true) return null;

  const id = getString(frontmatter.id);
  if (!id) return null;

  const kind = getLongTermObjectKind(frontmatter.kind) ?? "长期想法";
  const defaultTone =
    kind === "兴趣" ? "mint" : kind === "目标" ? "peach" : "lilac";
  const description = content
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
    .trim();

  return {
    id,
    kind,
    title: fileTitle || tr("未命名长期对象"),
    description: description || tr("暂无说明。"),
    activity: getString(frontmatter.activity) ?? tr("等待关联任务"),
    tone: getString(frontmatter.tone) ?? defaultTone,
    relatedTaskIds: [],
  };
}

function parseTaskPoolMetadata(content: string): TaskPoolMetadata | null {
  return parseFileTaskPool(content, {
    hint: tr("从 Markdown 任务池同步"),
    tone: "green",
  });
}

function taskFileStem(title: string): string {
  return stableTaskFileStem(title, tr("未命名待办"));
}

function archiveDateFolder(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createManagedTaskId(): string {
  return `task-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nativeCanvasColor(tone: string): string {
  if (tone === "sage") return "4";
  if (tone === "lavender") return "6";
  if (tone === "blue") return "5";
  return "3";
}

function getTaskFolder(
  rootFolder: string,
  record: TaskRecord,
  state: WorkspaceState,
): string {
  if (record.location === "canvas") return `${rootFolder}/白板`;
  if (record.location === "inbox") return `${rootFolder}/缓存工作台/收集箱`;
  if (record.location === "todo") return `${rootFolder}/缓存工作台/待办列表`;
  if (record.location === "cache") return `${rootFolder}/缓存工作台/缓存列表`;

  const column = state.storeColumns.find((item) => item.id === record.columnId);
  return `${rootFolder}/任务存储器/${taskFileStem(column?.title ?? tr("未分类任务池"))}`;
}

class FourLayerTodoView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly plugin: FourLayerTodoPlugin,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.plugin.t("四层待办");
  }

  getIcon(): string {
    return "layers";
  }

  onOpen(): Promise<void> {
    try {
      this.contentEl.empty();
      this.contentEl.addClass("four-layer-todo-plugin");
      const mount = this.contentEl.createDiv({
        cls: "four-layer-todo-root four-layer-todo-mount",
      });
      this.root = createRoot(mount);
      setActiveLocale(this.plugin.locale);
      this.root.render(
        <TodoWorkspace
          storage={this.plugin.getWorkspaceStorage()}
          brandIconSrc={this.plugin.getIconResourcePath()}
        />,
      );

    } catch (error) {
      console.error("四层待办: onOpen error", error);
      new Notice(this.plugin.t("四层待办加载失败: {message}", {
        message: error instanceof Error ? error.message : String(error),
      }));
    }
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    try {
      this.root?.unmount();
    } catch (error) {
      console.error("四层待办: onClose error", error);
    }
    this.root = null;
    return Promise.resolve();
  }

  refreshLocale(): void {
    if (!this.root) return;
    setActiveLocale(this.plugin.locale);
    this.root.render(
      <TodoWorkspace
        storage={this.plugin.getWorkspaceStorage()}
        brandIconSrc={this.plugin.getIconResourcePath()}
      />,
    );
  }
}

class FourLayerTodoSettingTab extends PluginSettingTab {
  constructor(private readonly plugin: FourLayerTodoPlugin) {
    super(plugin.app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: "group",
        heading: this.plugin.t("Markdown / Canvas 单一真源"),
        items: [
          {
            name: this.plugin.t("界面语言"),
            desc: this.plugin.t("更改后会重新打开插件视图，不会修改已有任务内容或文件夹。"),
            control: {
              type: "dropdown",
              key: "language",
              options: {
                auto: this.plugin.t("自动（跟随 Obsidian）"),
                zh: this.plugin.t("中文"),
                en: this.plugin.t("英文"),
              },
            },
          },
          {
            name: this.plugin.t("待办与对象文件夹"),
            desc: this.plugin.t("相对于当前 Vault 根目录。长期对象保存在其中的“长期对象”目录。"),
            control: {
              type: "text",
              key: "taskNotesFolder",
              placeholder: DEFAULT_SETTINGS.taskNotesFolder,
              validate: (value) => {
                const folder = normalizeTaskFolder(value);
                return folder && folder !== normalizePath(this.app.vault.configDir)
                  ? undefined
                  : this.plugin.t("待办笔记文件夹不能留空或使用 Obsidian 配置文件夹");
              },
            },
          },
          {
            name: this.plugin.t("从待办文件夹加载 Markdown 任务"),
            desc: this.plugin.t("只重新读取带 fourLayerTodo: true 的 Markdown 并刷新页面；不写入、移动、复制或删除任何文件。"),
            render: (setting) => {
              setting.addButton((button) => button
                .setButtonText(this.plugin.t("加载任务"))
                .setCta()
                .onClick(async () => {
                  button
                    .setDisabled(true)
                    .setButtonText(this.plugin.t("正在加载…"));
                  try {
                    const diagnostics = await this.plugin.loadTasksFromFolder();
                    button
                      .setDisabled(false)
                      .setButtonText(this.plugin.t("加载任务"));
                    new Notice(this.plugin.t("已从待办文件夹加载 {count} 项任务", {
                      count: diagnostics.taskCount,
                    }));
                    this.update();
                  } catch (error) {
                    button
                      .setDisabled(false)
                      .setButtonText(this.plugin.t("加载任务"));
                    new Notice(this.plugin.t("从待办文件夹加载任务失败: {message}", {
                      message: error instanceof Error ? error.message : String(error),
                    }));
                  }
                }));
            },
          },
          {
            name: this.plugin.t("文件索引状态"),
            desc: this.plugin.getIndexDiagnosticText(),
          },
        ],
      },
    ];
  }

  getControlValue(key: string): unknown {
    if (key === "language") return this.plugin.settings.language;
    if (key === "taskNotesFolder") return this.plugin.settings.taskNotesFolder;
    return undefined;
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    if (key === "language" && ["auto", "zh", "en"].includes(String(value))) {
      await this.plugin.updateLanguage(value as LanguageSetting);
      this.update();
      return;
    }
    if (key === "taskNotesFolder" && typeof value === "string") {
      this.plugin.settings.taskNotesFolder = value;
      await this.plugin.saveSettings();
      await this.plugin.refreshFileIndex();
    }
  }

}

export default class FourLayerTodoPlugin extends Plugin {
  settings: FourLayerTodoSettings = { ...DEFAULT_SETTINGS };
  locale: AppLocale = "zh";
  private workspaceState: WorkspaceState | null = null;
  private readonly workspaceListeners = new Set<
    (state: Partial<WorkspaceState>) => void
  >();
  private readonly taskPaths = new Map<string, string>();
  private readonly conflictDisplayTasks = new Map<
    string,
    { originalId: string; path: string; paths: string[] }
  >();
  private readonly longTermObjectPaths = new Map<string, string>();
  private markdownEventQueue: Promise<void> = Promise.resolve();
  // Every file mutation shares this queue so a card move cannot race another
  // command or a Vault event refresh.
  private markdownMutationQueue: Promise<void> = Promise.resolve();
  private manualTaskLoad: Promise<FileIndexDiagnostics> | null = null;
  private readonly taskMetadata = new Map<
    string,
    { sortKey: number; objectId?: string }
  >();
  private duplicateTaskPaths = new Map<string, string[]>();
  private diagnostics: FileIndexDiagnostics = {
    taskCount: 0,
    objectCount: 0,
    poolCount: 0,
    shadowCopyCount: 0,
    duplicateTaskIds: [],
  };

  async onload(): Promise<void> {
    const data = (await this.loadData()) as LegacyPluginData | null;
    this.settings = {
      taskNotesFolder:
        data?.settings?.taskNotesFolder ?? DEFAULT_SETTINGS.taskNotesFolder,
      language: data?.settings?.language ?? DEFAULT_SETTINGS.language,
      transparentUi:
        data?.settings?.transparentUi ?? data?.workspace?.transparentUi ?? false,
      fileSchemaVersion:
        data?.settings?.fileSchemaVersion ?? DEFAULT_SETTINGS.fileSchemaVersion,
    };
    this.locale = resolveLocale(this.settings.language, getLanguage());
    setActiveLocale(this.locale);
    const legacyWorkspace = data?.workspace
      ? removeLegacySampleData(clone(data.workspace))
      : null;
    try {
      await this.ensureFileSourceStructure();
      if (this.settings.fileSchemaVersion < FILE_SCHEMA_VERSION) {
        await this.migrateLegacyWorkspace(legacyWorkspace);
      }
      await this.refreshFileIndex(false);
      await this.persistWorkspace();
    } catch (error) {
      console.error("四层待办: file-source migration failed", error);
      new Notice(this.t("四层待办文件迁移失败；旧 data.json 已保留。"));
      throw error;
    }

    this.registerView(VIEW_TYPE, (leaf) => new FourLayerTodoView(leaf, this));
    this.addSettingTab(new FourLayerTodoSettingTab(this));
    const scheduleIfRelevant = (path: string, oldPath?: string) => {
      const folder = normalizeTaskFolder(this.settings.taskNotesFolder);
      if (
        path === folder ||
        path.startsWith(`${folder}/`) ||
        oldPath === folder ||
        oldPath?.startsWith(`${folder}/`)
      ) {
        this.queueFileRefresh();
      }
    };
    this.registerEvent(this.app.vault.on("modify", (file) => scheduleIfRelevant(file.path)));
    this.registerEvent(this.app.vault.on("create", (file) => scheduleIfRelevant(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => scheduleIfRelevant(file.path)));
    this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
      scheduleIfRelevant(file.path, oldPath);
    }));

    this.addRibbonIcon("layers", this.t("打开四层待办"), () => {
      this.activateView().catch((error) => {
        console.error("四层待办: ribbon error", error);
        new Notice(this.t("四层待办打开失败"));
      });
    });

    this.addCommand({
      id: "open-workspace",
      name: this.t("打开四层待办"),
      callback: () => {
        this.activateView().catch((error) => {
          console.error("四层待办: command error", error);
          new Notice(this.t("四层待办打开失败"));
        });
      },
    });

    try {
      this.app.workspace.onLayoutReady(() => {
        if (this.app.workspace.getLeavesOfType(VIEW_TYPE).length === 0) {
          this.activateView(false).catch((error) => {
            console.error("四层待办: auto-open error", error);
          });
        }
      });
    } catch (error) {
      console.error("四层待办: onLayoutReady error", error);
    }
  }

  getIconResourcePath(): string {
    return todoIconDataUrl;
  }

  t(text: string, values?: Record<string, string | number>): string {
    setActiveLocale(this.locale);
    return tr(text, values);
  }

  async updateLanguage(language: LanguageSetting): Promise<void> {
    this.settings.language = language;
    this.locale = resolveLocale(language, getLanguage());
    setActiveLocale(this.locale);
    await this.saveSettings();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      if (leaf.view instanceof FourLayerTodoView) leaf.view.refreshLocale();
    }
  }

  getWorkspaceStorage(): WorkspaceStorage {
    return {
      loadSnapshot: () => this.loadWorkspace(),
      createTask: (task, target) => this.createFileTask(task, target),
      updateTask: (task) => this.updateFileTask(task),
      createPool: (column) => this.createFilePool(column),
      createLongTermObject: (object) => this.createFileLongTermObject(object),
      updateCanvasLayout: (state) => this.updateFileCanvasLayout(state),
      setTransparentUi: (value) => this.setTransparentUi(value),
      archiveTask: (taskId) => this.archiveFileTask(taskId),
      deleteTask: (taskId) => this.deleteFileTask(taskId),
      searchNotes: (query) => this.searchNotes(query),
      moveTaskNote: (path, target) => this.moveFileTaskNote(path, target),
      moveTaskById: (taskId, target) => this.moveFileTaskById(taskId, target),
      openNote: (path) => this.openNote(path),
      openTaskNote: (taskId) => this.openTaskNote(taskId),
      openNativeCanvas: () => this.openNativeCanvas(),
      listNativeCanvases: () => this.listNativeCanvases(),
      loadNativeCanvas: (path) => this.loadCanvasLayoutOnly(path),
      subscribe: (listener) => {
        this.workspaceListeners.add(listener);
        return () => this.workspaceListeners.delete(listener);
      },
    };
  }

  async saveSettings(): Promise<void> {
    await this.persistWorkspace();
  }

  private enqueueMarkdownMutation<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.markdownMutationQueue
      .catch(() => undefined)
      .then(operation);
    this.markdownMutationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async waitForMarkdownMutations(): Promise<void> {
    await this.markdownMutationQueue.catch(() => undefined);
  }

  private taskFolderIsUsable(folder: string): boolean {
    return Boolean(folder) && folder !== normalizePath(this.app.vault.configDir);
  }

  private loadWorkspace(): Promise<Partial<WorkspaceState> | null> {
    return Promise.resolve(this.workspaceState ? clone(this.workspaceState) : null);
  }

  loadTasksFromFolder(): Promise<FileIndexDiagnostics> {
    if (this.manualTaskLoad) return this.manualTaskLoad;
    const load = (async () => {
      await this.waitForMarkdownMutations();
      const rootFolder = normalizeTaskFolder(this.settings.taskNotesFolder);
      if (!this.taskFolderIsUsable(rootFolder)) {
        throw new Error(this.t("待办笔记文件夹不能留空或使用 Obsidian 配置文件夹"));
      }
      if (!(this.app.vault.getAbstractFileByPath(rootFolder) instanceof TFolder)) {
        throw new Error(this.t("待办文件夹不存在: {path}", { path: rootFolder }));
      }
      await this.refreshFileIndex(true, false);
      return clone(this.diagnostics);
    })();
    this.manualTaskLoad = load;
    void load.then(
      () => {
        if (this.manualTaskLoad === load) this.manualTaskLoad = null;
      },
      () => {
        if (this.manualTaskLoad === load) this.manualTaskLoad = null;
      },
    );
    return load;
  }

  private async persistWorkspace(): Promise<void> {
    await this.saveData({
      settings: {
        taskNotesFolder: this.settings.taskNotesFolder,
        language: this.settings.language,
        transparentUi: this.settings.transparentUi,
        fileSchemaVersion: this.settings.fileSchemaVersion,
      },
    } satisfies PluginData);
  }

  private emitWorkspace(): void {
    if (!this.workspaceState) return;
    const state = clone(this.workspaceState);
    for (const listener of this.workspaceListeners) listener(state);
  }

  private async ensureFolder(folder: string): Promise<void> {
    const parts = folder.split("/").filter(Boolean);
    let currentPath = "";

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      const existsInVault = this.app.vault.getAbstractFileByPath(currentPath);
      const existsOnDisk = await this.app.vault.adapter.exists(currentPath);
      if (!existsInVault && !existsOnDisk) {
        try {
          await this.app.vault.createFolder(currentPath);
        } catch (error) {
          if (!(await this.app.vault.adapter.exists(currentPath))) {
            throw error;
          }
        }
      }
    }
  }

  private async ensureTaskFolderStructure(rootFolder: string): Promise<void> {
    for (const folder of [
      rootFolder,
      `${rootFolder}/白板`,
      `${rootFolder}/缓存工作台`,
      `${rootFolder}/缓存工作台/收集箱`,
      `${rootFolder}/缓存工作台/待办列表`,
      `${rootFolder}/缓存工作台/缓存列表`,
      `${rootFolder}/任务存储器`,
      `${rootFolder}/归档`,
      `${rootFolder}/长期对象`,
    ]) {
      await this.ensureFolder(folder);
    }
  }

  private async ensureFileSourceStructure(): Promise<void> {
    const folder = normalizeTaskFolder(this.settings.taskNotesFolder);
    if (!this.taskFolderIsUsable(folder)) {
      throw new Error(this.t("待办笔记文件夹不能留空或使用 Obsidian 配置文件夹"));
    }
    await this.ensureTaskFolderStructure(folder);
  }

  getIndexDiagnosticText(): string {
    const summary = this.t("已索引 {tasks} 项任务、{objects} 个长期对象、{pools} 个任务池。", {
      tasks: this.diagnostics.taskCount,
      objects: this.diagnostics.objectCount,
      pools: this.diagnostics.poolCount,
    });
    if (!this.diagnostics.duplicateTaskIds.length) {
      return `${summary} ${this.t("没有活跃重复 ID。")} ${this.t("已忽略 {count} 个同目录数字后缀影子副本。", {
        count: this.diagnostics.shadowCopyCount,
      })}`;
    }
    const conflicts = this.diagnostics.duplicateTaskIds
      .map((item) => `${item.id}: ${item.paths.join(" · ")}`)
      .join("\n");
    return `${summary} ${this.t("已忽略 {count} 个同目录数字后缀影子副本。", {
      count: this.diagnostics.shadowCopyCount,
    })}\n${this.t("以下重复 ID 已隔离，插件不会移动或编辑这些文件：")}\n${conflicts}`;
  }

  private queueFileRefresh(): void {
    this.markdownEventQueue = this.markdownEventQueue
      .catch(() => undefined)
      .then(async () => {
        await this.waitForMarkdownMutations();
        await this.refreshFileIndex();
      })
      .catch((error) => {
        console.error("四层待办: file index refresh failed", error);
      });
  }

  private async scanActiveTaskGroups(
    rootFolder: string,
  ): Promise<Map<string, IndexedMarkdownTask[]>> {
    const groups = new Map<string, IndexedMarkdownTask[]>();
    const files = this.app.vault.getMarkdownFiles().filter((file) => {
      if (!file.path.startsWith(`${rootFolder}/`)) return false;
      if (this.isArchivedMarkdownPath(file.path)) return false;
      if (file.path.startsWith(`${rootFolder}/长期对象/`)) return false;
      if (file.name === POOL_METADATA_FILE_NAME) return false;
      return getTaskLocationFromPath(rootFolder, file.path) !== null;
    });
    for (const file of files) {
      const content = await this.app.vault.read(file);
      const task = parseTaskNote(content, file.basename, file.path);
      if (!task || isLegacySampleId(task.id)) continue;
      const entries = groups.get(task.id) ?? [];
      entries.push({ file, content, task });
      groups.set(task.id, entries);
    }
    return groups;
  }

  private async scanLongTermObjects(
    rootFolder: string,
  ): Promise<IndexedMarkdownLongTermObject[]> {
    const objectFolder = `${rootFolder}/长期对象/`;
    const entries: IndexedMarkdownLongTermObject[] = [];
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(objectFolder)) continue;
      const content = await this.app.vault.read(file);
      const object = parseLongTermObjectNote(content, file.basename);
      if (!object || isLegacySampleId(object.id)) continue;
      const frontmatter = parseFrontmatter(content);
      entries.push({
        file,
        content,
        object,
        sortKey: getNumber(frontmatter?.sortKey) ?? getNumber(frontmatter?.order) ?? file.stat.ctime,
      });
    }
    return entries;
  }

  private async readPoolMetadata(
    folder: TFolder,
    index: number,
  ): Promise<TaskPoolMetadata> {
    const path = `${folder.path}/${POOL_METADATA_FILE_NAME}`;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      const parsed = parseTaskPoolMetadata(await this.app.vault.read(file));
      if (parsed) return parsed;
    }
    return {
      hint: this.t("从 Markdown 任务池同步"),
      tone: TASK_POOL_TONES[index % TASK_POOL_TONES.length],
      sortKey: index * 1000,
    };
  }

  private async readCanvasLayoutFromFile(
    path: string,
    whiteboardPathToTaskId: Map<string, string>,
  ): Promise<{
    cards: Map<string, { x: number; y: number; tone: string }>;
    connections: NonNullable<WorkspaceState["canvasConnections"]>;
    textNotes: NonNullable<WorkspaceState["canvasTextNotes"]>;
  }> {
    const empty = {
      cards: new Map<string, { x: number; y: number; tone: string }>(),
      connections: [] as NonNullable<WorkspaceState["canvasConnections"]>,
      textNotes: [] as NonNullable<WorkspaceState["canvasTextNotes"]>,
    };
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) return empty;
    try {
      const raw = JSON.parse(await this.app.vault.read(file)) as {
        nodes?: unknown;
        edges?: unknown;
      };
      if (!Array.isArray(raw.nodes)) return empty;
      const nodeToTaskId = new Map<string, string>();
      for (const rawNode of raw.nodes) {
        if (!rawNode || typeof rawNode !== "object") continue;
        const node = rawNode as Record<string, unknown>;
        const nodeId = getString(node.id);
        const type = getString(node.type);
        if (!nodeId) continue;
        if (type === "file") {
          const notePath = getString(node.file);
          const taskId = notePath ? whiteboardPathToTaskId.get(notePath) : undefined;
          if (!taskId) continue;
          const color = getString(node.color);
          const tone = color === "4"
            ? "sage"
            : color === "6"
              ? "lavender"
              : color === "5"
                ? "blue"
                : "cream";
          empty.cards.set(taskId, {
            x: getNumber(node.x) ?? 40,
            y: getNumber(node.y) ?? 100,
            tone,
          });
          nodeToTaskId.set(nodeId, taskId);
          continue;
        }
        if (type === "text") {
          const text = getString(node.text) ?? "";
          if (text.startsWith(NATIVE_CANVAS_TASK_MARKER)) continue;
          empty.textNotes.push({
            id: nodeId,
            content: text,
            x: getNumber(node.x) ?? 40,
            y: getNumber(node.y) ?? 100,
          });
        }
      }
      if (Array.isArray(raw.edges)) {
        empty.connections = raw.edges.flatMap((rawEdge) => {
          if (!rawEdge || typeof rawEdge !== "object") return [];
          const edge = rawEdge as Record<string, unknown>;
          const id = getString(edge.id);
          const fromId = nodeToTaskId.get(getString(edge.fromNode) ?? "");
          const toId = nodeToTaskId.get(getString(edge.toNode) ?? "");
          return id && fromId && toId ? [{ id, fromId, toId }] : [];
        });
      }
      return empty;
    } catch (error) {
      console.error("四层待办: Canvas layout read failed", error);
      return empty;
    }
  }

  async refreshFileIndex(emit = true, ensureStructure = true): Promise<void> {
    if (ensureStructure) await this.ensureFileSourceStructure();
    const rootFolder = normalizeTaskFolder(this.settings.taskNotesFolder);
    const groups = await this.scanActiveTaskGroups(rootFolder);
    let shadowCopyCount = 0;
    for (const [id, entries] of groups) {
      const canonicalPath = selectNumericShadowCanonicalPath(
        entries.map((entry) => entry.file.path),
      );
      if (!canonicalPath) continue;
      const canonical = entries.find((entry) => entry.file.path === canonicalPath);
      if (!canonical) continue;
      shadowCopyCount += entries.length - 1;
      groups.set(id, [canonical]);
    }
    this.duplicateTaskPaths = new Map(
      findDuplicateTaskIds(
        [...groups.entries()].flatMap(([id, entries]) =>
          entries.map((entry) => ({ id, path: entry.file.path })),
        ),
      ).map((conflict) => [conflict.id, conflict.paths]),
    );

    const objectEntries = await this.scanLongTermObjects(rootFolder);
    const uniqueObjects = new Map<string, IndexedMarkdownLongTermObject>();
    for (const entry of objectEntries.sort((left, right) =>
      (left.sortKey ?? 0) - (right.sortKey ?? 0) || left.file.path.localeCompare(right.file.path)
    )) {
      if (entry.object && !uniqueObjects.has(entry.object.id)) {
        uniqueObjects.set(entry.object.id, entry);
      }
    }
    const objectTitleById = new Map(
      [...uniqueObjects.entries()].map(([id, entry]) => [id, entry.object?.title ?? entry.file.basename]),
    );
    const objectIdByTitle = new Map(
      [...objectTitleById.entries()].map(([id, title]) => [title, id]),
    );

    const storageRoot = `${rootFolder}/任务存储器`;
    const poolFolders = this.app.vault.getAllLoadedFiles().filter(
      (file): file is TFolder =>
        file instanceof TFolder && file.parent?.path === storageRoot,
    );
    const poolEntries = await Promise.all(poolFolders.map(async (folder, index) => ({
      folder,
      metadata: await this.readPoolMetadata(folder, index),
    })));
    poolEntries.sort((left, right) =>
      left.metadata.sortKey - right.metadata.sortKey ||
      left.folder.name.localeCompare(right.folder.name, "zh-Hans-CN")
    );
    const storeColumns = poolEntries.map(({ folder, metadata }) => ({
      id: folder.path,
      title: folder.name,
      hint: metadata.hint,
      tone: metadata.tone,
      tasks: [] as TaskItem[],
    }));
    const columnByPath = new Map(storeColumns.map((column) => [column.id, column]));

    this.taskPaths.clear();
    this.taskMetadata.clear();
    this.conflictDisplayTasks.clear();
    this.longTermObjectPaths.clear();
    const records: Array<{
      task: TaskItem;
      location: TaskLocation;
      columnId?: string;
      sortKey: number;
      objectId?: string;
    }> = [];
    for (const [originalId, entries] of groups) {
      const conflictPaths = this.duplicateTaskPaths.get(originalId);
      if (entries.length !== 1 && !conflictPaths) continue;
      for (const entry of entries) {
        const parsed = entry.task;
        if (!parsed) continue;
        const placement = getTaskLocationFromPath(rootFolder, entry.file.path);
        if (!placement) continue;
        const id = conflictPaths
          ? `conflict-display:${originalId}:${entry.file.path}`
          : originalId;
        const objectId = parsed.objectId ?? (parsed.object ? objectIdByTitle.get(parsed.object) : undefined);
        const sortKey = parsed.sortKey || entry.file.stat.ctime;
        const task: TaskItem = {
          id,
          title: entry.file.basename,
          detail: parsed.detail,
          source: parsed.linkedNotePath ? "笔记" : parsed.source,
          meta: conflictPaths
            ? this.t("ID 冲突 · 只读")
            : parsed.linkedNotePath ? this.t("双链笔记") : this.t("Markdown 待办"),
          priority: parsed.priority,
          object: objectId ? objectTitleById.get(objectId) : parsed.object,
          linkedNotePath: parsed.linkedNotePath,
          done: parsed.done,
          readOnlyConflict: Boolean(conflictPaths),
          conflictOriginalId: conflictPaths ? originalId : undefined,
          conflictPath: conflictPaths ? entry.file.path : undefined,
        };
        const columnId = placement.location === "storage" && placement.poolTitle
          ? `${storageRoot}/${placement.poolTitle}`
          : undefined;
        records.push({ task, location: placement.location, columnId, sortKey, objectId });
        this.taskPaths.set(id, entry.file.path);
        this.taskMetadata.set(id, { sortKey, objectId });
        if (conflictPaths) {
          this.conflictDisplayTasks.set(id, {
            originalId,
            path: entry.file.path,
            paths: conflictPaths,
          });
        }
      }
    }
    records.sort((left, right) => compareFileSourceOrder(
      { sortKey: left.sortKey, title: left.task.title },
      { sortKey: right.sortKey, title: right.task.title },
    ));

    const whiteboardPathToTaskId = new Map<string, string>();
    for (const record of records) {
      if (record.location !== "canvas") continue;
      const path = this.taskPaths.get(record.task.id);
      if (path) whiteboardPathToTaskId.set(path, record.task.id);
    }
    const canvasPath = `${rootFolder}/白板/${NATIVE_CANVAS_FILE_NAME}`;
    const canvasLayout = await this.readCanvasLayoutFromFile(canvasPath, whiteboardPathToTaskId);
    const state: WorkspaceState = {
      canvasCards: [],
      canvasConnections: canvasLayout.connections,
      canvasTextNotes: canvasLayout.textNotes,
      longTermObjects: [],
      inbox: [],
      todo: [],
      cache: [],
      storeColumns,
      transparentUi: this.settings.transparentUi,
    };
    let canvasIndex = 0;
    for (const record of records) {
      if (record.location === "canvas") {
        const layout = resolveCanvasTaskLayout(
          record.task.id,
          canvasIndex,
          canvasLayout.cards,
        );
        canvasIndex += 1;
        state.canvasCards.push({ ...record.task, ...layout, tone: layout.tone as "sage" | "cream" | "lavender" | "blue" });
      } else if (record.location === "inbox") {
        state.inbox.push(record.task);
      } else if (record.location === "todo") {
        state.todo.push(record.task);
      } else if (record.location === "cache") {
        state.cache.push(record.task);
      } else if (record.columnId) {
        columnByPath.get(record.columnId)?.tasks.push(record.task);
      }
    }
    const relatedTaskIds = new Map<string, string[]>();
    for (const record of records) {
      if (!record.objectId) continue;
      relatedTaskIds.set(record.objectId, [
        ...(relatedTaskIds.get(record.objectId) ?? []),
        record.task.id,
      ]);
    }
    state.longTermObjects = [...uniqueObjects.entries()].map(([id, entry]) => {
      this.longTermObjectPaths.set(id, entry.file.path);
      return {
        ...(entry.object as LongTermObject),
        relatedTaskIds: relatedTaskIds.get(id) ?? [],
      };
    });
    this.workspaceState = state;
    this.diagnostics = {
      taskCount: records.length,
      objectCount: state.longTermObjects.length,
      poolCount: state.storeColumns.length,
      shadowCopyCount,
      duplicateTaskIds: [...this.duplicateTaskPaths.entries()].map(([id, paths]) => ({ id, paths })),
    };
    if (emit) this.emitWorkspace();
  }

  private async migrateLegacyWorkspace(
    legacyWorkspace: WorkspaceState | null,
  ): Promise<void> {
    const rootFolder = normalizeTaskFolder(this.settings.taskNotesFolder);
    let sourceWorkspace = legacyWorkspace;
    const existingGroups = await this.scanActiveTaskGroups(rootFolder);
    const existingObjects = await this.scanLongTermObjects(rootFolder);
    if (!sourceWorkspace && existingGroups.size === 0 && existingObjects.length === 0) {
      sourceWorkspace = createGuidedSampleWorkspace();
    }
    if (sourceWorkspace) {
      const objectIdByTitle = new Map(
        (sourceWorkspace.longTermObjects ?? []).map((object) => [object.title, object.id]),
      );
      for (const [index, column] of sourceWorkspace.storeColumns.entries()) {
        const poolFolder = `${rootFolder}/任务存储器/${taskFileStem(column.title)}`;
        await this.ensureFolder(poolFolder);
        const metadataPath = `${poolFolder}/${POOL_METADATA_FILE_NAME}`;
        if (!this.app.vault.getAbstractFileByPath(metadataPath)) {
          await this.app.vault.create(metadataPath, serializeTaskPoolMetadata({
            hint: column.hint,
            tone: column.tone,
            sortKey: index * 1000,
          }));
        }
      }
      const records = getTaskRecords(sourceWorkspace);
      for (const [index, record] of records.entries()) {
        if (existingGroups.has(record.task.id)) continue;
        const folder = getTaskFolder(rootFolder, record, sourceWorkspace);
        await this.ensureFolder(folder);
        const path = chooseStableMarkdownPath(
          folder,
          record.task.title,
          undefined,
          (candidate) => Boolean(this.app.vault.getAbstractFileByPath(candidate)),
          this.t("未命名待办"),
        );
        await this.app.vault.create(path, serializeTaskNote(record.task, {
          sortKey: index * 1000,
          objectId: record.task.object ? objectIdByTitle.get(record.task.object) : undefined,
        }));
      }
      const currentObjectIds = new Set(existingObjects.flatMap((entry) =>
        entry.object ? [entry.object.id] : []
      ));
      for (const [index, object] of (sourceWorkspace.longTermObjects ?? []).entries()) {
        if (currentObjectIds.has(object.id)) continue;
        const folder = `${rootFolder}/长期对象`;
        const path = chooseStableMarkdownPath(
          folder,
          object.title,
          undefined,
          (candidate) => Boolean(this.app.vault.getAbstractFileByPath(candidate)),
          this.t("未命名长期对象"),
        );
        await this.app.vault.create(path, serializeLongTermObjectNote(object, index * 1000));
      }
    }

    const storageRoot = `${rootFolder}/任务存储器`;
    const poolFolders = this.app.vault.getAllLoadedFiles().filter(
      (file): file is TFolder =>
        file instanceof TFolder && file.parent?.path === storageRoot,
    );
    for (const [index, poolFolder] of poolFolders.entries()) {
      const metadataPath = `${poolFolder.path}/${POOL_METADATA_FILE_NAME}`;
      if (!this.app.vault.getAbstractFileByPath(metadataPath)) {
        await this.app.vault.create(metadataPath, serializeTaskPoolMetadata({
          hint: this.t("从 Markdown 任务池同步"),
          tone: TASK_POOL_TONES[index % TASK_POOL_TONES.length],
          sortKey: index * 1000,
        }));
      }
    }

    await this.refreshFileIndex(false);
    const legacyOrder = new Map<string, number>();
    const legacyObjectIdByTitle = new Map<string, string>();
    if (sourceWorkspace) {
      getTaskRecords(sourceWorkspace).forEach((record, index) => legacyOrder.set(record.task.id, index * 1000));
      (sourceWorkspace.longTermObjects ?? []).forEach((object) => legacyObjectIdByTitle.set(object.title, object.id));
    }
    for (const [id, path] of this.taskPaths) {
      if (this.duplicateTaskPaths.has(id) || this.conflictDisplayTasks.has(id)) continue;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) continue;
      const content = await this.app.vault.read(file);
      const parsed = parseTaskNote(content, file.basename, file.path);
      if (!parsed) continue;
      const objectId = parsed.objectId ?? (parsed.object ? legacyObjectIdByTitle.get(parsed.object) : undefined);
      const task: TaskItem = {
        id,
        title: file.basename,
        detail: parsed.detail,
        source: parsed.linkedNotePath ? "笔记" : parsed.source,
        priority: parsed.priority,
        object: parsed.object,
        linkedNotePath: parsed.linkedNotePath,
        done: parsed.done,
      };
      const next = serializeTaskNote(task, {
        sortKey: parsed.sortKey || legacyOrder.get(id) || file.stat.ctime,
        objectId,
      });
      if (next !== content) await this.app.vault.modify(file, next);
    }
    const archivePrefix = `${rootFolder}/归档/`;
    for (const file of this.app.vault.getMarkdownFiles()) {
      if (!file.path.startsWith(archivePrefix)) continue;
      const content = await this.app.vault.read(file);
      const parsed = parseTaskNote(content, file.basename, file.path);
      if (!parsed) continue;
      const task: TaskItem = {
        id: parsed.id,
        title: file.basename,
        detail: parsed.detail,
        source: parsed.linkedNotePath ? "笔记" : parsed.source,
        priority: parsed.priority,
        object: parsed.object,
        linkedNotePath: parsed.linkedNotePath,
        done: parsed.done,
      };
      const next = serializeTaskNote(task, {
        sortKey: parsed.sortKey || file.stat.ctime,
        objectId: parsed.objectId ?? (
          parsed.object ? legacyObjectIdByTitle.get(parsed.object) : undefined
        ),
      });
      if (next !== content) await this.app.vault.modify(file, next);
    }
    for (const entry of await this.scanLongTermObjects(rootFolder)) {
      if (!entry.object) continue;
      const next = serializeLongTermObjectNote(
        entry.object,
        entry.sortKey || entry.file.stat.ctime,
      );
      if (next !== entry.content) await this.app.vault.modify(entry.file, next);
    }
    await this.refreshFileIndex(false);
    const canvasPath = `${rootFolder}/白板/${NATIVE_CANVAS_FILE_NAME}`;
    if (!this.app.vault.getAbstractFileByPath(canvasPath) && sourceWorkspace) {
      const oldCards = new Map(sourceWorkspace.canvasCards.map((card) => [card.id, card]));
      if (this.workspaceState) {
        this.workspaceState.canvasCards = this.workspaceState.canvasCards.map((card) => {
          const old = oldCards.get(card.id);
          return old ? { ...card, x: old.x, y: old.y, tone: old.tone } : card;
        });
        this.workspaceState.canvasConnections = sourceWorkspace.canvasConnections ?? [];
        this.workspaceState.canvasTextNotes = sourceWorkspace.canvasTextNotes ?? [];
        await this.syncNativeCanvas();
      }
    }
    this.settings.fileSchemaVersion = FILE_SCHEMA_VERSION;
  }

  private assertTaskIsWritable(taskId: string): void {
    const displayConflict = this.conflictDisplayTasks.get(taskId);
    if (displayConflict) {
      throw new Error(`${this.t("任务 ID 冲突，已停止管理：")} ${displayConflict.paths.join(" · ")}`);
    }
    const paths = this.duplicateTaskPaths.get(taskId);
    if (paths) {
      throw new Error(`${this.t("任务 ID 冲突，已停止管理：")} ${paths.join(" · ")}`);
    }
  }

  private targetFolder(target: NoteTaskTarget): string {
    const rootFolder = normalizeTaskFolder(this.settings.taskNotesFolder);
    if (target.location === "canvas") return `${rootFolder}/白板`;
    if (target.location === "inbox") return `${rootFolder}/缓存工作台/收集箱`;
    if (target.location === "todo") return `${rootFolder}/缓存工作台/待办列表`;
    if (target.location === "cache") return `${rootFolder}/缓存工作台/缓存列表`;
    const storageRoot = `${rootFolder}/任务存储器`;
    if (!target.columnId?.startsWith(`${storageRoot}/`)) {
      throw new Error(this.t("目标任务池不可用"));
    }
    return target.columnId;
  }

  private createFileTask(task: TaskItem, target: NoteTaskTarget): Promise<void> {
    return this.enqueueMarkdownMutation(async () => {
      await this.refreshFileIndex(false);
      this.assertTaskIsWritable(task.id);
      if (this.taskPaths.has(task.id)) {
        throw new Error(this.t("任务 ID 已经存在"));
      }
      const folder = this.targetFolder(target);
      await this.ensureFolder(folder);
      const path = chooseStableMarkdownPath(
        folder,
        task.title,
        undefined,
        (candidate) => Boolean(this.app.vault.getAbstractFileByPath(candidate)),
        this.t("未命名待办"),
      );
      await this.app.vault.create(path, serializeTaskNote(task, {
        sortKey: Date.now(),
        objectId: target.objectId,
      }));
      await this.refreshFileIndex();
      if (target.location === "canvas") await this.syncNativeCanvasAfterTaskCommit();
    });
  }

  private updateFileTask(task: TaskItem): Promise<void> {
    return this.enqueueMarkdownMutation(async () => {
      await this.refreshFileIndex(false);
      this.assertTaskIsWritable(task.id);
      const oldPath = this.taskPaths.get(task.id);
      if (!oldPath) throw new Error(this.t("找不到任务 Markdown 文件"));
      const abstractFile = this.app.vault.getAbstractFileByPath(oldPath);
      if (!(abstractFile instanceof TFile)) throw new Error(this.t("任务 Markdown 文件不可用"));
      let file: TFile = abstractFile;
      const metadata = this.taskMetadata.get(task.id) ?? { sortKey: file.stat.ctime };
      const folder = file.parent?.path ?? "";
      const targetPath = chooseStableMarkdownPath(
        folder,
        task.title,
        file.path,
        (candidate) => Boolean(this.app.vault.getAbstractFileByPath(candidate)),
        this.t("未命名待办"),
      );
      if (targetPath !== file.path) {
        await this.app.vault.rename(file, targetPath);
        const moved = this.app.vault.getAbstractFileByPath(targetPath);
        if (moved instanceof TFile) file = moved;
      }
      await this.app.vault.modify(file, serializeTaskNote(task, metadata));
      await this.refreshFileIndex();
      if (file.path.startsWith(`${normalizeTaskFolder(this.settings.taskNotesFolder)}/白板/`)) {
        await this.syncNativeCanvasAfterTaskCommit();
      }
    });
  }

  private createFilePool(column: WorkspaceState["storeColumns"][number]): Promise<void> {
    return this.enqueueMarkdownMutation(async () => {
      const rootFolder = normalizeTaskFolder(this.settings.taskNotesFolder);
      const folder = `${rootFolder}/任务存储器/${taskFileStem(column.title)}`;
      if (this.app.vault.getAbstractFileByPath(folder)) {
        throw new Error(this.t("同名任务池已经存在"));
      }
      await this.ensureFolder(folder);
      await this.app.vault.create(`${folder}/${POOL_METADATA_FILE_NAME}`, serializeTaskPoolMetadata({
        hint: column.hint,
        tone: column.tone,
        sortKey: Date.now(),
      }));
      await this.refreshFileIndex();
    });
  }

  private createFileLongTermObject(object: LongTermObject): Promise<void> {
    return this.enqueueMarkdownMutation(async () => {
      const folder = `${normalizeTaskFolder(this.settings.taskNotesFolder)}/长期对象`;
      const path = chooseStableMarkdownPath(
        folder,
        object.title,
        undefined,
        (candidate) => Boolean(this.app.vault.getAbstractFileByPath(candidate)),
        this.t("未命名长期对象"),
      );
      await this.app.vault.create(path, serializeLongTermObjectNote(object, Date.now()));
      await this.refreshFileIndex();
    });
  }

  private updateFileCanvasLayout(
    layout: Pick<WorkspaceState, "canvasCards" | "canvasConnections" | "canvasTextNotes">,
  ): Promise<void> {
    return this.enqueueMarkdownMutation(async () => {
      if (!this.workspaceState) return;
      const cards = new Map(layout.canvasCards.map((card) => [card.id, card]));
      this.workspaceState.canvasCards = this.workspaceState.canvasCards.map((card) => {
        const next = cards.get(card.id);
        return next ? { ...card, x: next.x, y: next.y, tone: next.tone } : card;
      });
      const validIds = new Set(this.workspaceState.canvasCards.map((card) => card.id));
      this.workspaceState.canvasConnections = (layout.canvasConnections ?? []).filter(
        (connection) => validIds.has(connection.fromId) && validIds.has(connection.toId),
      );
      this.workspaceState.canvasTextNotes = clone(layout.canvasTextNotes ?? []);
      await this.syncNativeCanvas();
    });
  }

  private async setTransparentUi(value: boolean): Promise<void> {
    this.settings.transparentUi = value;
    if (this.workspaceState) this.workspaceState.transparentUi = value;
    await this.persistWorkspace();
  }

  private moveFileTaskById(taskId: string, target: NoteTaskTarget): Promise<boolean> {
    return this.enqueueMarkdownMutation(async () => {
      await this.refreshFileIndex(false);
      this.assertTaskIsWritable(taskId);
      const path = this.taskPaths.get(taskId);
      if (!path) return false;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return false;
      const wasCanvas = path.startsWith(`${normalizeTaskFolder(this.settings.taskNotesFolder)}/白板/`);
      const folder = this.targetFolder(target);
      await this.ensureFolder(folder);
      const targetPath = `${folder}/${file.name}`;
      const occupied = this.app.vault.getAbstractFileByPath(targetPath);
      if (occupied && targetPath !== file.path) {
        throw new Error(this.t("目标位置已经存在同名文件"));
      }
      if (targetPath !== file.path) await this.app.vault.rename(file, targetPath);
      const moved = this.app.vault.getAbstractFileByPath(targetPath);
      if (moved instanceof TFile) {
        const content = await this.app.vault.read(moved);
        const parsed = parseTaskNote(content, moved.basename, moved.path);
        const current = this.workspaceState
          ? getTaskRecords(this.workspaceState).find((record) => record.task.id === taskId)?.task
          : undefined;
        if (parsed && current) {
          await this.app.vault.modify(moved, serializeTaskNote(current, {
            sortKey: Date.now(),
            objectId: this.taskMetadata.get(taskId)?.objectId,
          }));
        }
      }
      await this.refreshFileIndex();
      if (wasCanvas || target.location === "canvas") {
        await this.syncNativeCanvasAfterTaskCommit();
      }
      return true;
    });
  }

  private async moveFileTaskNote(path: string, target: NoteTaskTarget): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) throw new Error(this.t("笔记文件不可用"));
    const content = await this.app.vault.read(file);
    const parsed = parseTaskNote(content, file.basename, file.path);
    if (parsed) {
      await this.moveFileTaskById(parsed.id, target);
      return;
    }
    const taskId = createManagedTaskId();
    await this.enqueueMarkdownMutation(async () => {
      const task: TaskItem = {
        id: taskId,
        title: file.basename,
        detail: content.trim(),
        source: "文本",
        priority: "P3",
      };
      await this.app.vault.modify(file, serializeTaskNote(task, { sortKey: Date.now(), objectId: target.objectId }));
      await this.refreshFileIndex(false);
    });
    await this.moveFileTaskById(taskId, target);
  }

  private archiveFileTask(taskId: string): Promise<void> {
    return this.enqueueMarkdownMutation(async () => {
      await this.refreshFileIndex(false);
      this.assertTaskIsWritable(taskId);
      const path = this.taskPaths.get(taskId);
      if (!path) return;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return;
      const wasCanvas = path.startsWith(`${normalizeTaskFolder(this.settings.taskNotesFolder)}/白板/`);
      const folder = `${normalizeTaskFolder(this.settings.taskNotesFolder)}/归档/${archiveDateFolder()}`;
      await this.ensureFolder(folder);
      const targetPath = chooseStableMarkdownPath(
        folder,
        file.basename,
        undefined,
        (candidate) => Boolean(this.app.vault.getAbstractFileByPath(candidate)),
        this.t("未命名待办"),
      );
      await this.app.vault.rename(file, targetPath);
      await this.refreshFileIndex();
      if (wasCanvas) await this.syncNativeCanvasAfterTaskCommit();
    });
  }

  private deleteFileTask(taskId: string): Promise<void> {
    return this.enqueueMarkdownMutation(async () => {
      await this.refreshFileIndex(false);
      this.assertTaskIsWritable(taskId);
      const path = this.taskPaths.get(taskId);
      if (!path) return;
      const file = this.app.vault.getAbstractFileByPath(path);
      if (!(file instanceof TFile)) return;
      const wasCanvas = path.startsWith(`${normalizeTaskFolder(this.settings.taskNotesFolder)}/白板/`);
      await this.app.fileManager.trashFile(file);
      await this.refreshFileIndex();
      if (wasCanvas) await this.syncNativeCanvasAfterTaskCommit();
    });
  }

  private async loadCanvasLayoutOnly(path: string): Promise<void> {
    if (!this.workspaceState) return;
    const whiteboardPaths = new Map<string, string>();
    for (const card of this.workspaceState.canvasCards) {
      const taskPath = this.taskPaths.get(card.id);
      if (taskPath) whiteboardPaths.set(taskPath, card.id);
    }
    const layout = await this.readCanvasLayoutFromFile(path, whiteboardPaths);
    this.workspaceState.canvasCards = this.workspaceState.canvasCards.map((card) => {
      const next = layout.cards.get(card.id);
      return next ? { ...card, ...next, tone: next.tone as "sage" | "cream" | "lavender" | "blue" } : card;
    });
    this.workspaceState.canvasConnections = layout.connections;
    this.workspaceState.canvasTextNotes = layout.textNotes;
    await this.syncNativeCanvas();
    this.emitWorkspace();
  }

  private isArchivedMarkdownPath(path: string): boolean {
    const folder = normalizeTaskFolder(this.settings.taskNotesFolder);
    return Boolean(folder) && path.startsWith(`${folder}/归档/`);
  }

  private isNativeWhiteboardPath(path: string): boolean {
    return path.endsWith(".canvas");
  }

  private isTaskFolderNotePath(path: string): boolean {
    const folder = normalizeTaskFolder(this.settings.taskNotesFolder);
    return (
      Boolean(folder) &&
      path.startsWith(`${folder}/`) &&
      !this.isArchivedMarkdownPath(path) &&
      !this.isNativeWhiteboardPath(path) &&
      !path.startsWith(`${folder}/长期对象/`)
    );
  }

  private isMovableTaskFolderNotePath(path: string): boolean {
    const folder = normalizeTaskFolder(this.settings.taskNotesFolder);
    return (
      this.isTaskFolderNotePath(path) ||
      (Boolean(folder) && path.startsWith(`${folder}/白板/`) && path.endsWith(".md"))
    );
  }

  private searchNotes(query: string): Promise<LinkedNoteSuggestion[]> {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const files = this.app.vault
      .getMarkdownFiles()
      .filter((file) => {
        if (!normalizedQuery) return this.isMovableTaskFolderNotePath(file.path);
        return `${file.basename} ${file.path}`
          .toLocaleLowerCase()
          .includes(normalizedQuery);
      })
      .slice(0, 40);

    return Promise.resolve(
      files.map((file) => ({
        path: file.path,
        title: file.basename,
        isTaskFolderNote: this.isMovableTaskFolderNotePath(file.path),
      })),
    );
  }

  private async openNote(path: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) {
      await this.app.workspace.getLeaf("tab").openFile(file);
    }
  }

  private async openTaskNote(taskId: string): Promise<void> {
    let path = this.taskPaths.get(taskId);

    if (!path) {
      await this.refreshFileIndex(false);
      path = this.taskPaths.get(taskId);
    }

    if (!path) {
      throw new Error(this.t("找不到任务 {taskId} 对应的 Markdown 笔记", { taskId }));
    }

    await this.openNote(path);
  }

  private async syncNativeCanvasAfterTaskCommit(): Promise<void> {
    try {
      await this.syncNativeCanvas();
    } catch (error) {
      console.error("四层待办: task saved but Canvas update failed", error);
      new Notice(this.t("任务位置已经保存，但 Canvas 布局更新失败；任务不会移回。"));
    }
  }

  private async syncNativeCanvas(): Promise<void> {
    if (!this.workspaceState) {
      throw new Error(this.t("白板尚未初始化"));
    }

    const folder = normalizeTaskFolder(this.settings.taskNotesFolder);
    if (!this.taskFolderIsUsable(folder)) {
      throw new Error(this.t("待办笔记文件夹不可用"));
    }

    await this.ensureTaskFolderStructure(folder);
    const nativeCanvasFolder = `${folder}/白板`;
    const nodes: NativeCanvasNode[] = [];
    const nodeIds = new Set<string>();

    for (const card of this.workspaceState.canvasCards) {
      const taskPath = this.taskPaths.get(card.id);
      if (!taskPath) {
        throw new Error(
          this.t("白板卡片“{title}”缺少 Markdown 文件", { title: card.title }),
        );
      }
      nodes.push({
        id: card.id,
        type: "file",
        file: taskPath,
        x: card.x,
        y: card.y,
        width: 250,
        height: 142,
        color: nativeCanvasColor(card.tone),
      });
      nodeIds.add(card.id);
    }

    for (const note of this.workspaceState.canvasTextNotes ?? []) {
      nodes.push({
        id: note.id,
        type: "text",
        text: note.content,
        x: note.x,
        y: note.y,
        width: 220,
        height: 100,
        color: "3",
      });
      nodeIds.add(note.id);
    }

    const edges: NativeCanvasEdge[] = (this.workspaceState.canvasConnections ?? [])
      .filter(
        (connection) =>
          nodeIds.has(connection.fromId) && nodeIds.has(connection.toId),
      )
      .map((connection) => ({
        id: connection.id,
        fromNode: connection.fromId,
        fromSide: "right",
        toNode: connection.toId,
        toSide: "left",
        toEnd: "arrow",
      }));
    const content = JSON.stringify({ nodes, edges }, null, 2);
    const path = `${nativeCanvasFolder}/${NATIVE_CANVAS_FILE_NAME}`;
    const existing = this.app.vault.getAbstractFileByPath(path);

    if (existing instanceof TFile) {
      const current = await this.app.vault.read(existing);
      if (current === content) return;
      await this.app.vault.modify(existing, content);
    } else {
      await this.app.vault.create(path, content);
    }
  }

  private async openNativeCanvas(): Promise<void> {
    const folder = normalizeTaskFolder(this.settings.taskNotesFolder);
    if (!this.taskFolderIsUsable(folder)) {
      throw new Error(this.t("待办笔记文件夹不可用"));
    }

    const path = `${folder}/白板/${NATIVE_CANVAS_FILE_NAME}`;
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      await this.syncNativeCanvas();
      file = this.app.vault.getAbstractFileByPath(path);
    }
    if (!(file instanceof TFile)) {
      throw new Error(this.t("无法创建原生 Canvas"));
    }
    await this.app.workspace.getLeaf("tab").openFile(file);
  }


  private listNativeCanvases(): Promise<NativeCanvasFile[]> {
    const folder = normalizeTaskFolder(this.settings.taskNotesFolder);
    if (!this.taskFolderIsUsable(folder)) return Promise.resolve([]);

    const whiteboardFolder = `${folder}/白板/`;
    return Promise.resolve(
      this.app.vault
        .getFiles()
        .filter(
          (file) =>
            file.extension === "canvas" && file.path.startsWith(whiteboardFolder),
        )
        .map((file) => ({ path: file.path, title: file.basename }))
        .sort((left, right) => left.title.localeCompare(right.title, "zh-Hans-CN")),
    );
  }


  private async activateView(reveal = true): Promise<void> {
    try {
      const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE)[0];
      let leaf: WorkspaceLeaf;

      if (existing) {
        leaf = existing;
      } else {
        leaf = this.app.workspace.getLeaf("tab");
        await leaf.setViewState({ type: VIEW_TYPE, active: true });
      }

      if (reveal) {
        this.app.workspace.setActiveLeaf(leaf, { focus: true });
      }
    } catch (error) {
      console.error("四层待办: activateView error", error);
      throw error;
    }
  }
}
