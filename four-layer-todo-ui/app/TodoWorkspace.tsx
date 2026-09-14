"use client";
import React from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

export type TaskItem = {
  id: string;
  title: string;
  detail: string;
  source: "笔记" | "文本";
  linkedNotePath?: string;
  meta?: string;
  priority?: "P2" | "P3" | "P4" | "P5";
  object?: string;
};

type CanvasCard = TaskItem & {
  x: number;
  y: number;
  tone: "sage" | "cream" | "lavender" | "blue";
  parent?: string;
  done?: boolean;
};

type CanvasConnection = {
  id: string;
  fromId: string;
  toId: string;
};

type CanvasTextNote = {
  id: string;
  content: string;
  x: number;
  y: number;
};

type StoreColumn = {
  id: string;
  title: string;
  hint: string;
  tone: string;
  tasks: TaskItem[];
};

type TaskOrigin =
  | { kind: "canvas" }
  | { kind: "inbox" }
  | { kind: "todo" }
  | { kind: "cache" }
  | { kind: "storage"; columnId: string };

type MoveDestination =
  | "whiteboard"
  | "workbench"
  | "storage"
  | "archive"
  | "delete"
  | "unlink";

type PendingMove = {
  task: TaskItem;
  origin: TaskOrigin;
  destination: MoveDestination;
};

export type LongTermObject = {
  id: string;
  kind: "兴趣" | "目标" | "长期想法";
  title: string;
  description: string;
  activity: string;
  tone: string;
  relatedTaskIds: string[];
};

export type LinkedNoteSuggestion = {
  path: string;
  title: string;
  isTaskFolderNote: boolean;
};

export type NoteTaskTarget = {
  location: "canvas" | "inbox" | "todo" | "cache" | "storage";
  columnId?: string;
  objectId?: string;
};

export type NativeCanvasFile = {
  path: string;
  title: string;
};

export type WorkspaceState = {
  canvasCards: CanvasCard[];
  canvasConnections?: CanvasConnection[];
  canvasTextNotes?: CanvasTextNote[];
  longTermObjects?: LongTermObject[];
  inbox: TaskItem[];
  todo: TaskItem[];
  cache: TaskItem[];
  storeColumns: StoreColumn[];
  transparentUi?: boolean;
};

export type WorkspaceStorage = {
  load: () => Promise<Partial<WorkspaceState> | null>;
  save: (state: WorkspaceState) => Promise<void> | void;
  subscribe?: (listener: (state: Partial<WorkspaceState>) => void) => () => void;
  archiveTask?: (taskId: string) => Promise<void> | void;
  deleteTask?: (taskId: string) => Promise<void> | void;
  searchNotes?: (query: string) => Promise<LinkedNoteSuggestion[]>;
  moveTaskNote?: (path: string, target: NoteTaskTarget) => Promise<void> | void;
  openNote?: (path: string) => Promise<void> | void;
  openNativeCanvas?: () => Promise<void> | void;
  listNativeCanvases?: () => Promise<NativeCanvasFile[]>;
  loadNativeCanvas?: (path: string) => Promise<void> | void;
};

const initialCanvas: CanvasCard[] = [
  {
    id: "canvas-main",
    title: "制作 Obsidian 待办插件",
    detail: "完成手动交互页面，并把确认后的模型制作成插件。",
    source: "笔记",
    meta: "项目主任务",
    x: 315,
    y: 92,
    tone: "sage",
  },
  {
    id: "canvas-structure",
    title: "确定白板卡片结构",
    detail: "笔记、文本块与短文本卡片共存。",
    source: "文本",
    meta: "拆解任务",
    x: 72,
    y: 300,
    tone: "cream",
    parent: "canvas-main",
  },
  {
    id: "canvas-cache",
    title: "验证缓存现场恢复",
    detail: "保存位置、关系、进度与最后聚焦点。",
    source: "文本",
    meta: "正在处理",
    x: 348,
    y: 340,
    tone: "lavender",
    parent: "canvas-main",
  },
  {
    id: "canvas-storage",
    title: "设计任务存储器",
    detail: "采用可扩展任务池的 Kanban 视图。",
    source: "笔记",
    meta: "下一步",
    x: 642,
    y: 290,
    tone: "blue",
    parent: "canvas-main",
  },
];

const initialCanvasConnections: CanvasConnection[] = [
  { id: "connection-main-structure", fromId: "canvas-main", toId: "canvas-structure" },
  { id: "connection-main-cache", fromId: "canvas-main", toId: "canvas-cache" },
  { id: "connection-main-storage", fromId: "canvas-main", toId: "canvas-storage" },
];

const initialInbox: TaskItem[] = [
  {
    id: "inbox-1",
    title: "也许可以加入一个任务关联图",
    detail: "刚记录的想法，尚未判断进入哪里。",
    source: "文本",
  },
  {
    id: "inbox-2",
    title: "整理周末想看的纪录片",
    detail: "来自随手记录，可能进入任务存储器。",
    source: "文本",
  },
  {
    id: "inbox-3",
    title: "研究白板在手机上的交互",
    detail: "需要判断是否属于当前版本。",
    source: "笔记",
  },
];

const initialTodo: TaskItem[] = [
  {
    id: "todo-1",
    title: "制作待办页面的静态原型",
    detail: "来自当前主线，适合近期开始。",
    source: "笔记",
    meta: "系统推荐",
  },
  {
    id: "todo-2",
    title: "给任务文本增加稳定块 ID",
    detail: "Task List Kanban 的做法值得验证。",
    source: "文本",
    meta: "手动加入",
  },
  {
    id: "todo-3",
    title: "确定插件数据保存边界",
    detail: "内容留在 Obsidian，插件保存位置与布局。",
    source: "笔记",
    meta: "系统推荐",
  },
];

const initialCache: TaskItem[] = [
  {
    id: "cache-1",
    title: "任务推荐算法草稿",
    detail: "已写到资格过滤，暂缺展示公平性部分。",
    source: "笔记",
    meta: "完成约 45%",
  },
  {
    id: "cache-2",
    title: "移动端白板手势",
    detail: "已经比较拖动与长按，等待真机验证。",
    source: "文本",
    meta: "等待设备",
  },
];

const initialStore: StoreColumn[] = [
  {
    id: "mainline",
    title: "主线任务",
    hint: "持续推进的核心方向",
    tone: "green",
    tasks: [
      {
        id: "store-1",
        title: "准备下周的产品演示",
        detail: "完善讲解顺序并检查演示数据。",
        source: "笔记",
        priority: "P5",
        object: "建立稳定的工作节奏",
      },
      {
        id: "store-2",
        title: "更新个人作品集",
        detail: "补充最近完成的两个案例。",
        source: "笔记",
        priority: "P4",
        object: "持续学习",
      },
    ],
  },
  {
    id: "waiting",
    title: "等待处理",
    hint: "条件未满足或等待恢复",
    tone: "amber",
    tasks: [
      {
        id: "store-3",
        title: "确认社区活动场地",
        detail: "方案已经提交，等待场地方回复。",
        source: "笔记",
        priority: "P4",
        object: "社区活动",
      },
      {
        id: "store-4",
        title: "组装新书架",
        detail: "等待配件快递到货。",
        source: "文本",
        priority: "P3",
      },
    ],
  },
  {
    id: "possible",
    title: "可能处理",
    hint: "值得保留，但暂不承诺",
    tone: "blue",
    tasks: [
      {
        id: "store-5",
        title: "阅读《设计心理学》",
        detail: "先保存书目，不设日期。",
        source: "文本",
        priority: "P2",
        object: "交互设计",
      },
      {
        id: "store-6",
        title: "整理一次旅行的照片",
        detail: "选出值得保留和分享的照片。",
        source: "笔记",
        priority: "P2",
        object: "城市摄影",
      },
      {
        id: "store-7",
        title: "尝试一周无纸化记账",
        detail: "观察是否能降低日常记录负担。",
        source: "文本",
        priority: "P2",
        object: "工具应该减少决策负担",
      },
    ],
  },
  {
    id: "problems",
    title: "长期问题",
    hint: "持续思考，不要求立即完成",
    tone: "violet",
    tasks: [
      {
        id: "store-8",
        title: "怎样建立可持续的学习习惯？",
        detail: "持续观察环境、节奏与反馈的影响。",
        source: "笔记",
        priority: "P3",
        object: "持续学习",
      },
      {
        id: "store-9",
        title: "任务工具怎样减少决策负担？",
        detail: "在实际使用中持续检验。",
        source: "文本",
        priority: "P3",
        object: "工具应该减少决策负担",
      },
    ],
  },
];

const initialLongTermObjects: LongTermObject[] = [
  {
    id: "object-photo",
    kind: "兴趣",
    title: "城市摄影",
    description: "观察街道、光线和日常生活。",
    activity: "最近关联：整理旅行照片",
    tone: "mint",
    relatedTaskIds: ["store-6"],
  },
  {
    id: "object-health",
    kind: "目标",
    title: "维持身体健康",
    description: "睡眠、饮食、运动与长期精力。",
    activity: "最近关联：恢复每周步行",
    tone: "peach",
    relatedTaskIds: [],
  },
  {
    id: "object-learning",
    kind: "长期想法",
    title: "持续学习",
    description: "寻找能够长期维持的节奏、环境和反馈。",
    activity: "最近关联：设计每周回顾",
    tone: "lilac",
    relatedTaskIds: ["store-2", "store-8"],
  },
  {
    id: "object-food",
    kind: "兴趣",
    title: "烹饪与食物",
    description: "尝试家常菜、季节食材和简单搭配。",
    activity: "最近关联：记录三道常做菜",
    tone: "sky",
    relatedTaskIds: [],
  },
  {
    id: "object-rhythm",
    kind: "目标",
    title: "建立稳定的工作节奏",
    description: "在专注、休息和复盘之间取得平衡。",
    activity: "最近关联：安排每周回顾",
    tone: "mint",
    relatedTaskIds: ["store-1", "canvas-main"],
  },
  {
    id: "object-tools",
    kind: "长期想法",
    title: "工具应该减少决策负担",
    description: "系统负责过滤，用户保留最终选择。",
    activity: "最近关联：任务推荐算法草稿",
    tone: "lilac",
    relatedTaskIds: ["store-7", "store-9", "cache-1"],
  },
];

const poolTones = ["green", "amber", "blue", "violet"];
const CANVAS_CARD_WIDTH = 250;
const CANVAS_CARD_HEIGHT = 170;
const CANVAS_TEXT_NOTE_WIDTH = 220;
const CANVAS_TEXT_NOTE_HEIGHT = 100;
const CANVAS_CARD_GAP = 22;

type CanvasBounds = {
  width: number;
  height: number;
};

function positionsOverlap(
  first: { x: number; y: number; width: number; height: number },
  second: { x: number; y: number; width: number; height: number },
): boolean {
  return (
    first.x < second.x + second.width + CANVAS_CARD_GAP &&
    first.x + first.width + CANVAS_CARD_GAP > second.x &&
    first.y < second.y + second.height + CANVAS_CARD_GAP &&
    first.y + first.height + CANVAS_CARD_GAP > second.y
  );
}

function canvasCardPositionIsAvailable(
  x: number,
  y: number,
  cards: CanvasCard[],
  textNotes: CanvasTextNote[],
): boolean {
  const candidate = {
    x,
    y,
    width: CANVAS_CARD_WIDTH,
    height: CANVAS_CARD_HEIGHT,
  };
  return ![
    ...cards.map((card) => ({
      x: card.x,
      y: card.y,
      width: CANVAS_CARD_WIDTH,
      height: CANVAS_CARD_HEIGHT,
    })),
    ...textNotes.map((note) => ({
      x: note.x,
      y: note.y,
      width: CANVAS_TEXT_NOTE_WIDTH,
      height: CANVAS_TEXT_NOTE_HEIGHT,
    })),
  ].some((item) => positionsOverlap(candidate, item));
}

function findAvailableCanvasCardPosition(
  cards: CanvasCard[],
  textNotes: CanvasTextNote[],
  bounds?: CanvasBounds,
): { x: number; y: number } {
  const width = Math.max(bounds?.width ?? 980, CANVAS_CARD_WIDTH + 56);
  const height = Math.max(bounds?.height ?? 680, CANVAS_CARD_HEIGHT + 140);
  const maxX = Math.max(28, width - CANVAS_CARD_WIDTH - 28);
  const maxY = Math.max(96, height - CANVAS_CARD_HEIGHT - 28);

  for (let y = 96; y <= maxY; y += CANVAS_CARD_HEIGHT + CANVAS_CARD_GAP) {
    for (let x = 28; x <= maxX; x += CANVAS_CARD_WIDTH + CANVAS_CARD_GAP) {
      if (canvasCardPositionIsAvailable(x, y, cards, textNotes)) {
        return { x, y };
      }
    }
  }

  return {
    x: Math.max(28, maxX - ((cards.length % 3) * 18)),
    y: Math.max(96, maxY - ((cards.length % 2) * 18)),
  };
}

function resolveCanvasCardOverlaps(
  cards: CanvasCard[],
  textNotes: CanvasTextNote[],
  bounds?: CanvasBounds,
): CanvasCard[] {
  const placedCards: CanvasCard[] = [];

  return cards.map((card) => {
    if (canvasCardPositionIsAvailable(card.x, card.y, placedCards, textNotes)) {
      placedCards.push(card);
      return card;
    }

    const position = findAvailableCanvasCardPosition(
      placedCards,
      textNotes,
      bounds,
    );
    const movedCard = { ...card, ...position };
    placedCards.push(movedCard);
    return movedCard;
  });
}

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function Icon({ children }: { children: React.ReactNode }) {
  return <span aria-hidden="true">{children}</span>;
}

function TaskAddActions({
  onCreate,
  onLink,
}: {
  onCreate: () => void;
  onLink: () => void;
}) {
  return (
    <div className="task-add-actions">
      <button
        className="task-create-button"
        onClick={onCreate}
        aria-label="创建待办"
        title="创建待办"
      >
        <Icon>＋</Icon>
      </button>
      <button
        className="task-link-button"
        onClick={onLink}
        aria-label="链接笔记"
        title="链接笔记"
      >
        <Icon>⛓</Icon>
      </button>
    </div>
  );
}

function destinationLabel(destination: MoveDestination) {
  if (destination === "whiteboard") return "白板";
  if (destination === "workbench") return "缓存工作台";
  if (destination === "archive") return "归档";
  if (destination === "delete") return "删除";
  if (destination === "unlink") return "取消链接";
  return "任务存储器";
}

function getConnectionCoordinates(from: CanvasCard, to: CanvasCard) {
  const cardWidth =
    typeof window !== "undefined" && window.matchMedia("(max-width: 700px)").matches
      ? 210
      : 250;
  const cardHeight = 142;
  const fromCenterX = from.x + cardWidth / 2;
  const fromCenterY = from.y + cardHeight / 2;
  const toCenterX = to.x + cardWidth / 2;
  const toCenterY = to.y + cardHeight / 2;
  const deltaX = toCenterX - fromCenterX;
  const deltaY = toCenterY - fromCenterY;
  const distance = Math.hypot(deltaX, deltaY);

  if (!distance) return null;

  const edgeFactor = 1 / Math.max(Math.abs(deltaX) / (cardWidth / 2), Math.abs(deltaY) / (cardHeight / 2));
  return {
    x1: fromCenterX + deltaX * edgeFactor,
    y1: fromCenterY + deltaY * edgeFactor,
    x2: toCenterX - deltaX * edgeFactor,
    y2: toCenterY - deltaY * edgeFactor,
  };
}

export function TodoWorkspace(
  {
    storage,
    brandIconSrc,
  }: { storage?: WorkspaceStorage; brandIconSrc?: string } = {},
) {
  const [flipped, setFlipped] = useState(false);
  const [mode, setMode] = useState<"workspace" | "storage">("workspace");
  const [storageView, setStorageView] = useState<"tasks" | "objects">("tasks");
  const [selectedStoreColumnId, setSelectedStoreColumnId] = useState<
    string | null
  >(null);
  const [canvasCards, setCanvasCards] = useState<CanvasCard[]>([]);
  const [canvasConnections, setCanvasConnections] = useState<CanvasConnection[]>([]);
  const [canvasTextNotes, setCanvasTextNotes] = useState<CanvasTextNote[]>([]);
  const [longTermObjects, setLongTermObjects] = useState<LongTermObject[]>([]);
  const [inbox, setInbox] = useState<TaskItem[]>([]);
  const [todo, setTodo] = useState<TaskItem[]>([]);
  const [cache, setCache] = useState<TaskItem[]>([]);
  const [storeColumns, setStoreColumns] = useState<StoreColumn[]>([]);
  const [toast, setToast] = useState("");
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDetail, setNewTaskDetail] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [addingTextNote, setAddingTextNote] = useState(false);
  const [newTextNoteContent, setNewTextNoteContent] = useState("");
  const [textNotePosition, setTextNotePosition] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [editingTextNoteId, setEditingTextNoteId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [addingPool, setAddingPool] = useState(false);
  const [newPoolTitle, setNewPoolTitle] = useState("");
  const [addingLongTermObject, setAddingLongTermObject] = useState(false);
  const [newLongTermObjectTitle, setNewLongTermObjectTitle] = useState("");
  const [newLongTermObjectKind, setNewLongTermObjectKind] =
    useState<LongTermObject["kind"]>("长期想法");
  const [newLongTermObjectDescription, setNewLongTermObjectDescription] =
    useState("");
  const [addingRelatedTaskTo, setAddingRelatedTaskTo] = useState<string | null>(
    null,
  );
  const [newRelatedTaskTitle, setNewRelatedTaskTitle] = useState("");
  const [newRelatedTaskDetail, setNewRelatedTaskDetail] = useState("");
  const [newRelatedTaskPoolId, setNewRelatedTaskPoolId] = useState("");
  const [noteTaskTarget, setNoteTaskTarget] = useState<NoteTaskTarget | null>(
    null,
  );
  const [noteSearch, setNoteSearch] = useState("");
  const [noteSuggestions, setNoteSuggestions] = useState<
    LinkedNoteSuggestion[]
  >([]);
  const [loadingNoteSuggestions, setLoadingNoteSuggestions] = useState(false);
  const [loadingNativeCanvases, setLoadingNativeCanvases] = useState(false);
  const [nativeCanvasFiles, setNativeCanvasFiles] = useState<NativeCanvasFile[]>(
    [],
  );
  const [showNativeCanvasLoader, setShowNativeCanvasLoader] = useState(false);
  const [addingStoreTaskTo, setAddingStoreTaskTo] = useState<string | null>(null);
  const [newStoreTaskTitle, setNewStoreTaskTitle] = useState("");
  const [newStoreTaskDetail, setNewStoreTaskDetail] = useState("");
  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [transparentUi, setTransparentUi] = useState(false);
  const [canvasTool, setCanvasTool] = useState<"select" | "connect" | "text">("select");
  const [connectionStartId, setConnectionStartId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [deleteConnectionId, setDeleteConnectionId] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [dragging, setDragging] = useState<{
    id: string;
    kind: "card" | "text";
    offsetX: number;
    offsetY: number;
  } | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const normalizedCanvasLayoutRef = useRef(false);

  useEffect(() => {
    let active = true;
    const loadState = async () => {
      try {
        const savedState = storage ? await storage.load() : null;
        const parsed = savedState ??
          (JSON.parse(
            window.localStorage.getItem("four-layer-todo-local-v3") ?? "null",
          ) as Partial<WorkspaceState> | null);
        if (!active || !parsed) return;
        if (parsed.canvasCards) setCanvasCards(parsed.canvasCards);
        if (parsed.canvasConnections) setCanvasConnections(parsed.canvasConnections);
        if (parsed.canvasTextNotes) setCanvasTextNotes(parsed.canvasTextNotes);
        if (parsed.longTermObjects) setLongTermObjects(parsed.longTermObjects);
        if (parsed.inbox) setInbox(parsed.inbox);
        if (parsed.todo) setTodo(parsed.todo);
        if (parsed.cache) setCache(parsed.cache);
        if (parsed.storeColumns) setStoreColumns(parsed.storeColumns);
        if (typeof parsed.transparentUi === "boolean") setTransparentUi(parsed.transparentUi);
      } catch {
        window.localStorage.removeItem("four-layer-todo-local-v3");
      } finally {
        if (active) setHydrated(true);
      }
    };
    void loadState();
    return () => {
      active = false;
    };
  }, [storage]);

  useEffect(() => {
    if (!noteTaskTarget || !storage?.searchNotes) return;
    let active = true;
    setLoadingNoteSuggestions(true);
    const timeout = window.setTimeout(() => {
      void storage
        .searchNotes?.(noteSearch)
        .then((suggestions) => {
          if (!active) return;
          setNoteSuggestions(suggestions);
        })
        .catch(() => {
          if (active) setNoteSuggestions([]);
        })
        .finally(() => {
          if (active) setLoadingNoteSuggestions(false);
        });
    }, noteSearch ? 120 : 0);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [noteTaskTarget, noteSearch, storage]);

  useEffect(() => {
    if (!storage?.subscribe) return;

    return storage.subscribe((state) => {
      if (state.canvasCards) setCanvasCards(state.canvasCards);
      if (state.canvasConnections) setCanvasConnections(state.canvasConnections);
      if (state.canvasTextNotes) setCanvasTextNotes(state.canvasTextNotes);
      if (state.longTermObjects) setLongTermObjects(state.longTermObjects);
      if (state.inbox) setInbox(state.inbox);
      if (state.todo) setTodo(state.todo);
      if (state.cache) setCache(state.cache);
      if (state.storeColumns) setStoreColumns(state.storeColumns);
      if (typeof state.transparentUi === "boolean") {
        setTransparentUi(state.transparentUi);
      }
    });
  }, [storage]);

  useEffect(() => {
    if (!hydrated) return;
    const state = {
      canvasCards,
      canvasConnections,
      canvasTextNotes,
      longTermObjects,
      inbox,
      todo,
      cache,
      storeColumns,
      transparentUi,
    };
    if (storage) {
      void storage.save(state);
    } else {
      window.localStorage.setItem("four-layer-todo-local-v3", JSON.stringify(state));
    }
  }, [
    canvasCards,
    canvasConnections,
    canvasTextNotes,
    longTermObjects,
    inbox,
    todo,
    cache,
    storeColumns,
    transparentUi,
    hydrated,
    storage,
  ]);

  useEffect(() => {
    if (normalizedCanvasLayoutRef.current || !hydrated) return;
    const board = canvasRef.current?.getBoundingClientRect();
    if (!board) return;

    normalizedCanvasLayoutRef.current = true;
    setCanvasCards((cards) => resolveCanvasCardOverlaps(
      cards,
      canvasTextNotes,
      { width: board.width, height: board.height },
    ));
  }, [canvasTextNotes, hydrated]);

  useEffect(() => {
    const closeMenu = () => setOpenMenuId(null);
    window.addEventListener("click", closeMenu);
    return () => window.removeEventListener("click", closeMenu);
  }, []);

  useEffect(() => {
    const removeSelectedConnection = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;

      if (event.key === "Escape") {
        setConnectionStartId(null);
        setSelectedConnectionId(null);
        setDeleteConnectionId(null);
        return;
      }

      if (
        selectedConnectionId &&
        (event.key === "Backspace" || event.key === "Delete")
      ) {
        event.preventDefault();
        setCanvasConnections((connections) =>
          connections.filter((connection) => connection.id !== selectedConnectionId),
        );
        setSelectedConnectionId(null);
        setDeleteConnectionId(null);
      }
    };

    window.addEventListener("keydown", removeSelectedConnection);
    return () => window.removeEventListener("keydown", removeSelectedConnection);
  }, [selectedConnectionId]);

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2500);
  };

  const allTasks = useMemo(
    () => [
      ...canvasCards,
      ...inbox,
      ...todo,
      ...cache,
      ...storeColumns.flatMap((column) => column.tasks),
    ],
    [canvasCards, inbox, todo, cache, storeColumns],
  );

  const visibleStore = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return storeColumns;
    return storeColumns.map((column) => ({
      ...column,
      tasks: column.tasks.filter((task) =>
        `${task.title} ${task.detail} ${task.object ?? ""}`
          .toLowerCase()
          .includes(query),
      ),
    }));
  }, [search, storeColumns]);

  const selectedStoreColumn = useMemo(
    () => storeColumns.find((column) => column.id === selectedStoreColumnId),
    [selectedStoreColumnId, storeColumns],
  );
  const selectedStoreTasks = useMemo(() => {
    if (!selectedStoreColumn) return [];
    const query = search.trim().toLowerCase();
    if (!query) return selectedStoreColumn.tasks;
    return selectedStoreColumn.tasks.filter((task) =>
      `${task.title} ${task.detail} ${task.object ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [search, selectedStoreColumn]);

  const resolveOrigin = (taskId: string): TaskOrigin => {
    if (canvasCards.some((task) => task.id === taskId)) return { kind: "canvas" };
    if (inbox.some((task) => task.id === taskId)) return { kind: "inbox" };
    if (todo.some((task) => task.id === taskId)) return { kind: "todo" };
    if (cache.some((task) => task.id === taskId)) return { kind: "cache" };
    const column = storeColumns.find((item) =>
      item.tasks.some((task) => task.id === taskId),
    );
    return { kind: "storage", columnId: column?.id ?? storeColumns[0]?.id ?? "" };
  };

  const showPage = (destination: MoveDestination) => {
    if (destination === "whiteboard") {
      setMode("workspace");
      setFlipped(false);
    } else if (destination === "workbench") {
      setMode("workspace");
      setFlipped(true);
    } else if (destination === "storage") {
      setMode("storage");
      setStorageView("tasks");
    }
  };

  const beginMove = async (
    task: TaskItem,
    origin: TaskOrigin,
    destination: MoveDestination,
  ) => {
    setOpenMenuId(null);
    if (destination === "archive") {
      if (!storage?.archiveTask) {
        showToast("归档仅在 Obsidian 插件中可用");
        return;
      }
      try {
        await storage.archiveTask(task.id);
        removeFromOrigin(origin, task.id);
        showToast(`已将“${task.title}”归档`);
      } catch {
        showToast(`归档“${task.title}”失败`);
      }
      return;
    }
    if (destination === "delete") {
      try {
        await storage?.deleteTask?.(task.id);
        removeFromOrigin(origin, task.id);
        showToast(`已删除“${task.title}”`);
      } catch {
        showToast(`删除“${task.title}”失败`);
      }
      return;
    }
    if (destination === "unlink") {
      removeFromOrigin(origin, task.id);
      showToast(`已取消“${task.title}”的笔记链接`);
      return;
    }
    setPendingMove({ task, origin, destination });
    showPage(destination);
    showToast(`已选中“${task.title}”；请点击一个具体位置添加到${destinationLabel(destination)}。`);
  };

  const removeFromOrigin = (origin: TaskOrigin, taskId: string) => {
    if (origin.kind === "canvas") {
      setCanvasCards((items) => items.filter((item) => item.id !== taskId));
      setCanvasConnections((connections) =>
        connections.filter(
          (connection) =>
            connection.fromId !== taskId && connection.toId !== taskId,
        ),
      );
    } else if (origin.kind === "inbox") {
      setInbox((items) => items.filter((item) => item.id !== taskId));
    } else if (origin.kind === "todo") {
      setTodo((items) => items.filter((item) => item.id !== taskId));
    } else if (origin.kind === "cache") {
      setCache((items) => items.filter((item) => item.id !== taskId));
    } else {
      setStoreColumns((columns) =>
        columns.map((column) =>
          column.id === origin.columnId
            ? { ...column, tasks: column.tasks.filter((item) => item.id !== taskId) }
            : column,
        ),
      );
    }
  };

  const completeMove = (
    target:
      | { kind: "whiteboard" }
      | { kind: "workbench"; list: "inbox" | "todo" | "cache" }
      | { kind: "storage"; columnId: string },
  ) => {
    if (!pendingMove) return;
    removeFromOrigin(pendingMove.origin, pendingMove.task.id);
    const movedTask = { ...pendingMove.task, meta: `移动自${originLabel(pendingMove.origin)}` };

    if (target.kind === "whiteboard") {
      setCanvasCards((cards) => {
        const board = canvasRef.current?.getBoundingClientRect();
        const position = findAvailableCanvasCardPosition(
          cards,
          canvasTextNotes,
          board ? { width: board.width, height: board.height } : undefined,
        );
        return [...cards, { ...movedTask, ...position, tone: "sage" }];
      });
    } else if (target.kind === "workbench") {
      const setter =
        target.list === "inbox" ? setInbox : target.list === "todo" ? setTodo : setCache;
      setter((items) => [...items, movedTask]);
    } else {
      setStoreColumns((columns) =>
        columns.map((column) =>
          column.id === target.columnId
            ? {
                ...column,
                tasks: [
                  ...column.tasks,
                  { ...movedTask, priority: movedTask.priority ?? "P3" },
                ],
              }
            : column,
        ),
      );
    }
    showToast(`已添加到${targetName(target, storeColumns)}`);
    setPendingMove(null);
  };

  const addCanvasTask = () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    setCanvasCards((cards) => {
      const board = canvasRef.current?.getBoundingClientRect();
      const position = findAvailableCanvasCardPosition(
        cards,
        canvasTextNotes,
        board ? { width: board.width, height: board.height } : undefined,
      );
      return [
        ...cards,
        {
          id: createId("canvas"),
          title,
          detail: newTaskDetail.trim(),
          source: "文本",
          meta: "手动加入",
          ...position,
          tone: "cream",
        },
      ];
    });
    setNewTaskTitle("");
    setNewTaskDetail("");
    setAddingTask(false);
    showToast("任务已放入白板");
  };

  const addPool = () => {
    const title = newPoolTitle.trim();
    if (!title) return;
    setStoreColumns((columns) => [
      ...columns,
      {
        id: createId("pool"),
        title,
        hint: "自定义任务池",
        tone: poolTones[columns.length % poolTones.length],
        tasks: [],
      },
    ]);
    setNewPoolTitle("");
    setAddingPool(false);
  };

  const addLongTermObject = () => {
    const title = newLongTermObjectTitle.trim();
    if (!title) return;

    const toneByKind: Record<LongTermObject["kind"], LongTermObject["tone"]> = {
      兴趣: "mint",
      目标: "peach",
      长期想法: "lilac",
    };
    const object: LongTermObject = {
      id: createId("object"),
      kind: newLongTermObjectKind,
      title,
      description: newLongTermObjectDescription.trim() || "暂无说明。",
      activity: "等待关联任务",
      tone: toneByKind[newLongTermObjectKind],
      relatedTaskIds: [],
    };

    setLongTermObjects((objects) => [...objects, object]);
    setSelectedObjectId(object.id);
    setNewLongTermObjectTitle("");
    setNewLongTermObjectDescription("");
    setNewLongTermObjectKind("长期想法");
    setAddingLongTermObject(false);
  };

  const openRelatedTaskForm = (object: LongTermObject) => {
    setAddingRelatedTaskTo(object.id);
    setNewRelatedTaskPoolId(storeColumns[0]?.id ?? "");
  };

  const addRelatedTask = () => {
    const title = newRelatedTaskTitle.trim();
    const object = longTermObjects.find((item) => item.id === addingRelatedTaskTo);
    const columnId = storeColumns.some((column) => column.id === newRelatedTaskPoolId)
      ? newRelatedTaskPoolId
      : storeColumns[0]?.id;
    if (!title || !object || !columnId) return;

    const taskId = createId("store");
    setStoreColumns((columns) =>
      columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              tasks: [
                ...column.tasks,
                {
                  id: taskId,
                  title,
                  detail: newRelatedTaskDetail.trim(),
                  source: "文本",
                  priority: "P3",
                  object: object.title,
                },
              ],
            }
          : column,
      ),
    );
    setLongTermObjects((objects) =>
      objects.map((item) =>
        item.id === object.id
          ? {
              ...item,
              activity: `最近关联：${title}`,
              relatedTaskIds: [...new Set([...item.relatedTaskIds, taskId])],
            }
          : item,
      ),
    );
    setAddingRelatedTaskTo(null);
    setNewRelatedTaskTitle("");
    setNewRelatedTaskDetail("");
    setNewRelatedTaskPoolId("");
    showToast(`已将“${title}”关联到“${object.title}”`);
  };

  const openNotePicker = (target: NoteTaskTarget) => {
    setNoteTaskTarget(target);
    setNoteSearch("");
    setNoteSuggestions([]);
  };

  const closeNotePicker = () => {
    setNoteTaskTarget(null);
    setNoteSearch("");
    setNoteSuggestions([]);
  };

  const addLinkedNote = async (note: LinkedNoteSuggestion) => {
    if (!noteTaskTarget) return;

    if (note.isTaskFolderNote) {
      if (!storage?.moveTaskNote) {
        showToast("移动待办笔记暂不可用");
        return;
      }
      try {
        await storage.moveTaskNote(note.path, noteTaskTarget);
        showToast(`已将“${note.title}”移动到指定位置`);
        closeNotePicker();
      } catch {
        showToast(`移动“${note.title}”失败`);
      }
      return;
    }

    const object = longTermObjects.find(
      (item) => item.id === noteTaskTarget.objectId,
    );
    const taskId = createId("linked-note");
    const task: TaskItem = {
      id: taskId,
      title: note.title,
      detail: `[[${note.title}]]`,
      source: "笔记",
      meta: "双链笔记",
      priority: "P3",
      object: object?.title,
      linkedNotePath: note.path,
    };

    if (noteTaskTarget.location === "canvas") {
      setCanvasCards((cards) => {
        const board = canvasRef.current?.getBoundingClientRect();
        const position = findAvailableCanvasCardPosition(
          cards,
          canvasTextNotes,
          board ? { width: board.width, height: board.height } : undefined,
        );
        return [...cards, { ...task, ...position, tone: "cream" }];
      });
    } else if (noteTaskTarget.location === "inbox") {
      setInbox((items) => [...items, task]);
    } else if (noteTaskTarget.location === "todo") {
      setTodo((items) => [...items, task]);
    } else if (noteTaskTarget.location === "cache") {
      setCache((items) => [...items, task]);
    } else {
      const columnId = storeColumns.some(
        (column) => column.id === noteTaskTarget.columnId,
      )
        ? noteTaskTarget.columnId
        : storeColumns[0]?.id;
      if (!columnId) return;
      setStoreColumns((columns) =>
        columns.map((column) =>
          column.id === columnId
            ? { ...column, tasks: [...column.tasks, task] }
            : column,
        ),
      );
    }
    if (object) {
      setLongTermObjects((objects) =>
        objects.map((item) =>
          item.id === object.id
            ? {
                ...item,
                activity: `最近关联：${note.title}`,
                relatedTaskIds: [...new Set([...item.relatedTaskIds, taskId])],
              }
            : item,
        ),
      );
    }
    closeNotePicker();
    showToast(`已以双链添加“${note.title}”`);
  };

  const openLinkedNote = (task: TaskItem) => {
    if (task.linkedNotePath) void storage?.openNote?.(task.linkedNotePath);
  };

  const openNativeCanvas = () => {
    if (!storage?.openNativeCanvas) {
      showToast("原生 Canvas 仅在 Obsidian 插件中可用");
      return;
    }
    void Promise.resolve(
      storage.openNativeCanvas(),
    )
      .catch(() => showToast("打开原生 Canvas 失败"));
  };

  const openNativeCanvasLoader = () => {
    if (!storage?.listNativeCanvases) {
      showToast("原生 Canvas 仅在 Obsidian 插件中可用");
      return;
    }
    setShowNativeCanvasLoader(true);
    setLoadingNativeCanvases(true);
    void storage
      .listNativeCanvases()
      .then((files) => setNativeCanvasFiles(files))
      .catch(() => {
        setNativeCanvasFiles([]);
        showToast("读取白板文件夹失败");
      })
      .finally(() => setLoadingNativeCanvases(false));
  };

  const loadNativeCanvas = (file: NativeCanvasFile) => {
    if (!storage?.loadNativeCanvas) return;
    void Promise.resolve(storage.loadNativeCanvas(file.path))
      .then(() => {
        setShowNativeCanvasLoader(false);
        showToast(`已加载“${file.title}”`);
      })
      .catch(() => showToast("加载 Canvas 失败"));
  };

  const addStoreTask = (columnId: string) => {
    const title = newStoreTaskTitle.trim();
    if (!title) return;
    setStoreColumns((columns) =>
      columns.map((column) =>
        column.id === columnId
          ? {
              ...column,
              tasks: [
                ...column.tasks,
                {
                  id: createId("store"),
                  title,
                  detail: newStoreTaskDetail.trim(),
                  source: "文本",
                  priority: "P3",
                },
              ],
            }
          : column,
      ),
    );
    setNewStoreTaskTitle("");
    setNewStoreTaskDetail("");
    setAddingStoreTaskTo(null);
  };

  const addWorkbenchTask = (
    list: "inbox" | "todo" | "cache",
    title: string,
    detail: string,
  ) => {
    const task: TaskItem = {
      id: createId(list),
      title,
      detail,
      source: "文本",
      meta: "手动加入",
    };

    if (list === "inbox") setInbox((items) => [...items, task]);
    if (list === "todo") setTodo((items) => [...items, task]);
    if (list === "cache") setCache((items) => [...items, task]);
    showToast("任务已加入工作台");
  };

  const selectCanvasTool = (tool: "select" | "connect" | "text") => {
    setCanvasTool(tool);
    setConnectionStartId(null);
    setSelectedConnectionId(null);
    setDeleteConnectionId(null);
    setAddingTask(false);
    setAddingTextNote(false);
    setTextNotePosition(null);
  };

  const startCanvasConnection = (cardId: string) => {
    setCanvasTool("connect");
    setConnectionStartId(cardId);
    setSelectedConnectionId(null);
    setDeleteConnectionId(null);
  };

  const persistCanvasConnections = (
    nextConnections: CanvasConnection[],
  ) => {
    if (!storage) return;
    void storage.save({
      canvasCards,
      canvasConnections: nextConnections,
      canvasTextNotes,
      longTermObjects,
      inbox,
      todo,
      cache,
      storeColumns,
      transparentUi,
    });
  };

  const connectCanvasCard = (cardId: string) => {
    if (!connectionStartId) {
      startCanvasConnection(cardId);
      return;
    }

    if (connectionStartId === cardId) {
      setConnectionStartId(null);
      return;
    }

    const exists = canvasConnections.some(
      (connection) =>
        connection.fromId === connectionStartId && connection.toId === cardId,
    );

    if (!exists) {
      const nextConnections = [
        ...canvasConnections,
        { id: createId("connection"), fromId: connectionStartId, toId: cardId },
      ];
      setCanvasConnections(nextConnections);
      persistCanvasConnections(nextConnections);
    }
    setConnectionStartId(null);
  };

  const addTextNote = () => {
    const content = newTextNoteContent.trim();
    if (!content || !textNotePosition) return;

    if (editingTextNoteId) {
      setCanvasTextNotes((notes) =>
        notes.map((note) =>
          note.id === editingTextNoteId ? { ...note, content } : note,
        ),
      );
      setEditingTextNoteId(null);
      setNewTextNoteContent("");
      setTextNotePosition(null);
      setAddingTextNote(false);
      setCanvasTool("select");
      return;
    }

    setCanvasTextNotes((notes) => [
      ...notes,
      {
        id: createId("text-note"),
        content,
        x: textNotePosition.x,
        y: textNotePosition.y,
      },
    ]);
    setNewTextNoteContent("");
    setTextNotePosition(null);
    setAddingTextNote(false);
    setCanvasTool("select");
  };

  const cancelTextNoteForm = () => {
    setAddingTextNote(false);
    setEditingTextNoteId(null);
    setNewTextNoteContent("");
    setTextNotePosition(null);
    setCanvasTool("select");
  };

  const handleWhiteboardPointerDown = (
    event: ReactPointerEvent<HTMLDivElement>,
  ) => {
    if (canvasTool !== "text") return;
    const target = event.target as Element;
    if (
      target.closest(
        ".canvas-card, .canvas-text-note, .canvas-label, button, svg",
      )
    ) {
      return;
    }

    const board = canvasRef.current?.getBoundingClientRect();
    if (!board) return;
    setTextNotePosition({
      x: Math.max(16, Math.min(board.width - 240, event.clientX - board.left)),
      y: Math.max(70, Math.min(board.height - 120, event.clientY - board.top)),
    });
    setAddingTextNote(true);
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    card: CanvasCard,
  ) => {
    if ((event.target as HTMLElement).closest("button")) return;
    setDeleteConnectionId(null);
    if (canvasTool === "connect") {
      event.preventDefault();
      connectCanvasCard(card.id);
      return;
    }
    if (canvasTool === "text") return;
    const board = canvasRef.current?.getBoundingClientRect();
    if (!board) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({
      id: card.id,
      kind: "card",
      offsetX: event.clientX - board.left - card.x,
      offsetY: event.clientY - board.top - card.y,
    });
  };

  const handleTextNotePointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    note: CanvasTextNote,
  ) => {
    if (canvasTool !== "select") return;
    const board = canvasRef.current?.getBoundingClientRect();
    if (!board) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging({
      id: note.id,
      kind: "text",
      offsetX: event.clientX - board.left - note.x,
      offsetY: event.clientY - board.top - note.y,
    });
  };

  const editTextNote = (note: CanvasTextNote) => {
    setCanvasTool("select");
    setDragging(null);
    setEditingTextNoteId(note.id);
    setNewTextNoteContent(note.content);
    setTextNotePosition({ x: note.x, y: note.y });
    setAddingTextNote(true);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragging) return;
    const board = canvasRef.current?.getBoundingClientRect();
    if (!board) return;
    const nextX = Math.max(
      16,
      Math.min(board.width - 260, event.clientX - board.left - dragging.offsetX),
    );
    const nextY = Math.max(
      70,
      Math.min(board.height - 170, event.clientY - board.top - dragging.offsetY),
    );
    if (dragging.kind === "card") {
      setCanvasCards((cards) =>
        cards.map((card) =>
          card.id === dragging.id ? { ...card, x: nextX, y: nextY } : card,
        ),
      );
    } else {
      setCanvasTextNotes((notes) =>
        notes.map((note) =>
          note.id === dragging.id ? { ...note, x: nextX, y: nextY } : note,
        ),
      );
    }
  };

  const handleStoreDrop = (columnId: string, taskId: string) => {
    let moved: TaskItem | undefined;
    const stripped = storeColumns.map((column) => ({
      ...column,
      tasks: column.tasks.filter((task) => {
        if (task.id === taskId) {
          moved = task;
          return false;
        }
        return true;
      }),
    }));
    if (!moved) return;
    setStoreColumns(
      stripped.map((column) =>
        column.id === columnId
          ? { ...column, tasks: [...column.tasks, moved as TaskItem] }
          : column,
      ),
    );
  };

  const renderStorageTask = (task: TaskItem, columnId: string) => (
    <article
      className={`kanban-card ${openMenuId === task.id ? "task-menu-open" : ""}`}
      key={task.id}
      draggable={!pendingMove}
      onDragStart={(event) =>
        event.dataTransfer.setData("text/task-id", task.id)
      }
    >
      <TaskMenu
        task={task}
        origin={{ kind: "storage", columnId }}
        openMenuId={openMenuId}
        setOpenMenuId={setOpenMenuId}
        beginMove={beginMove}
      />
      <div className="card-kicker">
        <span>{task.priority ?? "P3"}</span>
      </div>
      <h3>{task.title}</h3>
      <p>{task.detail}</p>
      <footer>
        <span>{task.object ? `◎ ${task.object}` : "未关联长期对象"}</span>
        {task.linkedNotePath && (
          <button
            className="task-note-link"
            onClick={() => openLinkedNote(task)}
            aria-label={`打开笔记：${task.title}`}
            title={`打开笔记：${task.title}`}
          >
            <Icon>⛓</Icon>
          </button>
        )}
      </footer>
    </article>
  );

  const moveBanner = pendingMove ? (
    <div className="move-banner" role="status">
      <span>正在移动：<strong>{pendingMove.task.title}</strong></span>
      <p>请点击一个具体位置，添加到{destinationLabel(pendingMove.destination)}。</p>
      <button onClick={() => setPendingMove(null)}>取消移动</button>
    </div>
  ) : null;

  const notePicker = noteTaskTarget ? (
    <div className="note-picker-backdrop" onPointerDown={(event) => event.stopPropagation()}>
      <section className="dialog-card note-picker" role="dialog" aria-label="链接笔记">
        <span className="eyebrow">链接笔记</span>
        <input
          autoFocus
          value={noteSearch}
          onChange={(event) => setNoteSearch(event.target.value)}
          placeholder="搜索笔记…"
          aria-label="搜索笔记"
        />
        <div className="note-suggestion-list">
          {loadingNoteSuggestions ? (
            <span>正在查找笔记</span>
          ) : noteSuggestions.length ? (
            noteSuggestions.map((note) => (
              <button
                key={note.path}
                type="button"
                onClick={() => void addLinkedNote(note)}
                title={note.path}
              >
                <Icon>{note.isTaskFolderNote ? "↳" : "⛓"}</Icon>
                <span>{note.title}</span>
                <small>{note.path}</small>
              </button>
            ))
          ) : (
            <span>没有可用笔记</span>
          )}
        </div>
        <div>
          <button type="button" onClick={closeNotePicker}>取消</button>
        </div>
      </section>
    </div>
  ) : null;

  if (mode === "storage") {
    return (
      <main className={`app-shell storage-shell ${transparentUi ? "transparent-ui" : ""}`}>
        <header className="topbar storage-topbar">
          <button
            className="icon-button back-button"
            onClick={() => {
              setMode("workspace");
              setFlipped(true);
            }}
            aria-label="返回缓存工作台"
          >
            <Icon>←</Icon>
          </button>
          <div className="brand-mark">
            {brandIconSrc ? <img src={brandIconSrc} alt="" /> : "层"}
          </div>
          <div className="topbar-title">
            <strong>{storageView === "tasks" ? "任务存储器" : "长期对象"}</strong>
          </div>
          <div className="attention-path" aria-label="当前注意力流程">
            <button onClick={() => showPage("whiteboard")}>1 白板</button>
            <i>—</i>
            <button onClick={() => showPage("workbench")}>2 工作台</button>
            <i>—</i>
            <span className="current">3–4 后台</span>
          </div>
          <button
            className="icon-button appearance-toggle"
            onClick={() => setTransparentUi((value) => !value)}
            aria-label={transparentUi ? "使用原始配色" : "使用透明配色"}
            aria-pressed={transparentUi}
            title={transparentUi ? "使用原始配色" : "使用透明配色"}
          >
            <Icon>{transparentUi ? "◐" : "◌"}</Icon>
          </button>
          <div className="storage-search">
            <Icon>⌕</Icon>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索全部任务…"
              aria-label="搜索任务存储器"
            />
          </div>
        </header>

        {moveBanner}

        <div className="storage-layout">
          <aside className="storage-sidebar">
            <div className="sidebar-section">
              <span className="sidebar-label">浏览</span>
              <button
                className={storageView === "tasks" && !selectedStoreColumn ? "active" : ""}
                onClick={() => {
                  setStorageView("tasks");
                  setSelectedStoreColumnId(null);
                }}
              >
                <Icon>▦</Icon>
                任务存储器
                <span>{storeColumns.reduce((sum, col) => sum + col.tasks.length, 0)}</span>
              </button>
              <button
                className={storageView === "objects" ? "active" : ""}
                onClick={() => {
                  setStorageView("objects");
                  setSelectedStoreColumnId(null);
                }}
              >
                <Icon>◎</Icon>
                长期对象
                <span>{longTermObjects.length}</span>
              </button>
            </div>
            <div className="sidebar-section">
              <span className="sidebar-label">任务池</span>
              {storeColumns.map((column) => (
                <button
                  key={column.id}
                  className={selectedStoreColumnId === column.id ? "active" : ""}
                  onClick={() => {
                    setStorageView("tasks");
                    setSelectedStoreColumnId(column.id);
                  }}
                >
                  <i className={`pool-dot ${column.tone}`} />
                  {column.title}
                  <span>{column.tasks.length}</span>
                </button>
              ))}
              <button className="sidebar-add-pool" onClick={() => setAddingPool(true)}>
                <Icon>＋</Icon>
                添加任务池
              </button>
            </div>
          </aside>

          <section className="storage-content">
            {storageView === "tasks" ? (
              <>
                {selectedStoreColumn ? (
                  <>
                    <div className="storage-heading">
                      <div>
                        <span className="eyebrow">任务池 · 瀑布流</span>
                        <h1>{selectedStoreColumn.title}</h1>
                        <p>{selectedStoreColumn.hint}</p>
                      </div>
                      <button
                        className="primary-button"
                        onClick={() => setSelectedStoreColumnId(null)}
                      >
                        查看全部任务池
                      </button>
                    </div>
                    <div className="pool-masonry">
                      {selectedStoreTasks.map((task) =>
                        renderStorageTask(task, selectedStoreColumn.id),
                      )}
                    </div>
                    <div className="pool-detail-actions">
                      <TaskAddActions
                        onCreate={() => setAddingStoreTaskTo(selectedStoreColumn.id)}
                        onLink={() =>
                          openNotePicker({
                            location: "storage",
                            columnId: selectedStoreColumn.id,
                          })
                        }
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="storage-heading">
                      <div>
                        <span className="eyebrow">全部任务 · Kanban</span>
                        <h1>任务存储器</h1>
                        <p>任务池可以自由添加；拖动卡片可调整任务所属的任务池。</p>
                      </div>
                      <button className="primary-button" onClick={() => setAddingPool(true)}>
                        ＋ 添加任务池
                      </button>
                    </div>
                    <div className="kanban-board">
                      {visibleStore.map((column) => (
                        <section
                          className={`kanban-column ${
                            pendingMove?.destination === "storage" ? "move-target" : ""
                          }`}
                          key={column.id}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) =>
                            handleStoreDrop(
                              column.id,
                              event.dataTransfer.getData("text/task-id"),
                            )
                          }
                        >
                          <header>
                            <i className={`pool-dot ${column.tone}`} />
                            <div>
                              <h2>{column.title}</h2>
                              <p>{column.hint}</p>
                            </div>
                            <span className="column-count">{column.tasks.length}</span>
                          </header>
                          {pendingMove?.destination === "storage" && (
                            <button
                              className="choose-target-button"
                              onClick={() =>
                                completeMove({ kind: "storage", columnId: column.id })
                              }
                            >
                              添加到“{column.title}”
                            </button>
                          )}
                          <div className="kanban-stack">
                            {column.tasks.map((task) =>
                              renderStorageTask(task, column.id),
                            )}
                            <TaskAddActions
                              onCreate={() => setAddingStoreTaskTo(column.id)}
                              onLink={() =>
                                openNotePicker({
                                  location: "storage",
                                  columnId: column.id,
                                })
                              }
                            />
                          </div>
                        </section>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : (
              <LongTermObjects
                objects={longTermObjects}
                tasks={allTasks}
                selectedObjectId={selectedObjectId}
                setSelectedObjectId={setSelectedObjectId}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                beginMove={beginMove}
                resolveOrigin={resolveOrigin}
                onAddObject={() => setAddingLongTermObject(true)}
                onAddRelatedTask={openRelatedTaskForm}
                onLinkRelatedNote={(object) =>
                  openNotePicker({
                    location: "storage",
                    columnId: storeColumns[0]?.id,
                    objectId: object.id,
                  })
                }
              />
            )}
          </section>
        </div>

        {addingPool && (
          <form
            className="dialog-card"
            onSubmit={(event) => {
              event.preventDefault();
              addPool();
            }}
          >
            <span className="eyebrow">新任务池</span>
            <h2>添加一种任务类型</h2>
            <input
              autoFocus
              value={newPoolTitle}
              onChange={(event) => setNewPoolTitle(event.target.value)}
              placeholder="例如：想看的书、外出事项"
            />
            <div>
              <button type="button" onClick={() => setAddingPool(false)}>取消</button>
              <button type="submit">创建任务池</button>
            </div>
          </form>
        )}
        {addingStoreTaskTo && (
          <form
            className="dialog-card"
            onSubmit={(event) => {
              event.preventDefault();
              addStoreTask(addingStoreTaskTo);
            }}
          >
            <span className="eyebrow">任务存储器</span>
            <h2>
              添加到
              {storeColumns.find((column) => column.id === addingStoreTaskTo)?.title ??
                "任务池"}
            </h2>
            <input
              autoFocus
              value={newStoreTaskTitle}
              onChange={(event) => setNewStoreTaskTitle(event.target.value)}
              placeholder="任务名称"
            />
            <textarea
              value={newStoreTaskDetail}
              onChange={(event) => setNewStoreTaskDetail(event.target.value)}
              placeholder="任务内容（可选）"
              rows={4}
            />
            <div>
              <button
                type="button"
                onClick={() => {
                  setAddingStoreTaskTo(null);
                  setNewStoreTaskTitle("");
                  setNewStoreTaskDetail("");
                }}
              >
                取消
              </button>
              <button type="submit">添加</button>
            </div>
          </form>
        )}
        {addingLongTermObject && (
          <form
            className="dialog-card long-term-object-form"
            onSubmit={(event) => {
              event.preventDefault();
              addLongTermObject();
            }}
          >
            <span className="eyebrow">新长期对象</span>
            <h2>记录一个长期方向</h2>
            <input
              autoFocus
              value={newLongTermObjectTitle}
              onChange={(event) => setNewLongTermObjectTitle(event.target.value)}
              placeholder="名称，例如：学习摄影"
            />
            <select
              value={newLongTermObjectKind}
              onChange={(event) =>
                setNewLongTermObjectKind(
                  event.target.value as LongTermObject["kind"],
                )
              }
              aria-label="长期对象类型"
            >
              <option value="兴趣">兴趣</option>
              <option value="目标">目标</option>
              <option value="长期想法">长期想法</option>
            </select>
            <textarea
              value={newLongTermObjectDescription}
              onChange={(event) =>
                setNewLongTermObjectDescription(event.target.value)
              }
              placeholder="说明这个对象对你意味着什么（可选）"
              rows={4}
            />
            <div>
              <button
                type="button"
                onClick={() => {
                  setAddingLongTermObject(false);
                  setNewLongTermObjectTitle("");
                  setNewLongTermObjectDescription("");
                }}
              >
                取消
              </button>
              <button type="submit">创建对象</button>
            </div>
          </form>
        )}
        {addingRelatedTaskTo && (
          <form
            className="dialog-card"
            onSubmit={(event) => {
              event.preventDefault();
              addRelatedTask();
            }}
          >
            <span className="eyebrow">关联任务</span>
            <h2>添加一项行动</h2>
            <input
              autoFocus
              value={newRelatedTaskTitle}
              onChange={(event) => setNewRelatedTaskTitle(event.target.value)}
              placeholder="任务名称"
            />
            <textarea
              value={newRelatedTaskDetail}
              onChange={(event) => setNewRelatedTaskDetail(event.target.value)}
              placeholder="任务内容（可选）"
              rows={4}
            />
            <select
              value={newRelatedTaskPoolId}
              onChange={(event) => setNewRelatedTaskPoolId(event.target.value)}
              aria-label="保存到任务池"
            >
              {storeColumns.map((column) => (
                <option key={column.id} value={column.id}>
                  {column.title}
                </option>
              ))}
            </select>
            <div>
              <button
                type="button"
                onClick={() => {
                  setAddingRelatedTaskTo(null);
                  setNewRelatedTaskTitle("");
                  setNewRelatedTaskDetail("");
                  setNewRelatedTaskPoolId("");
                }}
              >
                取消
              </button>
              <button type="submit">添加任务</button>
            </div>
          </form>
        )}
        {notePicker}
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    );
  }

  return (
    <main className={`app-shell ${transparentUi ? "transparent-ui" : ""}`}>
      <header className="topbar">
        <div className="brand-mark">
          {brandIconSrc ? <img src={brandIconSrc} alt="" /> : "层"}
        </div>
        <div className="topbar-title">
          <strong>{flipped ? "缓存工作台" : "白板"}</strong>
        </div>
        <div className="attention-path" aria-label="当前注意力流程">
          <span className={!flipped ? "current" : ""}>1 白板</span>
          <i>—</i>
          <span className={flipped ? "current" : ""}>2 工作台</span>
          <i>—</i>
          <button onClick={() => setMode("storage")}>3–4 后台</button>
        </div>
        <button
          className="icon-button appearance-toggle"
          onClick={() => setTransparentUi((value) => !value)}
          aria-label={transparentUi ? "使用原始配色" : "使用透明配色"}
          aria-pressed={transparentUi}
          title={transparentUi ? "使用原始配色" : "使用透明配色"}
        >
          <Icon>{transparentUi ? "◐" : "◌"}</Icon>
        </button>
        <button
          className="flip-button"
          onClick={() => setFlipped((value) => !value)}
          aria-label={flipped ? "翻回白板" : "翻到背面"}
          aria-pressed={flipped}
          title={flipped ? "翻回白板" : "翻到背面"}
        >
          <span className="flip-icon" aria-hidden="true">↻</span>
        </button>
      </header>

      {moveBanner}

      <div className="workspace-stage">
        <div className={`workspace-card ${flipped ? "is-flipped" : ""}`}>
          <section className="workspace-face workspace-front" aria-hidden={flipped}>
            <div className="canvas-toolbar" aria-label="白板工具">
              <button
                className={canvasTool === "select" ? "active" : ""}
                onClick={() => selectCanvasTool("select")}
                aria-label="选择工具"
                aria-pressed={canvasTool === "select"}
                title="选择并移动卡片"
              >
                ↖
              </button>
              <button
                className={canvasTool === "text" ? "active" : ""}
                onClick={() => selectCanvasTool("text")}
                aria-label="文本笔记工具"
                aria-pressed={canvasTool === "text"}
                data-tooltip="文本笔记：点击白板空白处添加"
                title="文本笔记：点击白板空白处添加"
              >
                T
              </button>
              <button
                className={canvasTool === "connect" ? "active" : ""}
                onClick={() => selectCanvasTool("connect")}
                aria-label="连线工具"
                aria-pressed={canvasTool === "connect"}
                data-tooltip="连线：先点起点卡片，再点终点卡片"
                title="连线：先点起点卡片，再点终点卡片"
              >
                ↗
              </button>
              <span />
              <button onClick={() => showToast("当前缩放 100%")} aria-label="缩放">100%</button>
            </div>
            <div className="canvas-status">
              <span className="live-dot" />
              正在处理 {canvasCards.filter((card) => !card.done).length} 项 · {canvasConnections.length} 条连线
            </div>
            <div
              className={`whiteboard ${canvasTool === "text" ? "text-note-mode" : ""}`}
              ref={canvasRef}
              onPointerDown={handleWhiteboardPointerDown}
            >
              <div
                className="canvas-file-actions"
                aria-label="Canvas 文件操作"
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  onClick={openNativeCanvas}
                  aria-label="同步并打开原生 Canvas"
                  title="同步并打开原生 Canvas"
                >
                  <span aria-hidden="true">◫</span>
                  官方 Canvas
                </button>
                <button
                  onClick={openNativeCanvasLoader}
                  aria-label="从白板文件夹加载 Canvas"
                  title="从白板文件夹加载 Canvas"
                >
                  <span aria-hidden="true">⇩</span>
                  加载 Canvas
                </button>
              </div>
              {pendingMove?.destination === "whiteboard" && (
                <button
                  className="whiteboard-move-target"
                  onClick={() => completeMove({ kind: "whiteboard" })}
                >
                  ＋ 点击这里，把“{pendingMove.task.title}”添加到白板
                </button>
              )}
              <svg
                className="canvas-connections"
                aria-label="任务连线"
                role="group"
              >
                <defs>
                  <marker
                    id="canvas-connection-arrow"
                    markerWidth="8"
                    markerHeight="8"
                    refX="7"
                    refY="4"
                    orient="auto"
                    markerUnits="strokeWidth"
                  >
                    <path d="M 0 0 L 8 4 L 0 8 z" />
                  </marker>
                </defs>
                {canvasConnections.map((connection) => {
                  const from = canvasCards.find((card) => card.id === connection.fromId);
                  const to = canvasCards.find((card) => card.id === connection.toId);
                  const coordinates =
                    from && to ? getConnectionCoordinates(from, to) : null;

                  if (!coordinates) return null;

                  return (
                    <g key={connection.id}>
                      <line
                        className="canvas-connection-hit"
                        onDoubleClick={(event) => {
                          event.stopPropagation();
                          setCanvasConnections((connections) =>
                            connections.filter((item) => item.id !== connection.id),
                          );
                          setSelectedConnectionId(null);
                          setDeleteConnectionId(null);
                        }}
                        onContextMenu={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setCanvasTool("select");
                          setConnectionStartId(null);
                          setSelectedConnectionId(connection.id);
                          setDeleteConnectionId(connection.id);
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          setCanvasTool("select");
                          setSelectedConnectionId(connection.id);
                          setConnectionStartId(null);
                          setDeleteConnectionId(null);
                        }}
                        x1={coordinates.x1}
                        x2={coordinates.x2}
                        y1={coordinates.y1}
                        y2={coordinates.y2}
                      />
                      <line
                        className={`canvas-connection ${
                          selectedConnectionId === connection.id ? "selected" : ""
                        }`}
                        markerEnd="url(#canvas-connection-arrow)"
                        x1={coordinates.x1}
                        x2={coordinates.x2}
                        y1={coordinates.y1}
                        y2={coordinates.y2}
                      />
                    </g>
                  );
                })}
              </svg>
              {canvasConnections.map((connection) => {
                if (deleteConnectionId !== connection.id) return null;
                const from = canvasCards.find((card) => card.id === connection.fromId);
                const to = canvasCards.find((card) => card.id === connection.toId);
                const coordinates =
                  from && to ? getConnectionCoordinates(from, to) : null;
                if (!coordinates) return null;

                return (
                  <button
                    className="canvas-connection-delete"
                    key={`delete-${connection.id}`}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      setCanvasConnections((connections) =>
                        connections.filter((item) => item.id !== connection.id),
                      );
                      setSelectedConnectionId(null);
                      setDeleteConnectionId(null);
                    }}
                    aria-label="删除连线"
                    title="删除连线"
                    style={{
                      left: (coordinates.x1 + coordinates.x2) / 2,
                      top: (coordinates.y1 + coordinates.y2) / 2,
                    }}
                  >
                    <Icon>×</Icon>
                  </button>
                );
              })}
              {canvasCards.map((card) => (
                <article
                  className={`canvas-card tone-${card.tone} ${
                    dragging?.id === card.id && dragging.kind === "card" ? "dragging" : ""
                  } ${openMenuId === card.id ? "task-menu-open" : ""} ${
                    connectionStartId === card.id ? "connection-source" : ""
                  } ${canvasTool === "connect" ? "connect-mode" : ""}`}
                  key={card.id}
                  style={{ left: card.x, top: card.y }}
                  onPointerDown={(event) => handlePointerDown(event, card)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => setDragging(null)}
                >
                  <TaskMenu
                    task={card}
                    origin={{ kind: "canvas" }}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    beginMove={beginMove}
                  />
                  <button
                    className="canvas-link-handle"
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.stopPropagation();
                      startCanvasConnection(card.id);
                    }}
                    aria-label={`从“${card.title}”开始连线`}
                    title="从此卡片开始连线"
                  >
                    <Icon>↗</Icon>
                  </button>
                  <div className="card-kicker">
                    <span>{card.meta}</span>
                  </div>
                  <h2>{card.title}</h2>
                  <p>{card.detail}</p>
                  <footer>
                    <button
                      className={card.done ? "checked" : ""}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={() =>
                        setCanvasCards((cards) =>
                          cards.map((item) =>
                            item.id === card.id ? { ...item, done: !item.done } : item,
                          ),
                        )
                      }
                    >
                      {card.done ? "✓ 已完成" : "○ 完成"}
                    </button>
                    {card.linkedNotePath && (
                      <button
                        className="task-note-link"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => openLinkedNote(card)}
                        aria-label={`打开笔记：${card.title}`}
                        title={`打开笔记：${card.title}`}
                      >
                        <Icon>⛓</Icon>
                      </button>
                    )}
                  </footer>
                </article>
              ))}
              {canvasTextNotes.map((note) => (
                <article
                  className={`canvas-text-note ${
                    dragging?.id === note.id && dragging.kind === "text" ? "dragging" : ""
                  }`}
                  key={note.id}
                  style={{ left: note.x, top: note.y }}
                  onPointerDown={(event) => handleTextNotePointerDown(event, note)}
                  onPointerMove={handlePointerMove}
                  onPointerUp={() => setDragging(null)}
                  onDoubleClick={(event) => {
                    event.stopPropagation();
                    editTextNote(note);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setCanvasTextNotes((notes) =>
                      notes.filter((item) => item.id !== note.id),
                    );
                  }}
                  title="双击编辑，右键删除"
                >
                  {note.content}
                </article>
              ))}
              {addingTask && (
                <form
                  className="quick-add-card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    addCanvasTask();
                  }}
                >
                  <span className="eyebrow">添加到白板</span>
                  <input
                    autoFocus
                    value={newTaskTitle}
                    onChange={(event) => setNewTaskTitle(event.target.value)}
                    placeholder="任务名称"
                  />
                  <textarea
                    value={newTaskDetail}
                    onChange={(event) => setNewTaskDetail(event.target.value)}
                    placeholder="任务内容（可选）"
                    rows={4}
                  />
                  <div>
                    <button type="button" onClick={() => setAddingTask(false)}>取消</button>
                    <button type="submit">加入白板</button>
                  </div>
                </form>
              )}
              {addingTextNote && (
                <form
                  className="quick-add-card text-note-form"
                  onPointerDown={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    addTextNote();
                  }}
                >
                  <span className="eyebrow">
                    {editingTextNoteId ? "编辑文本笔记" : "添加文本笔记"}
                  </span>
                  <textarea
                    autoFocus
                    value={newTextNoteContent}
                    onChange={(event) => setNewTextNoteContent(event.target.value)}
                    placeholder="写下要保留的文本…"
                    rows={5}
                  />
                  <div>
                    <button
                      type="button"
                      onClick={cancelTextNoteForm}
                    >
                      取消
                    </button>
                    <button type="submit">
                      {editingTextNoteId ? "保存修改" : "添加笔记"}
                    </button>
                  </div>
                </form>
              )}
              {!addingTask && (
                <div className="floating-task-actions">
                  <TaskAddActions
                    onCreate={() => setAddingTask(true)}
                    onLink={() => openNotePicker({ location: "canvas" })}
                  />
                </div>
              )}
            </div>
          </section>

          <section className="workspace-face workspace-back" aria-hidden={!flipped}>
            <div className="workbench-main">
              <WorkbenchColumn
                title="收集箱"
                subtitle="先接住，还没有判断"
                items={inbox}
                tone="inbox"
                aiLabel="整理收集箱"
                onAi={() => showToast("AI 接口已预留：整理收集箱")}
                origin={{ kind: "inbox" }}
                isMoveTarget={pendingMove?.destination === "workbench"}
                onChooseTarget={() => completeMove({ kind: "workbench", list: "inbox" })}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                beginMove={beginMove}
                onAddTask={(title, detail) => addWorkbenchTask("inbox", title, detail)}
                onLinkNote={() => openNotePicker({ location: "inbox" })}
                onOpenLinkedNote={openLinkedNote}
              />
              <WorkbenchColumn
                title="待办列表"
                subtitle="想找时间开始的事情"
                items={todo}
                tone="todo"
                aiLabel="提取待办列表"
                onAi={() => showToast("AI 接口已预留：提取待办列表")}
                origin={{ kind: "todo" }}
                isMoveTarget={pendingMove?.destination === "workbench"}
                onChooseTarget={() => completeMove({ kind: "workbench", list: "todo" })}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                beginMove={beginMove}
                onAddTask={(title, detail) => addWorkbenchTask("todo", title, detail)}
                onLinkNote={() => openNotePicker({ location: "todo" })}
                onOpenLinkedNote={openLinkedNote}
              />
              <WorkbenchColumn
                title="缓存列表"
                subtitle="做过一部分，等待恢复"
                items={cache}
                tone="cache"
                aiLabel="清理缓存列表"
                onAi={() => showToast("AI 接口已预留：清理缓存列表")}
                origin={{ kind: "cache" }}
                isMoveTarget={pendingMove?.destination === "workbench"}
                onChooseTarget={() => completeMove({ kind: "workbench", list: "cache" })}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                beginMove={beginMove}
                onAddTask={(title, detail) => addWorkbenchTask("cache", title, detail)}
                onLinkNote={() => openNotePicker({ location: "cache" })}
                onOpenLinkedNote={openLinkedNote}
              />
            </div>
            <section className="storage-preview">
              <div className="storage-preview-heading">
                <div>
                  <span className="eyebrow">后台简略视图</span>
                  <h2>任务存储器</h2>
                  <p>全部任务仍然可见，但退到当前注意力之后。</p>
                </div>
                <div className="preview-actions">
                  <button
                    className="primary-button"
                    onClick={() => {
                      setStorageView("tasks");
                      setMode("storage");
                    }}
                  >
                    进入任务存储器 →
                  </button>
                </div>
              </div>
              <div className="preview-pools">
                {storeColumns.slice(0, 5).map((column) => (
                  <button
                    key={column.id}
                    onClick={() => {
                      setStorageView("tasks");
                      setMode("storage");
                    }}
                  >
                    <i className={`pool-dot ${column.tone}`} />
                    <span>
                      <strong>{column.title}</strong>
                      <small>{column.tasks[0]?.title ?? "空任务池"}</small>
                    </span>
                    <b>{column.tasks.length}</b>
                  </button>
                ))}
              </div>
            </section>
          </section>
        </div>
      </div>
      {notePicker}
      {showNativeCanvasLoader && (
        <section
          className="dialog-card native-canvas-loader"
          role="dialog"
          aria-label="从白板文件夹加载 Canvas"
        >
          <span className="eyebrow">白板文件夹</span>
          <h2>加载原生 Canvas</h2>
          <div className="native-canvas-list">
            {loadingNativeCanvases ? (
              <span>正在读取 Canvas 文件</span>
            ) : nativeCanvasFiles.length ? (
              nativeCanvasFiles.map((file) => (
                <button
                  key={file.path}
                  type="button"
                  onClick={() => loadNativeCanvas(file)}
                  title={file.path}
                >
                  <Icon>◫</Icon>
                  <span>{file.title}</span>
                </button>
              ))
            ) : (
              <span>白板文件夹中没有 Canvas 文件</span>
            )}
          </div>
          <div>
            <button type="button" onClick={() => setShowNativeCanvasLoader(false)}>
              取消
            </button>
          </div>
        </section>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function TaskMenu({
  task,
  origin,
  openMenuId,
  setOpenMenuId,
  beginMove,
}: {
  task: TaskItem;
  origin: TaskOrigin;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  beginMove: (
    task: TaskItem,
    origin: TaskOrigin,
    destination: MoveDestination,
  ) => void;
}) {
  const open = openMenuId === task.id;
  return (
    <div
      className="task-menu"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="task-menu-trigger"
        aria-label={`移动${task.title}`}
        aria-expanded={open}
        onClick={() => setOpenMenuId(open ? null : task.id)}
      >
        •••
      </button>
      {open && (
        <div className="task-menu-popover">
          <span>移动到哪里？</span>
          <button type="button" onClick={() => beginMove(task, origin, "whiteboard")}>白板</button>
          <button type="button" onClick={() => beginMove(task, origin, "workbench")}>缓存工作台</button>
          <button type="button" onClick={() => beginMove(task, origin, "storage")}>任务存储器</button>
          {task.linkedNotePath ? (
            <button type="button" onClick={() => beginMove(task, origin, "unlink")}>
              取消链接
            </button>
          ) : (
            <>
              <button type="button" onClick={() => beginMove(task, origin, "archive")}>归档</button>
              <button type="button" onClick={() => beginMove(task, origin, "delete")}>删除</button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function WorkbenchColumn({
  title,
  subtitle,
  items,
  tone,
  aiLabel,
  onAi,
  origin,
  isMoveTarget,
  onChooseTarget,
  openMenuId,
  setOpenMenuId,
  beginMove,
  onAddTask,
  onLinkNote,
  onOpenLinkedNote,
}: {
  title: string;
  subtitle: string;
  items: TaskItem[];
  tone: string;
  aiLabel: string;
  onAi: () => void;
  origin: TaskOrigin;
  isMoveTarget: boolean;
  onChooseTarget: () => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  beginMove: (
    task: TaskItem,
    origin: TaskOrigin,
    destination: MoveDestination,
  ) => void;
  onAddTask: (title: string, detail: string) => void;
  onLinkNote: () => void;
  onOpenLinkedNote: (task: TaskItem) => void;
}) {
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDetail, setNewTaskDetail] = useState("");

  const addTask = () => {
    const nextTitle = newTaskTitle.trim();
    if (!nextTitle) return;
    onAddTask(nextTitle, newTaskDetail.trim());
    setNewTaskTitle("");
    setNewTaskDetail("");
    setAddingTask(false);
  };

  return (
    <section className={`workbench-column ${tone} ${isMoveTarget ? "move-target" : ""}`}>
      <header>
        <div>
          <span className="column-title-line">
            <h2>{title}</h2>
            <b>{items.length}</b>
          </span>
          <p>{subtitle}</p>
        </div>
        <button className="ai-button" onClick={onAi}>
          <span>✦</span>
          {aiLabel}
          <small>AI</small>
        </button>
      </header>
      {isMoveTarget && (
        <button className="choose-target-button" onClick={onChooseTarget}>
          添加到“{title}”
        </button>
      )}
      <div className="workbench-stack">
        {items.map((task) => (
          <article
            key={task.id}
            className={`workbench-card ${openMenuId === task.id ? "task-menu-open" : ""}`}
          >
            <TaskMenu
              task={task}
              origin={origin}
              openMenuId={openMenuId}
              setOpenMenuId={setOpenMenuId}
              beginMove={beginMove}
            />
            <div className="card-kicker">
              <span>{task.meta ?? "未分类"}</span>
            </div>
            <h3>{task.title}</h3>
            <p>{task.detail}</p>
            <footer>
              <span>↗ 打开来源</span>
              {task.linkedNotePath && (
                <button
                  className="task-note-link"
                  onClick={() => onOpenLinkedNote(task)}
                  aria-label={`打开笔记：${task.title}`}
                  title={`打开笔记：${task.title}`}
                >
                  <Icon>⛓</Icon>
                </button>
              )}
            </footer>
          </article>
        ))}
        {addingTask ? (
          <form
            className="inline-add-form workbench-add-form"
            onSubmit={(event) => {
              event.preventDefault();
              addTask();
            }}
          >
            <input
              autoFocus
              value={newTaskTitle}
              onChange={(event) => setNewTaskTitle(event.target.value)}
              placeholder="任务名称"
            />
            <textarea
              value={newTaskDetail}
              onChange={(event) => setNewTaskDetail(event.target.value)}
              placeholder="任务内容（可选）"
              rows={3}
            />
            <div className="inline-add-actions">
              <button type="button" onClick={() => setAddingTask(false)}>取消</button>
              <button type="submit">添加</button>
            </div>
          </form>
        ) : (
          <TaskAddActions
            onCreate={() => setAddingTask(true)}
            onLink={onLinkNote}
          />
        )}
      </div>
    </section>
  );
}

function LongTermObjects({
  objects,
  tasks,
  selectedObjectId,
  setSelectedObjectId,
  openMenuId,
  setOpenMenuId,
  beginMove,
  resolveOrigin,
  onAddObject,
  onAddRelatedTask,
  onLinkRelatedNote,
}: {
  objects: LongTermObject[];
  tasks: TaskItem[];
  selectedObjectId: string | null;
  setSelectedObjectId: (id: string | null) => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  beginMove: (
    task: TaskItem,
    origin: TaskOrigin,
    destination: MoveDestination,
  ) => void;
  resolveOrigin: (taskId: string) => TaskOrigin;
  onAddObject: () => void;
  onAddRelatedTask: (object: LongTermObject) => void;
  onLinkRelatedNote: (object: LongTermObject) => void;
}) {
  const selected = objects.find((object) => object.id === selectedObjectId);
  const relatedTasks = selected
    ? tasks.filter(
        (task) =>
          selected.relatedTaskIds.includes(task.id) ||
          task.object === selected.title,
      )
    : [];

  return (
    <>
      <div className="storage-heading">
        <div>
          <span className="eyebrow">方向与关联</span>
          <h1>长期对象</h1>
          <p>它们不是普通任务，而是产生任务、解释推荐并长期演化的方向。</p>
        </div>
        <button className="primary-button" onClick={onAddObject}>
          ＋ 新建长期对象
        </button>
      </div>
      {selected ? (
        <section className="related-task-panel">
          <header>
            <button
              className="related-back-button"
              onClick={() => setSelectedObjectId(null)}
              aria-label="返回全部对象"
              title="返回全部对象"
            >
              <Icon>←</Icon>
            </button>
            <div className="related-object-heading">
              <span className="eyebrow">{selected.kind} · 关联任务</span>
              <h2>{selected.title}</h2>
              <p>{selected.description}</p>
            </div>
            <TaskAddActions
              onCreate={() => onAddRelatedTask(selected)}
              onLink={() => onLinkRelatedNote(selected)}
            />
          </header>
          <div className="related-task-list">
            {relatedTasks.length ? (
              relatedTasks.map((task) => (
                <article
                  className={`kanban-card ${openMenuId === task.id ? "task-menu-open" : ""}`}
                  key={task.id}
                >
                  <TaskMenu
                    task={task}
                    origin={resolveOrigin(task.id)}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    beginMove={beginMove}
                  />
                  <div className="card-kicker">
                    <span>{task.priority ?? task.meta ?? "关联任务"}</span>
                  </div>
                  <h3>{task.title}</h3>
                  <p>{task.detail}</p>
                </article>
              ))
            ) : (
              <div className="empty-related">
                <strong>还没有关联任务</strong>
                <p>以后可在任务编辑器中把任务关联到这个长期对象。</p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
          <div className="object-summary">
            <div><strong>{objects.filter((x) => x.kind === "兴趣").length}</strong><span>兴趣</span></div>
            <div><strong>{objects.filter((x) => x.kind === "目标").length}</strong><span>长期目标</span></div>
            <div><strong>{objects.filter((x) => x.kind === "长期想法").length}</strong><span>长期想法</span></div>
            <p>点击任意对象，可以查看它当前关联的任务。</p>
          </div>
          <div className="object-grid">
            {objects.map((object) => {
              const count = tasks.filter(
                (task) =>
                  object.relatedTaskIds.includes(task.id) ||
                  task.object === object.title,
              ).length;
              return (
                <article className={`object-card ${object.tone}`} key={object.id}>
                  <header>
                    <span>{object.kind}</span>
                    <span>{count} 项关联</span>
                  </header>
                  <h2>{object.title}</h2>
                  <p>{object.description}</p>
                  <div className="object-links">
                    <span>◎ {count} 个关联任务</span>
                    <small>{object.activity}</small>
                  </div>
                  <button onClick={() => setSelectedObjectId(object.id)}>
                    查看关联任务 →
                  </button>
                </article>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

function originLabel(origin: TaskOrigin) {
  if (origin.kind === "canvas") return "白板";
  if (origin.kind === "inbox") return "收集箱";
  if (origin.kind === "todo") return "待办列表";
  if (origin.kind === "cache") return "缓存列表";
  return "任务存储器";
}

function targetName(
  target:
    | { kind: "whiteboard" }
    | { kind: "workbench"; list: "inbox" | "todo" | "cache" }
    | { kind: "storage"; columnId: string },
  columns: StoreColumn[],
) {
  if (target.kind === "whiteboard") return "白板";
  if (target.kind === "workbench") {
    return target.list === "inbox"
      ? "收集箱"
      : target.list === "todo"
        ? "待办列表"
        : "缓存列表";
  }
  return columns.find((column) => column.id === target.columnId)?.title ?? "任务池";
}
