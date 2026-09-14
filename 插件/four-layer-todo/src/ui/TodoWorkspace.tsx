"use client";
import React from "react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { tr } from "../i18n";

export type TaskItem = {
  id: string;
  title: string;
  detail: string;
  source: "笔记" | "文本";
  linkedNotePath?: string;
  meta?: string;
  priority?: "P2" | "P3" | "P4" | "P5";
  object?: string;
  done?: boolean;
  readOnlyConflict?: boolean;
  conflictOriginalId?: string;
  conflictPath?: string;
};

type CanvasCard = TaskItem & {
  x: number;
  y: number;
  tone: "sage" | "cream" | "lavender" | "blue";
  parent?: string;
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
  loadSnapshot: () => Promise<Partial<WorkspaceState> | null>;
  subscribe?: (listener: (state: Partial<WorkspaceState>) => void) => () => void;
  createTask?: (task: TaskItem, target: NoteTaskTarget) => Promise<void> | void;
  updateTask?: (task: TaskItem) => Promise<void> | void;
  createPool?: (column: StoreColumn) => Promise<void> | void;
  createLongTermObject?: (object: LongTermObject) => Promise<void> | void;
  updateCanvasLayout?: (state: Pick<WorkspaceState,
    "canvasCards" | "canvasConnections" | "canvasTextNotes"
  >) => Promise<void> | void;
  setTransparentUi?: (value: boolean) => Promise<void> | void;
  archiveTask?: (taskId: string) => Promise<void> | void;
  deleteTask?: (taskId: string) => Promise<void> | void;
  searchNotes?: (query: string) => Promise<LinkedNoteSuggestion[]>;
  moveTaskNote?: (path: string, target: NoteTaskTarget) => Promise<void> | void;
  moveTaskById?: (taskId: string, target: NoteTaskTarget) => Promise<boolean> | boolean;
  openNote?: (path: string) => Promise<void> | void;
  openTaskNote?: (taskId: string) => Promise<void> | void;
  openNativeCanvas?: () => Promise<void> | void;
  listNativeCanvases?: () => Promise<NativeCanvasFile[]>;
  loadNativeCanvas?: (path: string) => Promise<void> | void;
};

const poolTones = ["green", "amber", "blue", "violet"];
const CANVAS_CARD_WIDTH = 250;
const CANVAS_CARD_HEIGHT = 280;
const CANVAS_TEXT_NOTE_WIDTH = 220;
const CANVAS_TEXT_NOTE_HEIGHT = 220;
const CANVAS_CARD_GAP = 22;
const CANVAS_SAFE_PADDING = 16;
const CANVAS_TOP_SAFE_AREA = 70;

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
        aria-label={tr("创建待办")}
        title={tr("创建待办")}
      >
        <Icon>＋</Icon>
      </button>
      <button
        className="task-link-button"
        onClick={onLink}
        aria-label={tr("链接笔记")}
        title={tr("链接笔记")}
      >
        <Icon>⛓</Icon>
      </button>
    </div>
  );
}

function destinationLabel(destination: MoveDestination) {
  if (destination === "whiteboard") return tr("白板");
  if (destination === "workbench") return tr("缓存工作台");
  if (destination === "archive") return tr("归档");
  if (destination === "delete") return tr("删除");
  if (destination === "unlink") return tr("取消链接");
  return tr("任务存储器");
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
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);
  const [movingTaskId, setMovingTaskId] = useState<string | null>(null);
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
  const movingTaskIdsRef = useRef(new Set<string>());

  useEffect(() => {
    const board = canvasRef.current;
    if (!board || typeof ResizeObserver === "undefined") return;

    const keepItemsInBounds = () => {
      const { width, height } = board.getBoundingClientRect();
      if (
        width < CANVAS_CARD_WIDTH + CANVAS_SAFE_PADDING * 2 ||
        height < CANVAS_CARD_HEIGHT + CANVAS_TOP_SAFE_AREA + CANVAS_SAFE_PADDING
      ) {
        return;
      }
      const maxCardX = Math.max(CANVAS_SAFE_PADDING, width - CANVAS_CARD_WIDTH - CANVAS_SAFE_PADDING);
      const maxCardY = Math.max(CANVAS_TOP_SAFE_AREA, height - CANVAS_CARD_HEIGHT - CANVAS_SAFE_PADDING);
      const maxNoteX = Math.max(CANVAS_SAFE_PADDING, width - CANVAS_TEXT_NOTE_WIDTH - CANVAS_SAFE_PADDING);
      const maxNoteY = Math.max(CANVAS_TOP_SAFE_AREA, height - CANVAS_TEXT_NOTE_HEIGHT - CANVAS_SAFE_PADDING);

      setCanvasCards((cards) => {
        let changed = false;
        const nextCards = cards.map((card) => {
          const x = Math.max(CANVAS_SAFE_PADDING, Math.min(maxCardX, card.x));
          const y = Math.max(CANVAS_TOP_SAFE_AREA, Math.min(maxCardY, card.y));
          if (x === card.x && y === card.y) return card;
          changed = true;
          return { ...card, x, y };
        });
        if (!changed) return cards;
        return nextCards;
      });
      setCanvasTextNotes((notes) => {
        let changed = false;
        const nextNotes = notes.map((note) => {
          const x = Math.max(CANVAS_SAFE_PADDING, Math.min(maxNoteX, note.x));
          const y = Math.max(CANVAS_TOP_SAFE_AREA, Math.min(maxNoteY, note.y));
          if (x === note.x && y === note.y) return note;
          changed = true;
          return { ...note, x, y };
        });
        if (!changed) return notes;
        return nextNotes;
      });
    };

    const observer = new ResizeObserver(keepItemsInBounds);
    observer.observe(board);
    keepItemsInBounds();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let active = true;
    const loadState = async () => {
      try {
        const parsed = storage ? await storage.loadSnapshot() : null;
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
        // Treat unreadable persisted state as empty while preserving the source data.
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
    if (!hydrated || !storage?.updateCanvasLayout) return;
    const timeout = window.setTimeout(() => {
      void storage.updateCanvasLayout?.({
        canvasCards,
        canvasConnections,
        canvasTextNotes,
      });
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [canvasCards, canvasConnections, canvasTextNotes, hydrated, storage]);

  useEffect(() => {
    if (normalizedCanvasLayoutRef.current || !hydrated) return;
    const board = canvasRef.current?.getBoundingClientRect();
    if (
      !board ||
      board.width < CANVAS_CARD_WIDTH + CANVAS_SAFE_PADDING * 2 ||
      board.height < CANVAS_CARD_HEIGHT + CANVAS_TOP_SAFE_AREA + CANVAS_SAFE_PADDING
    ) {
      return;
    }

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

  const toggleTransparentUi = () => {
    const next = !transparentUi;
    setTransparentUi(next);
    void Promise.resolve(storage?.setTransparentUi?.(next)).catch(() => {
      setTransparentUi(!next);
      showToast(tr("保存界面设置失败"));
    });
  };

  const openTaskEditor = (task: TaskItem) => {
    if (task.readOnlyConflict) {
      showToast(tr("该任务有重复 ID，只能打开 Markdown；请手工解决冲突后再编辑或移动。"));
      return;
    }
    setOpenMenuId(null);
    setEditingTask({ ...task });
  };

  const toggleTaskDone = (card: CanvasCard) => {
    if (card.readOnlyConflict) return;
    const updated = { ...card, done: !card.done };
    setCanvasCards((cards) => cards.map((item) =>
      item.id === card.id ? updated : item,
    ));
    void Promise.resolve(storage?.updateTask?.(updated)).catch(() => {
      setCanvasCards((cards) => cards.map((item) =>
        item.id === card.id ? card : item,
      ));
      showToast(tr("更新“{title}”失败", { title: card.title }));
    });
  };

  const saveTaskEditor = async () => {
    if (!editingTask) return;
    const title = editingTask.title.trim();
    if (!title) {
      showToast(tr("任务名称不能为空"));
      return;
    }

    const updated = {
      ...editingTask,
      title,
      detail: editingTask.detail.trim(),
    };
    const replaceTask = <T extends TaskItem>(task: T): T =>
      task.id === updated.id ? { ...task, ...updated } : task;

    try {
      await storage?.updateTask?.(updated);
    } catch {
      showToast(tr("更新“{title}”失败", { title }));
      return;
    }
    setCanvasCards((tasks) => tasks.map(replaceTask));
    setInbox((tasks) => tasks.map(replaceTask));
    setTodo((tasks) => tasks.map(replaceTask));
    setCache((tasks) => tasks.map(replaceTask));
    setStoreColumns((columns) =>
      columns.map((column) => ({
        ...column,
        tasks: column.tasks.map(replaceTask),
      })),
    );
    setPendingMove((move) =>
      move?.task.id === updated.id ? { ...move, task: updated } : move,
    );
    setEditingTask(null);
    showToast(tr("已更新“{title}”", { title }));
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

  const performMove = async (
    task: TaskItem,
    origin: TaskOrigin,
    destination: MoveDestination,
  ) => {
    setOpenMenuId(null);
    if (task.readOnlyConflict) {
      showToast(tr("该任务有重复 ID，只能打开 Markdown；请手工解决冲突后再编辑或移动。"));
      return;
    }
    if (destination === "archive") {
      if (!storage?.archiveTask) {
        showToast(tr("归档仅在 Obsidian 插件中可用"));
        return;
      }
      try {
        await storage.archiveTask(task.id);
        removeFromOrigin(origin, task.id);
        showToast(tr("已将“{title}”归档", { title: task.title }));
      } catch {
        showToast(tr("归档“{title}”失败", { title: task.title }));
      }
      return;
    }
    if (destination === "delete") {
      try {
        await storage?.deleteTask?.(task.id);
        removeFromOrigin(origin, task.id);
        showToast(tr("已删除“{title}”", { title: task.title }));
      } catch {
        showToast(tr("删除“{title}”失败", { title: task.title }));
      }
      return;
    }
    if (destination === "unlink") {
      if (!storage?.archiveTask) {
        showToast(tr("归档仅在 Obsidian 插件中可用"));
        return;
      }
      try {
        await storage.archiveTask(task.id);
        removeFromOrigin(origin, task.id);
        showToast(tr("已取消“{title}”的链接并归档卡片", { title: task.title }));
      } catch {
        showToast(tr("归档“{title}”失败", { title: task.title }));
      }
      return;
    }
    setPendingMove({ task, origin, destination });
    showPage(destination);
    showToast(tr("已选中“{title}”；请点击一个具体位置添加到{destination}。", {
      title: task.title,
      destination: destinationLabel(destination),
    }));
  };

  const beginMove = (
    task: TaskItem,
    origin: TaskOrigin,
    destination: MoveDestination,
  ): void => {
    void performMove(task, origin, destination).catch((error: unknown) => {
      console.error("Four Layer Todo: move action failed", error);
      showToast(tr("移动“{title}”失败", { title: task.title }));
    });
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

  const performCompleteMove = async (
    target:
      | { kind: "whiteboard" }
      | { kind: "workbench"; list: "inbox" | "todo" | "cache" }
      | { kind: "storage"; columnId: string },
  ) => {
    if (!pendingMove) return;
    const taskId = pendingMove.task.id;
    if (movingTaskIdsRef.current.has(taskId)) return;
    movingTaskIdsRef.current.add(taskId);
    setMovingTaskId(taskId);
    try {
    const noteTarget: NoteTaskTarget =
      target.kind === "whiteboard"
        ? { location: "canvas" }
        : target.kind === "workbench"
          ? { location: target.list }
          : { location: "storage", columnId: target.columnId };
    if (storage?.moveTaskById) {
      try {
        const moved = await storage.moveTaskById(pendingMove.task.id, noteTarget);
        if (moved) {
          showToast(tr("已将“{title}”移动到{destination}", {
            title: pendingMove.task.title,
            destination: targetName(target, storeColumns),
          }));
          setPendingMove(null);
          return;
        }
      } catch {
        showToast(tr("移动“{title}”失败", { title: pendingMove.task.title }));
        return;
      }
    }
    removeFromOrigin(pendingMove.origin, pendingMove.task.id);
    const movedTask: TaskItem = {
      id: pendingMove.task.id,
      title: pendingMove.task.title,
      detail: pendingMove.task.detail,
      source: pendingMove.task.source,
      linkedNotePath: pendingMove.task.linkedNotePath,
      meta: tr("移动自{origin}", { origin: originLabel(pendingMove.origin) }),
      priority: pendingMove.task.priority,
      object: pendingMove.task.object,
    };

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
    showToast(tr("已添加到{destination}", { destination: targetName(target, storeColumns) }));
    setPendingMove(null);
    } finally {
      movingTaskIdsRef.current.delete(taskId);
      setMovingTaskId((current) => current === taskId ? null : current);
    }
  };

  const completeMove = (
    target:
      | { kind: "whiteboard" }
      | { kind: "workbench"; list: "inbox" | "todo" | "cache" }
      | { kind: "storage"; columnId: string },
  ): void => {
    void performCompleteMove(target).catch((error: unknown) => {
      console.error("Four Layer Todo: complete move failed", error);
      showToast(tr("移动待办失败"));
    });
  };

  const addCanvasTask = async () => {
    const title = newTaskTitle.trim();
    if (!title) return;
    const board = canvasRef.current?.getBoundingClientRect();
    const position = findAvailableCanvasCardPosition(
      canvasCards,
      canvasTextNotes,
      board ? { width: board.width, height: board.height } : undefined,
    );
    const task: CanvasCard = {
      id: createId("canvas"),
      title,
      detail: newTaskDetail.trim(),
      source: "文本",
      meta: tr("手动加入"),
      ...position,
      tone: "cream",
    };
    try {
      await storage?.createTask?.(task, { location: "canvas" });
    } catch {
      showToast(tr("创建“{title}”失败", { title }));
      return;
    }
    if (!storage?.createTask) setCanvasCards((cards) => [...cards, task]);
    setNewTaskTitle("");
    setNewTaskDetail("");
    setAddingTask(false);
    showToast(tr("任务已放入白板"));
  };

  const addPool = async () => {
    const title = newPoolTitle.trim();
    if (!title) return;
    const column: StoreColumn = {
      id: createId("pool"),
      title,
      hint: tr("自定义任务池"),
      tone: poolTones[storeColumns.length % poolTones.length],
      tasks: [],
    };
    try {
      await storage?.createPool?.(column);
    } catch {
      showToast(tr("创建任务池失败"));
      return;
    }
    if (!storage?.createPool) setStoreColumns((columns) => [...columns, column]);
    setNewPoolTitle("");
    setAddingPool(false);
  };

  const addLongTermObject = async () => {
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
      description: newLongTermObjectDescription.trim() || tr("暂无说明。"),
      activity: tr("等待关联任务"),
      tone: toneByKind[newLongTermObjectKind],
      relatedTaskIds: [],
    };

    try {
      await storage?.createLongTermObject?.(object);
    } catch {
      showToast(tr("创建长期对象失败"));
      return;
    }
    if (!storage?.createLongTermObject) {
      setLongTermObjects((objects) => [...objects, object]);
    }
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

  const addRelatedTask = async () => {
    const title = newRelatedTaskTitle.trim();
    const object = longTermObjects.find((item) => item.id === addingRelatedTaskTo);
    const columnId = storeColumns.some((column) => column.id === newRelatedTaskPoolId)
      ? newRelatedTaskPoolId
      : storeColumns[0]?.id;
    if (!title || !object || !columnId) return;

    const taskId = createId("store");
    const task: TaskItem = {
      id: taskId,
      title,
      detail: newRelatedTaskDetail.trim(),
      source: "文本",
      priority: "P3",
      object: object.title,
    };
    try {
      await storage?.createTask?.(task, {
        location: "storage",
        columnId,
        objectId: object.id,
      });
    } catch {
      showToast(tr("创建关联任务失败"));
      return;
    }
    if (!storage?.createTask) {
      setStoreColumns((columns) => columns.map((column) =>
        column.id === columnId
          ? { ...column, tasks: [...column.tasks, task] }
          : column,
      ));
    }
    setAddingRelatedTaskTo(null);
    setNewRelatedTaskTitle("");
    setNewRelatedTaskDetail("");
    setNewRelatedTaskPoolId("");
    showToast(tr("已将“{title}”关联到“{object}”", { title, object: object.title }));
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
        showToast(tr("移动待办笔记暂不可用"));
        return;
      }
      try {
        await storage.moveTaskNote(note.path, noteTaskTarget);
        showToast(tr("已将“{title}”移动到指定位置", { title: note.title }));
        closeNotePicker();
      } catch {
        showToast(tr("移动“{title}”失败", { title: note.title }));
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
      detail: "",
      source: "笔记",
      meta: tr("双链笔记"),
      priority: "P3",
      object: object?.title,
      linkedNotePath: note.path,
    };

    try {
      await storage?.createTask?.(task, noteTaskTarget);
    } catch {
      showToast(tr("创建“{title}”失败", { title: note.title }));
      return;
    }

    if (!storage?.createTask && noteTaskTarget.location === "canvas") {
      setCanvasCards((cards) => {
        const board = canvasRef.current?.getBoundingClientRect();
        const position = findAvailableCanvasCardPosition(
          cards,
          canvasTextNotes,
          board ? { width: board.width, height: board.height } : undefined,
        );
        return [...cards, { ...task, ...position, tone: "cream" }];
      });
    } else if (!storage?.createTask && noteTaskTarget.location === "inbox") {
      setInbox((items) => [...items, task]);
    } else if (!storage?.createTask && noteTaskTarget.location === "todo") {
      setTodo((items) => [...items, task]);
    } else if (!storage?.createTask && noteTaskTarget.location === "cache") {
      setCache((items) => [...items, task]);
    } else if (!storage?.createTask) {
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
    if (!storage?.createTask && object) {
      setLongTermObjects((objects) =>
        objects.map((item) =>
          item.id === object.id
            ? {
                ...item,
                activity: tr("最近关联：{title}", { title: note.title }),
                relatedTaskIds: [...new Set([...item.relatedTaskIds, taskId])],
              }
            : item,
        ),
      );
    }
    closeNotePicker();
    showToast(tr("已以双链添加“{title}”", { title: note.title }));
  };

  const openTaskNote = (task: TaskItem) => {
    const handler = storage?.openTaskNote;
    if (!handler) {
      showToast(tr("没有找到对应的 Markdown 笔记"));
      return;
    }
    const action = handler(task.id);
    void Promise.resolve(action).catch(() =>
      showToast(tr("打开“{title}”的 Markdown 笔记失败", { title: task.title })),
    );
  };

  const openNativeCanvas = () => {
    if (!storage?.openNativeCanvas) {
      showToast(tr("原生 Canvas 仅在 Obsidian 插件中可用"));
      return;
    }
    void Promise.resolve(
      storage.openNativeCanvas(),
    )
      .catch(() => showToast(tr("打开原生 Canvas 失败")));
  };

  const openNativeCanvasLoader = () => {
    if (!storage?.listNativeCanvases) {
      showToast(tr("原生 Canvas 仅在 Obsidian 插件中可用"));
      return;
    }
    setShowNativeCanvasLoader(true);
    setLoadingNativeCanvases(true);
    void storage
      .listNativeCanvases()
      .then((files) => setNativeCanvasFiles(files))
      .catch(() => {
        setNativeCanvasFiles([]);
        showToast(tr("读取白板文件夹失败"));
      })
      .finally(() => setLoadingNativeCanvases(false));
  };

  const loadNativeCanvas = (file: NativeCanvasFile) => {
    if (!storage?.loadNativeCanvas) return;
    void Promise.resolve(storage.loadNativeCanvas(file.path))
      .then(() => {
        setShowNativeCanvasLoader(false);
        showToast(tr("已加载“{title}”", { title: file.title }));
      })
      .catch(() => showToast(tr("加载 Canvas 失败")));
  };

  const addStoreTask = async (columnId: string) => {
    const title = newStoreTaskTitle.trim();
    if (!title) return;
    const task: TaskItem = {
      id: createId("store"),
      title,
      detail: newStoreTaskDetail.trim(),
      source: "文本",
      priority: "P3",
    };
    try {
      await storage?.createTask?.(task, { location: "storage", columnId });
    } catch {
      showToast(tr("创建“{title}”失败", { title }));
      return;
    }
    if (!storage?.createTask) {
      setStoreColumns((columns) => columns.map((column) =>
        column.id === columnId
          ? { ...column, tasks: [...column.tasks, task] }
          : column,
      ));
    }
    setNewStoreTaskTitle("");
    setNewStoreTaskDetail("");
    setAddingStoreTaskTo(null);
  };

  const addWorkbenchTask = async (
    list: "inbox" | "todo" | "cache",
    title: string,
    detail: string,
  ) => {
    const task: TaskItem = {
      id: createId(list),
      title,
      detail,
      source: "文本",
      meta: tr("手动加入"),
    };

    try {
      await storage?.createTask?.(task, { location: list });
    } catch {
      showToast(tr("创建“{title}”失败", { title }));
      return;
    }
    if (!storage?.createTask) {
      if (list === "inbox") setInbox((items) => [...items, task]);
      if (list === "todo") setTodo((items) => [...items, task]);
      if (list === "cache") setCache((items) => [...items, task]);
    }
    showToast(tr("任务已加入工作台"));
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
    if (!storage?.updateCanvasLayout) return;
    void storage.updateCanvasLayout({
      canvasCards,
      canvasConnections: nextConnections,
      canvasTextNotes,
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
      x: Math.max(CANVAS_SAFE_PADDING, Math.min(board.width - CANVAS_TEXT_NOTE_WIDTH - CANVAS_SAFE_PADDING, event.clientX - board.left)),
      y: Math.max(CANVAS_TOP_SAFE_AREA, Math.min(board.height - CANVAS_TEXT_NOTE_HEIGHT - CANVAS_SAFE_PADDING, event.clientY - board.top)),
    });
    setAddingTextNote(true);
  };

  const handlePointerDown = (
    event: ReactPointerEvent<HTMLElement>,
    card: CanvasCard,
  ) => {
    if ((event.target as HTMLElement).closest("button")) return;
    if (card.readOnlyConflict) return;
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
    const item = event.currentTarget.getBoundingClientRect();
    const nextX = Math.max(
      CANVAS_SAFE_PADDING,
      Math.min(board.width - item.width - CANVAS_SAFE_PADDING, event.clientX - board.left - dragging.offsetX),
    );
    const nextY = Math.max(
      CANVAS_TOP_SAFE_AREA,
      Math.min(board.height - item.height - CANVAS_SAFE_PADDING, event.clientY - board.top - dragging.offsetY),
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
    if (storage?.moveTaskById) {
      if (!taskId || movingTaskIdsRef.current.has(taskId)) return;
      movingTaskIdsRef.current.add(taskId);
      setMovingTaskId(taskId);
      void Promise.resolve(
        storage.moveTaskById(taskId, { location: "storage", columnId }),
      )
        .catch(() => showToast(tr("移动待办失败")))
        .finally(() => {
          movingTaskIdsRef.current.delete(taskId);
          setMovingTaskId((current) => current === taskId ? null : current);
        });
      return;
    }
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
      className={`kanban-card ${task.readOnlyConflict ? "read-only-conflict" : ""} ${openMenuId === task.id ? "task-menu-open" : ""}`}
      key={task.id}
      draggable={!task.readOnlyConflict && !pendingMove && movingTaskId !== task.id}
      onDragStart={(event) => {
        if (task.readOnlyConflict) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.setData("text/task-id", task.id);
      }}
    >
      <TaskMenu
        task={task}
        origin={{ kind: "storage", columnId }}
        openMenuId={openMenuId}
        setOpenMenuId={setOpenMenuId}
        beginMove={beginMove}
      />
      <TaskQuickActions
        task={task}
        onEdit={openTaskEditor}
        onOpen={openTaskNote}
      />
      <div className="card-kicker">
        <span>{task.priority ?? "P3"}</span>
      </div>
      <h3>{task.title}</h3>
      <p>{task.detail}</p>
      <footer>
        <span title={task.conflictPath}>
          {task.readOnlyConflict
            ? tr("ID 冲突 · 只读")
            : task.object ? `◎ ${task.object}` : tr("未关联长期对象")}
        </span>
      </footer>
    </article>
  );

  const moveBanner = pendingMove ? (
    <div className="move-banner" role="status">
      <span>{tr("正在移动：")}<strong>{pendingMove.task.title}</strong></span>
      <p>{tr("请点击一个具体位置，添加到{destination}。", {
        destination: destinationLabel(pendingMove.destination),
      })}</p>
      <button onClick={() => setPendingMove(null)}>{tr("取消移动")}</button>
    </div>
  ) : null;

  const notePicker = noteTaskTarget ? (
    <div className="note-picker-backdrop" onPointerDown={(event) => event.stopPropagation()}>
      <section className="dialog-card note-picker" role="dialog" aria-label={tr("链接笔记")}>
        <span className="eyebrow">{tr("链接笔记")}</span>
        <input
          autoFocus
          value={noteSearch}
          onChange={(event) => setNoteSearch(event.target.value)}
          placeholder={tr("搜索笔记…")}
          aria-label={tr("搜索笔记")}
        />
        <div className="note-suggestion-list">
          {loadingNoteSuggestions ? (
            <span>{tr("正在查找笔记")}</span>
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
            <span>{tr("没有可用笔记")}</span>
          )}
        </div>
        <div>
          <button type="button" onClick={closeNotePicker}>{tr("取消")}</button>
        </div>
      </section>
    </div>
  ) : null;

  const taskEditor = editingTask ? (
    <div
      className="dialog-backdrop"
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) setEditingTask(null);
      }}
    >
      <form
        className="dialog-card task-editor"
        role="dialog"
        aria-label={tr("编辑任务：{title}", { title: editingTask.title })}
        onPointerDown={(event) => event.stopPropagation()}
        onSubmit={(event) => {
          event.preventDefault();
          void saveTaskEditor();
        }}
      >
        <span className="eyebrow">{tr("编辑任务卡")}</span>
        <label>
          <span>{tr("任务名称")}</span>
          <input
            autoFocus
            value={editingTask.title}
            onChange={(event) =>
              setEditingTask((task) =>
                task ? { ...task, title: event.target.value } : task,
              )
            }
          />
        </label>
        <label>
          <span>{tr("任务内容")}</span>
          <textarea
            value={editingTask.detail}
            onChange={(event) =>
              setEditingTask((task) =>
                task ? { ...task, detail: event.target.value } : task,
              )
            }
            rows={7}
          />
        </label>
        <label>
          <span>{tr("优先级")}</span>
          <select
            value={editingTask.priority ?? ""}
            onChange={(event) =>
              setEditingTask((task) =>
                task
                  ? {
                      ...task,
                      priority:
                        (event.target.value as TaskItem["priority"]) || undefined,
                    }
                  : task,
              )
            }
          >
            <option value="">{tr("未设置")}</option>
            <option value="P5">{tr("P5 · 必须优先看见")}</option>
            <option value="P4">{tr("P4 · 近期重要")}</option>
            <option value="P3">{tr("P3 · 正常候选")}</option>
            <option value="P2">{tr("P2 · 保留可能性")}</option>
          </select>
        </label>
        <div>
          <button type="button" onClick={() => setEditingTask(null)}>{tr("取消")}</button>
          <button type="submit">{tr("保存修改")}</button>
        </div>
      </form>
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
            aria-label={tr("返回缓存工作台")}
          >
            <Icon>←</Icon>
          </button>
          <div className="brand-mark">
            {brandIconSrc ? <img src={brandIconSrc} alt="" /> : tr("层")}
          </div>
          <div className="topbar-title">
            <strong>{storageView === "tasks" ? tr("任务存储器") : tr("长期对象")}</strong>
          </div>
          <div className="attention-path" aria-label={tr("当前注意力流程")}>
            <button onClick={() => showPage("whiteboard")}>{tr("1 白板")}</button>
            <i>—</i>
            <button onClick={() => showPage("workbench")}>{tr("2 工作台")}</button>
            <i>—</i>
            <span className="current">{tr("3–4 后台")}</span>
          </div>
          <button
            className="icon-button appearance-toggle"
            onClick={toggleTransparentUi}
            aria-label={transparentUi ? tr("使用原始配色") : tr("使用透明配色")}
            aria-pressed={transparentUi}
            title={transparentUi ? tr("使用原始配色") : tr("使用透明配色")}
          >
            <Icon>{transparentUi ? "◐" : "◌"}</Icon>
          </button>
          <div className="storage-search">
            <Icon>⌕</Icon>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={tr("搜索全部任务…")}
              aria-label={tr("搜索任务存储器")}
            />
          </div>
        </header>

        {moveBanner}

        <div className="storage-layout">
          <aside className="storage-sidebar">
            <div className="sidebar-section">
              <span className="sidebar-label">{tr("浏览")}</span>
              <button
                className={storageView === "tasks" && !selectedStoreColumn ? "active" : ""}
                onClick={() => {
                  setStorageView("tasks");
                  setSelectedStoreColumnId(null);
                }}
              >
                <Icon>▦</Icon>
                {tr("任务存储器")}
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
                {tr("长期对象")}
                <span>{longTermObjects.length}</span>
              </button>
            </div>
            <div className="sidebar-section">
              <span className="sidebar-label">{tr("任务池")}</span>
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
                {tr("添加任务池")}
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
                        <span className="eyebrow">{tr("任务池 · 瀑布流")}</span>
                        <h1>{selectedStoreColumn.title}</h1>
                        <p>{selectedStoreColumn.hint}</p>
                      </div>
                      <button
                        className="primary-button"
                        onClick={() => setSelectedStoreColumnId(null)}
                      >
                        {tr("查看全部任务池")}
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
                        <span className="eyebrow">{tr("全部任务 · Kanban")}</span>
                        <h1>{tr("任务存储器")}</h1>
                        <p>{tr("任务池可以自由添加；拖动卡片可调整任务所属的任务池。")}</p>
                      </div>
                      <button className="primary-button" onClick={() => setAddingPool(true)}>
                        {tr("＋ 添加任务池")}
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
                              disabled={movingTaskId === pendingMove.task.id}
                              onClick={() =>
                                completeMove({ kind: "storage", columnId: column.id })
                              }
                            >
                              {tr("添加到“{title}”", { title: column.title })}
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
                onEditTask={openTaskEditor}
                onOpenTask={openTaskNote}
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
              void addPool();
            }}
          >
            <span className="eyebrow">{tr("新任务池")}</span>
            <h2>{tr("添加一种任务类型")}</h2>
            <input
              autoFocus
              value={newPoolTitle}
              onChange={(event) => setNewPoolTitle(event.target.value)}
              placeholder={tr("例如：想看的书、外出事项")}
            />
            <div>
              <button type="button" onClick={() => setAddingPool(false)}>{tr("取消")}</button>
              <button type="submit">{tr("创建任务池")}</button>
            </div>
          </form>
        )}
        {addingStoreTaskTo && (
          <form
            className="dialog-card"
            onSubmit={(event) => {
              event.preventDefault();
              void addStoreTask(addingStoreTaskTo);
            }}
          >
            <span className="eyebrow">{tr("任务存储器")}</span>
            <h2>
              {tr("添加到")}
              {storeColumns.find((column) => column.id === addingStoreTaskTo)?.title ??
                tr("任务池")}
            </h2>
            <input
              autoFocus
              value={newStoreTaskTitle}
              onChange={(event) => setNewStoreTaskTitle(event.target.value)}
              placeholder={tr("任务名称")}
            />
            <textarea
              value={newStoreTaskDetail}
              onChange={(event) => setNewStoreTaskDetail(event.target.value)}
              placeholder={tr("任务内容（可选）")}
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
                {tr("取消")}
              </button>
              <button type="submit">{tr("添加")}</button>
            </div>
          </form>
        )}
        {addingLongTermObject && (
          <form
            className="dialog-card long-term-object-form"
            onSubmit={(event) => {
              event.preventDefault();
              void addLongTermObject();
            }}
          >
            <span className="eyebrow">{tr("新长期对象")}</span>
            <h2>{tr("记录一个长期方向")}</h2>
            <input
              autoFocus
              value={newLongTermObjectTitle}
              onChange={(event) => setNewLongTermObjectTitle(event.target.value)}
              placeholder={tr("名称，例如：学习摄影")}
            />
            <select
              value={newLongTermObjectKind}
              onChange={(event) =>
                setNewLongTermObjectKind(
                  event.target.value as LongTermObject["kind"],
                )
              }
              aria-label={tr("长期对象类型")}
            >
              <option value="兴趣">{tr("兴趣")}</option>
              <option value="目标">{tr("目标")}</option>
              <option value="长期想法">{tr("长期想法")}</option>
            </select>
            <textarea
              value={newLongTermObjectDescription}
              onChange={(event) =>
                setNewLongTermObjectDescription(event.target.value)
              }
              placeholder={tr("说明这个对象对你意味着什么（可选）")}
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
                {tr("取消")}
              </button>
              <button type="submit">{tr("创建对象")}</button>
            </div>
          </form>
        )}
        {addingRelatedTaskTo && (
          <form
            className="dialog-card"
            onSubmit={(event) => {
              event.preventDefault();
              void addRelatedTask();
            }}
          >
            <span className="eyebrow">{tr("关联任务")}</span>
            <h2>{tr("添加一项行动")}</h2>
            <input
              autoFocus
              value={newRelatedTaskTitle}
              onChange={(event) => setNewRelatedTaskTitle(event.target.value)}
              placeholder={tr("任务名称")}
            />
            <textarea
              value={newRelatedTaskDetail}
              onChange={(event) => setNewRelatedTaskDetail(event.target.value)}
              placeholder={tr("任务内容（可选）")}
              rows={4}
            />
            <select
              value={newRelatedTaskPoolId}
              onChange={(event) => setNewRelatedTaskPoolId(event.target.value)}
              aria-label={tr("保存到任务池")}
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
                {tr("取消")}
              </button>
              <button type="submit">{tr("添加任务")}</button>
            </div>
          </form>
        )}
        {notePicker}
        {taskEditor}
        {toast && <div className="toast" role="status">{toast}</div>}
      </main>
    );
  }

  return (
    <main className={`app-shell ${transparentUi ? "transparent-ui" : ""}`}>
      <header className="topbar">
        <div className="brand-mark">
          {brandIconSrc ? <img src={brandIconSrc} alt="" /> : tr("层")}
        </div>
        <div className="topbar-title">
          <strong>{flipped ? tr("缓存工作台") : tr("白板")}</strong>
        </div>
        <div className="attention-path" aria-label={tr("当前注意力流程")}>
          <span className={!flipped ? "current" : ""}>{tr("1 白板")}</span>
          <i>—</i>
          <span className={flipped ? "current" : ""}>{tr("2 工作台")}</span>
          <i>—</i>
          <button onClick={() => setMode("storage")}>{tr("3–4 后台")}</button>
        </div>
        <button
          className="icon-button appearance-toggle"
          onClick={toggleTransparentUi}
          aria-label={transparentUi ? tr("使用原始配色") : tr("使用透明配色")}
          aria-pressed={transparentUi}
          title={transparentUi ? tr("使用原始配色") : tr("使用透明配色")}
        >
          <Icon>{transparentUi ? "◐" : "◌"}</Icon>
        </button>
        <button
          className="flip-button"
          onClick={() => setFlipped((value) => !value)}
          aria-label={flipped ? tr("翻回白板") : tr("翻到背面")}
          aria-pressed={flipped}
          title={flipped ? tr("翻回白板") : tr("翻到背面")}
        >
          <span className="flip-icon" aria-hidden="true">↻</span>
        </button>
      </header>

      {moveBanner}

      <div className="workspace-stage">
        <div className={`workspace-card ${flipped ? "is-flipped" : ""}`}>
          <section className="workspace-face workspace-front" aria-hidden={flipped}>
            <div className="canvas-toolbar" aria-label={tr("白板工具")}>
              <button
                className={canvasTool === "select" ? "active" : ""}
                onClick={() => selectCanvasTool("select")}
                aria-label={tr("选择工具")}
                aria-pressed={canvasTool === "select"}
                title={tr("选择并移动卡片")}
              >
                ↖
              </button>
              <button
                className={canvasTool === "text" ? "active" : ""}
                onClick={() => selectCanvasTool("text")}
                aria-label={tr("文本笔记工具")}
                aria-pressed={canvasTool === "text"}
                data-tooltip={tr("文本笔记：点击白板空白处添加")}
                title={tr("文本笔记：点击白板空白处添加")}
              >
                T
              </button>
              <button
                className={canvasTool === "connect" ? "active" : ""}
                onClick={() => selectCanvasTool("connect")}
                aria-label={tr("连线工具")}
                aria-pressed={canvasTool === "connect"}
                data-tooltip={tr("连线：先点起点卡片，再点终点卡片")}
                title={tr("连线：先点起点卡片，再点终点卡片")}
              >
                ↗
              </button>
              <span />
              <button onClick={() => showToast(tr("当前缩放 100%"))} aria-label={tr("缩放")}>100%</button>
            </div>
            <div className="canvas-status">
              <span className="live-dot" />
              {tr("正在处理 {tasks} 项 · {connections} 条连线", {
                tasks: canvasCards.filter((card) => !card.done).length,
                connections: canvasConnections.length,
              })}
            </div>
            <div
              className={`whiteboard ${canvasTool === "text" ? "text-note-mode" : ""}`}
              ref={canvasRef}
              onPointerDown={handleWhiteboardPointerDown}
            >
              <div
                className="canvas-file-actions"
                aria-label={tr("Canvas 文件操作")}
                onPointerDown={(event) => event.stopPropagation()}
              >
                <button
                  onClick={openNativeCanvas}
                  aria-label={tr("同步并打开原生 Canvas")}
                  title={tr("同步并打开原生 Canvas")}
                >
                  <span aria-hidden="true">◫</span>
                  {tr("官方 Canvas")}
                </button>
                <button
                  onClick={openNativeCanvasLoader}
                  aria-label={tr("从白板文件夹加载 Canvas")}
                  title={tr("从白板文件夹加载 Canvas")}
                >
                  <span aria-hidden="true">⇩</span>
                  {tr("加载 Canvas")}
                </button>
              </div>
              {pendingMove?.destination === "whiteboard" && (
                <button
                  className="whiteboard-move-target"
                  disabled={movingTaskId === pendingMove.task.id}
                  onClick={() => completeMove({ kind: "whiteboard" })}
                >
                  {tr("＋ 点击这里，把“{title}”添加到白板", { title: pendingMove.task.title })}
                </button>
              )}
              <svg
                className="canvas-connections"
                aria-label={tr("任务连线")}
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
                    aria-label={tr("删除连线")}
                    title={tr("删除连线")}
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
                  } ${card.readOnlyConflict ? "read-only-conflict" : ""} ${
                    openMenuId === card.id ? "task-menu-open" : ""
                  } ${
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
                  <TaskQuickActions
                    task={card}
                    onEdit={openTaskEditor}
                    onOpen={openTaskNote}
                  />
                  {!card.readOnlyConflict && (
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
                      aria-label={tr("从“{title}”开始连线", { title: card.title })}
                      title={tr("从此卡片开始连线")}
                    >
                      <Icon>↗</Icon>
                    </button>
                  )}
                  <div className="card-kicker">
                    <span>{card.meta}</span>
                  </div>
                  <h2>{card.title}</h2>
                  <p>{card.detail}</p>
                  <footer>
                    {card.readOnlyConflict ? (
                      <span title={card.conflictPath}>{tr("ID 冲突 · 只读")}</span>
                    ) : (
                      <button
                        className={card.done ? "checked" : ""}
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={() => toggleTaskDone(card)}
                      >
                        {card.done ? tr("✓ 已完成") : tr("○ 完成")}
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
                  title={tr("双击编辑，右键删除")}
                >
                  {note.content}
                </article>
              ))}
              {addingTask && (
                <form
                  className="quick-add-card"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void addCanvasTask();
                  }}
                >
                  <span className="eyebrow">{tr("添加到白板")}</span>
                  <input
                    autoFocus
                    value={newTaskTitle}
                    onChange={(event) => setNewTaskTitle(event.target.value)}
                    placeholder={tr("任务名称")}
                  />
                  <textarea
                    value={newTaskDetail}
                    onChange={(event) => setNewTaskDetail(event.target.value)}
                    placeholder={tr("任务内容（可选）")}
                    rows={4}
                  />
                  <div>
                    <button type="button" onClick={() => setAddingTask(false)}>{tr("取消")}</button>
                    <button type="submit">{tr("加入白板")}</button>
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
                    {editingTextNoteId ? tr("编辑文本笔记") : tr("添加文本笔记")}
                  </span>
                  <textarea
                    autoFocus
                    value={newTextNoteContent}
                    onChange={(event) => setNewTextNoteContent(event.target.value)}
                    placeholder={tr("写下要保留的文本…")}
                    rows={5}
                  />
                  <div>
                    <button
                      type="button"
                      onClick={cancelTextNoteForm}
                    >
                      {tr("取消")}
                    </button>
                    <button type="submit">
                      {editingTextNoteId ? tr("保存修改") : tr("添加笔记")}
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
                title={tr("收集箱")}
                subtitle={tr("先接住，还没有判断")}
                items={inbox}
                tone="inbox"
                aiLabel={tr("整理收集箱")}
                onAi={() => showToast(tr("AI 接口已预留：整理收集箱"))}
                origin={{ kind: "inbox" }}
                isMoveTarget={pendingMove?.destination === "workbench"}
                moveDisabled={movingTaskId === pendingMove?.task.id}
                onChooseTarget={() => completeMove({ kind: "workbench", list: "inbox" })}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                onEditTask={openTaskEditor}
                beginMove={beginMove}
                onAddTask={(title, detail) => void addWorkbenchTask("inbox", title, detail)}
                onLinkNote={() => openNotePicker({ location: "inbox" })}
                onOpenTask={openTaskNote}
              />
              <WorkbenchColumn
                title={tr("待办列表")}
                subtitle={tr("想找时间开始的事情")}
                items={todo}
                tone="todo"
                aiLabel={tr("提取待办列表")}
                onAi={() => showToast(tr("AI 接口已预留：提取待办列表"))}
                origin={{ kind: "todo" }}
                isMoveTarget={pendingMove?.destination === "workbench"}
                moveDisabled={movingTaskId === pendingMove?.task.id}
                onChooseTarget={() => completeMove({ kind: "workbench", list: "todo" })}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                onEditTask={openTaskEditor}
                beginMove={beginMove}
                onAddTask={(title, detail) => void addWorkbenchTask("todo", title, detail)}
                onLinkNote={() => openNotePicker({ location: "todo" })}
                onOpenTask={openTaskNote}
              />
              <WorkbenchColumn
                title={tr("缓存列表")}
                subtitle={tr("做过一部分，等待恢复")}
                items={cache}
                tone="cache"
                aiLabel={tr("清理缓存列表")}
                onAi={() => showToast(tr("AI 接口已预留：清理缓存列表"))}
                origin={{ kind: "cache" }}
                isMoveTarget={pendingMove?.destination === "workbench"}
                moveDisabled={movingTaskId === pendingMove?.task.id}
                onChooseTarget={() => completeMove({ kind: "workbench", list: "cache" })}
                openMenuId={openMenuId}
                setOpenMenuId={setOpenMenuId}
                onEditTask={openTaskEditor}
                beginMove={beginMove}
                onAddTask={(title, detail) => void addWorkbenchTask("cache", title, detail)}
                onLinkNote={() => openNotePicker({ location: "cache" })}
                onOpenTask={openTaskNote}
              />
            </div>
            <section className="storage-preview">
              <div className="storage-preview-heading">
                <div>
                  <span className="eyebrow">{tr("后台简略视图")}</span>
                  <h2>{tr("任务存储器")}</h2>
                  <p>{tr("全部任务仍然可见，但退到当前注意力之后。")}</p>
                </div>
                <div className="preview-actions">
                  <button
                    className="primary-button"
                    onClick={() => {
                      setStorageView("tasks");
                      setMode("storage");
                    }}
                  >
                    {tr("进入任务存储器 →")}
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
                      <small>{column.tasks[0]?.title ?? tr("空任务池")}</small>
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
      {taskEditor}
      {showNativeCanvasLoader && (
        <section
          className="dialog-card native-canvas-loader"
          role="dialog"
          aria-label={tr("从白板文件夹加载 Canvas")}
        >
          <span className="eyebrow">{tr("白板文件夹")}</span>
          <h2>{tr("加载原生 Canvas")}</h2>
          <div className="native-canvas-list">
            {loadingNativeCanvases ? (
              <span>{tr("正在读取 Canvas 文件")}</span>
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
              <span>{tr("白板文件夹中没有 Canvas 文件")}</span>
            )}
          </div>
          <div>
            <button type="button" onClick={() => setShowNativeCanvasLoader(false)}>
              {tr("取消")}
            </button>
          </div>
        </section>
      )}
      {toast && <div className="toast" role="status">{toast}</div>}
    </main>
  );
}

function TaskQuickActions({
  task,
  onEdit,
  onOpen,
}: {
  task: TaskItem;
  onEdit: (task: TaskItem) => void;
  onOpen: (task: TaskItem) => void;
}) {
  return (
    <div
      className="task-quick-actions"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
    >
      {!task.readOnlyConflict && (
        <button
          type="button"
          onClick={() => onEdit(task)}
          aria-label={tr("编辑任务：{title}", { title: task.title })}
          title={tr("编辑任务内容")}
        >
          <Icon>✎</Icon>
        </button>
      )}
      <button
        type="button"
        onClick={() => onOpen(task)}
        aria-label={tr("打开 Markdown：{title}", { title: task.title })}
        title={task.readOnlyConflict
          ? tr("打开只读冲突 Markdown")
          : tr("打开对应 Markdown 笔记")}
      >
        <Icon>↗</Icon>
      </button>
    </div>
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
  if (task.readOnlyConflict) return null;
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
        aria-label={tr("移动{title}", { title: task.title })}
        aria-expanded={open}
        onClick={() => setOpenMenuId(open ? null : task.id)}
      >
        •••
      </button>
      {open && (
        <div className="task-menu-popover">
          <span>{tr("移动到哪里？")}</span>
          <button type="button" onClick={() => beginMove(task, origin, "whiteboard")}>{tr("白板")}</button>
          <button type="button" onClick={() => beginMove(task, origin, "workbench")}>{tr("缓存工作台")}</button>
          <button type="button" onClick={() => beginMove(task, origin, "storage")}>{tr("任务存储器")}</button>
          {task.linkedNotePath ? (
            <button type="button" onClick={() => beginMove(task, origin, "unlink")}>
              {tr("取消链接并归档")}
            </button>
          ) : (
            <>
              <button type="button" onClick={() => beginMove(task, origin, "archive")}>{tr("归档")}</button>
              <button type="button" onClick={() => beginMove(task, origin, "delete")}>{tr("删除")}</button>
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
  moveDisabled,
  onChooseTarget,
  openMenuId,
  setOpenMenuId,
  onEditTask,
  beginMove,
  onAddTask,
  onLinkNote,
  onOpenTask,
}: {
  title: string;
  subtitle: string;
  items: TaskItem[];
  tone: string;
  aiLabel: string;
  onAi: () => void;
  origin: TaskOrigin;
  isMoveTarget: boolean;
  moveDisabled: boolean;
  onChooseTarget: () => void;
  openMenuId: string | null;
  setOpenMenuId: (id: string | null) => void;
  onEditTask: (task: TaskItem) => void;
  beginMove: (
    task: TaskItem,
    origin: TaskOrigin,
    destination: MoveDestination,
  ) => void;
  onAddTask: (title: string, detail: string) => void;
  onLinkNote: () => void;
  onOpenTask: (task: TaskItem) => void;
}) {
  const [addingTask, setAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState("");
  const [newTaskDetail, setNewTaskDetail] = useState("");
  const stackRef = useRef<HTMLDivElement | null>(null);

  // Obsidian's workspace can sometimes claim wheel events before an embedded
  // view gets to scroll. Handle the event on the actual column scroller so the
  // pointer can stay over a task card instead of needing to grab its scrollbar.
  useEffect(() => {
    const stack = stackRef.current;
    if (!stack) return;

    const forwardWheelToStack = (event: WheelEvent) => {
      if (event.deltaY === 0 || stack.scrollHeight <= stack.clientHeight) return;

      const nextScrollTop = Math.max(
        0,
        Math.min(stack.scrollTop + event.deltaY, stack.scrollHeight - stack.clientHeight),
      );

      if (nextScrollTop === stack.scrollTop) return;

      stack.scrollTop = nextScrollTop;
      event.preventDefault();
      event.stopPropagation();
    };

    stack.addEventListener("wheel", forwardWheelToStack, { passive: false });
    return () => stack.removeEventListener("wheel", forwardWheelToStack);
  }, []);

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
        <button className="choose-target-button" disabled={moveDisabled} onClick={onChooseTarget}>
          {tr("添加到“{title}”", { title })}
        </button>
      )}
      <div className="workbench-stack" ref={stackRef}>
        {items.map((task) => (
          <article
            key={task.id}
            className={`workbench-card ${task.readOnlyConflict ? "read-only-conflict" : ""} ${openMenuId === task.id ? "task-menu-open" : ""}`}
          >
            <TaskMenu
              task={task}
              origin={origin}
              openMenuId={openMenuId}
              setOpenMenuId={setOpenMenuId}
              beginMove={beginMove}
            />
            <TaskQuickActions
              task={task}
              onEdit={onEditTask}
              onOpen={onOpenTask}
            />
            <div className="card-kicker">
              <span>{task.meta ?? tr("未分类")}</span>
            </div>
            <h3>{task.title}</h3>
            <p>{task.detail}</p>
            <footer>
              <span title={task.conflictPath}>
                {task.readOnlyConflict
                  ? tr("ID 冲突 · 只读")
                  : task.linkedNotePath ? tr("链接卡片") : tr("Markdown 待办")}
              </span>
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
              placeholder={tr("任务名称")}
            />
            <textarea
              value={newTaskDetail}
              onChange={(event) => setNewTaskDetail(event.target.value)}
              placeholder={tr("任务内容（可选）")}
              rows={3}
            />
            <div className="inline-add-actions">
              <button type="button" onClick={() => setAddingTask(false)}>{tr("取消")}</button>
              <button type="submit">{tr("添加")}</button>
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
  onEditTask,
  onOpenTask,
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
  onEditTask: (task: TaskItem) => void;
  onOpenTask: (task: TaskItem) => void;
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
          selected.relatedTaskIds.includes(task.conflictOriginalId ?? task.id) ||
          task.object === selected.title,
      )
    : [];

  return (
    <>
      <div className="storage-heading">
        <div>
          <span className="eyebrow">{tr("方向与关联")}</span>
          <h1>{tr("长期对象")}</h1>
          <p>{tr("它们不是普通任务，而是产生任务、解释推荐并长期演化的方向。")}</p>
        </div>
        <button className="primary-button" onClick={onAddObject}>
          {tr("＋ 新建长期对象")}
        </button>
      </div>
      {selected ? (
        <section className="related-task-panel">
          <header>
            <button
              className="related-back-button"
              onClick={() => setSelectedObjectId(null)}
              aria-label={tr("返回全部对象")}
              title={tr("返回全部对象")}
            >
              <Icon>←</Icon>
            </button>
            <div className="related-object-heading">
              <span className="eyebrow">{tr("{kind} · 关联任务", { kind: tr(selected.kind) })}</span>
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
                  className={`kanban-card ${task.readOnlyConflict ? "read-only-conflict" : ""} ${openMenuId === task.id ? "task-menu-open" : ""}`}
                  key={task.id}
                >
                  <TaskMenu
                    task={task}
                    origin={resolveOrigin(task.id)}
                    openMenuId={openMenuId}
                    setOpenMenuId={setOpenMenuId}
                    beginMove={beginMove}
                  />
                  <TaskQuickActions
                    task={task}
                    onEdit={onEditTask}
                    onOpen={onOpenTask}
                  />
                  <div className="card-kicker">
                    <span>{task.priority ?? task.meta ?? tr("关联任务")}</span>
                  </div>
                  <h3>{task.title}</h3>
                  <p>{task.detail}</p>
                </article>
              ))
            ) : (
              <div className="empty-related">
                <strong>{tr("还没有关联任务")}</strong>
                <p>{tr("以后可在任务编辑器中把任务关联到这个长期对象。")}</p>
              </div>
            )}
          </div>
        </section>
      ) : (
        <>
          <div className="object-summary">
            <div><strong>{objects.filter((x) => x.kind === "兴趣").length}</strong><span>{tr("兴趣")}</span></div>
            <div><strong>{objects.filter((x) => x.kind === "目标").length}</strong><span>{tr("长期目标")}</span></div>
            <div><strong>{objects.filter((x) => x.kind === "长期想法").length}</strong><span>{tr("长期想法")}</span></div>
            <p>{tr("点击任意对象，可以查看它当前关联的任务。")}</p>
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
                    <span>{tr(object.kind)}</span>
                    <span>{tr("{count} 项关联", { count })}</span>
                  </header>
                  <h2>{object.title}</h2>
                  <p>{object.description}</p>
                  <div className="object-links">
                    <span>{tr("◎ {count} 个关联任务", { count })}</span>
                    <small>{object.activity}</small>
                  </div>
                  <button onClick={() => setSelectedObjectId(object.id)}>
                    {tr("查看关联任务 →")}
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
  if (origin.kind === "canvas") return tr("白板");
  if (origin.kind === "inbox") return tr("收集箱");
  if (origin.kind === "todo") return tr("待办列表");
  if (origin.kind === "cache") return tr("缓存列表");
  return tr("任务存储器");
}

function targetName(
  target:
    | { kind: "whiteboard" }
    | { kind: "workbench"; list: "inbox" | "todo" | "cache" }
    | { kind: "storage"; columnId: string },
  columns: StoreColumn[],
) {
  if (target.kind === "whiteboard") return tr("白板");
  if (target.kind === "workbench") {
    return target.list === "inbox"
      ? tr("收集箱")
      : target.list === "todo"
        ? tr("待办列表")
        : tr("缓存列表");
  }
  return columns.find((column) => column.id === target.columnId)?.title ?? tr("任务池");
}
