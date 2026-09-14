export type FileTaskLocation = "canvas" | "inbox" | "todo" | "cache" | "storage";
export type FileTaskPriority = "P2" | "P3" | "P4" | "P5";

export type FileTaskData = {
  id: string;
  title: string;
  detail: string;
  source: "笔记" | "文本";
  priority?: FileTaskPriority;
  object?: string;
  objectId?: string;
  sortKey: number;
  done?: boolean;
  linkedNotePath?: string;
  /** Accepted only so the one-time migration can read pre-0.1.11 notes. */
  location?: FileTaskLocation;
  columnId?: string;
  meta?: string;
  x?: number;
  y?: number;
  tone?: string;
};

export type FileTaskPoolMetadata = {
  hint: string;
  tone: string;
  sortKey: number;
};

export type FileTaskPlacement = {
  location: FileTaskLocation;
  poolTitle?: string;
};

function markdownValue(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function stripGeneratedLinkedNoteBacklinks(value: string): string {
  const lines = value.split(/\r?\n/);
  const kept: string[] = [];
  let removedGeneratedLink = false;
  for (const line of lines) {
    if (/^\s*\[\[[^\r\n]*\|关联原笔记\]\]\s*$/.test(line)) {
      removedGeneratedLink = true;
      continue;
    }
    if (removedGeneratedLink && line.trim() === "]") continue;
    if (line.trim()) removedGeneratedLink = false;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export function parseSimpleFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return null;

  const values: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const entry = line.match(/^([A-Za-z][A-Za-z0-9_-]*):\s*(.*)$/);
    if (!entry) continue;
    const [, key, rawValue] = entry;
    try {
      values[key] = JSON.parse(rawValue);
    } catch {
      values[key] = rawValue.trim();
    }
  }
  return values;
}

export function frontmatterString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value : undefined;
}

export function frontmatterNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function frontmatterLocation(value: unknown): FileTaskLocation | undefined {
  return ["canvas", "inbox", "todo", "cache", "storage"].includes(String(value))
    ? (value as FileTaskLocation)
    : undefined;
}

function frontmatterPriority(value: unknown): FileTaskPriority | undefined {
  return ["P2", "P3", "P4", "P5"].includes(String(value))
    ? (value as FileTaskPriority)
    : undefined;
}

export function serializeFileTask(
  task: Omit<FileTaskData, "sortKey">,
  options: { sortKey: number; objectId?: string },
): string {
  return [
    "---",
    "fourLayerTodo: true",
    `id: ${markdownValue(task.id)}`,
    `priority: ${markdownValue(task.priority)}`,
    `done: ${markdownValue(task.done)}`,
    `sortKey: ${markdownValue(options.sortKey)}`,
    `objectId: ${markdownValue(options.objectId)}`,
    `linkedNotePath: ${markdownValue(task.linkedNotePath)}`,
    "---",
    "",
    stripGeneratedLinkedNoteBacklinks(task.detail),
    "",
  ].join("\n");
}

export function parseFileTask(
  content: string,
  fileTitle: string,
  filePath?: string,
): FileTaskData | null {
  const frontmatter = parseSimpleFrontmatter(content);
  if (!frontmatter || frontmatter.fourLayerTodo !== true) return null;

  const id = frontmatterString(frontmatter.id);
  if (!id) return null;

  const body = content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "").trim();
  const legacyHeading = body.match(/^#\s+(.+?)(?:\r?\n|$)/);
  const parsedDetail =
    legacyHeading?.[1].trim() === fileTitle
      ? body.slice(legacyHeading[0].length).trim()
      : body;
  const storedLinkedNotePath = frontmatterString(frontmatter.linkedNotePath);
  const linkedNotePath = storedLinkedNotePath === filePath ? undefined : storedLinkedNotePath;
  const source = storedLinkedNotePath || ["笔记", "Note"].includes(String(frontmatter.source))
    ? "笔记"
    : "文本";

  return {
    id,
    title: fileTitle,
    detail: stripGeneratedLinkedNoteBacklinks(parsedDetail),
    source,
    priority: frontmatterPriority(frontmatter.priority),
    object: frontmatterString(frontmatter.object),
    objectId: frontmatterString(frontmatter.objectId),
    sortKey: frontmatterNumber(frontmatter.sortKey) ?? frontmatterNumber(frontmatter.order) ?? 0,
    done: typeof frontmatter.done === "boolean" ? frontmatter.done : undefined,
    linkedNotePath,
    location: frontmatterLocation(frontmatter.location),
    columnId: frontmatterString(frontmatter.columnId),
    meta: frontmatterString(frontmatter.meta),
    x: frontmatterNumber(frontmatter.x),
    y: frontmatterNumber(frontmatter.y),
    tone: frontmatterString(frontmatter.tone),
  };
}

export function serializeFileTaskPool(metadata: FileTaskPoolMetadata): string {
  return [
    "---",
    "fourLayerTodoPool: true",
    `hint: ${markdownValue(metadata.hint)}`,
    `tone: ${markdownValue(metadata.tone)}`,
    `sortKey: ${markdownValue(metadata.sortKey)}`,
    "---",
    "",
  ].join("\n");
}

export function parseFileTaskPool(
  content: string,
  defaults: Omit<FileTaskPoolMetadata, "sortKey">,
): FileTaskPoolMetadata | null {
  const frontmatter = parseSimpleFrontmatter(content);
  if (!frontmatter || frontmatter.fourLayerTodoPool !== true) return null;
  return {
    hint: frontmatterString(frontmatter.hint) ?? defaults.hint,
    tone: frontmatterString(frontmatter.tone) ?? defaults.tone,
    sortKey: frontmatterNumber(frontmatter.sortKey) ?? frontmatterNumber(frontmatter.order) ?? 0,
  };
}

export function getFileTaskPlacement(
  rootFolder: string,
  path: string,
): FileTaskPlacement | null {
  if (path.startsWith(`${rootFolder}/白板/`)) return { location: "canvas" };
  if (path.startsWith(`${rootFolder}/缓存工作台/收集箱/`)) return { location: "inbox" };
  if (path.startsWith(`${rootFolder}/缓存工作台/待办列表/`)) return { location: "todo" };
  if (path.startsWith(`${rootFolder}/缓存工作台/缓存列表/`)) return { location: "cache" };

  const prefix = `${rootFolder}/任务存储器/`;
  if (!path.startsWith(prefix)) return null;
  const [poolTitle, child] = path.slice(prefix.length).split("/");
  return poolTitle && child ? { location: "storage", poolTitle } : null;
}

export function findDuplicateTaskIds(
  entries: Array<{ id: string; path: string; archived?: boolean }>,
): Array<{ id: string; paths: string[] }> {
  const pathsById = new Map<string, string[]>();
  for (const entry of entries) {
    if (entry.archived) continue;
    pathsById.set(entry.id, [...(pathsById.get(entry.id) ?? []), entry.path]);
  }
  return [...pathsById.entries()]
    .filter(([, paths]) => paths.length > 1)
    .map(([id, paths]) => ({ id, paths: paths.sort() }))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function selectNumericShadowCanonicalPath(
  paths: readonly string[],
): string | null {
  if (paths.length < 2) return null;
  const splitPath = (path: string) => {
    const slash = path.lastIndexOf("/");
    const directory = slash >= 0 ? path.slice(0, slash) : "";
    const file = slash >= 0 ? path.slice(slash + 1) : path;
    const basename = file.endsWith(".md") ? file.slice(0, -3) : file;
    return { path, directory, basename };
  };
  const entries = paths.map(splitPath);
  const directories = new Set(entries.map((entry) => entry.directory));
  if (directories.size !== 1) return null;

  const candidates = entries.filter((candidate) =>
    entries.every((entry) => {
      if (entry.path === candidate.path) return true;
      if (!entry.basename.startsWith(`${candidate.basename} `)) return false;
      return /^(?:\d+)(?: \d+)*$/.test(
        entry.basename.slice(candidate.basename.length + 1),
      );
    }),
  );
  return candidates.length === 1 ? candidates[0].path : null;
}

export function resolveCanvasTaskLayout(
  taskId: string,
  index: number,
  layouts: ReadonlyMap<string, { x: number; y: number; tone: string }>,
): { x: number; y: number; tone: string } {
  return layouts.get(taskId) ?? {
    x: 40 + (index % 3) * 280,
    y: 100 + Math.floor(index / 3) * 190,
    tone: "cream",
  };
}

export function compareFileSourceOrder(
  left: { sortKey: number; title: string },
  right: { sortKey: number; title: string },
): number {
  return left.sortKey - right.sortKey || left.title.localeCompare(right.title);
}
