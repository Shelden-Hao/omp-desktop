/**
 * 行级差分：omp 的 ACP content 里给的是改动前/后的整份文件（oldText/newText），
 * 这里还原成终端那种 +/- 视图，只保留改动附近的上下文行。
 */

export interface DiffLine {
  kind: "context" | "add" | "del";
  text: string;
}

export interface DiffHunk {
  /** 本 hunk 之前被省略的未改动行数，0 表示紧接上一段 */
  skipped: number;
  lines: DiffLine[];
}

/** 单元格超过这个量级就不做 LCS：整块改成「全删 + 全加」，避免卡住界面 */
const MAX_CELLS = 4_000_000;

function toLines(text: string): string[] {
  if (text === "") return [];
  const normalized = text.endsWith("\n") ? text.slice(0, -1) : text;
  return normalized.split("\n");
}

export function lineDiff(oldText: string | null, newText: string): DiffLine[] {
  const before = oldText === null ? [] : toLines(oldText);
  const after = toLines(newText);
  if (before.length * after.length > MAX_CELLS) {
    return [
      ...before.map((text): DiffLine => ({ kind: "del", text })),
      ...after.map((text): DiffLine => ({ kind: "add", text })),
    ];
  }

  // lcs[i][j] = before[i..] 与 after[j..] 的最长公共子序列长度
  const width = after.length + 1;
  const lcs = new Uint32Array((before.length + 1) * width);
  for (let i = before.length - 1; i >= 0; i -= 1) {
    for (let j = after.length - 1; j >= 0; j -= 1) {
      lcs[i * width + j] =
        before[i] === after[j]
          ? lcs[(i + 1) * width + j + 1] + 1
          : Math.max(lcs[(i + 1) * width + j], lcs[i * width + j + 1]);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < before.length && j < after.length) {
    if (before[i] === after[j]) {
      lines.push({ kind: "context", text: before[i] });
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * width + j] >= lcs[i * width + j + 1]) {
      lines.push({ kind: "del", text: before[i] });
      i += 1;
    } else {
      lines.push({ kind: "add", text: after[j] });
      j += 1;
    }
  }
  while (i < before.length) lines.push({ kind: "del", text: before[i++] });
  while (j < after.length) lines.push({ kind: "add", text: after[j++] });
  return lines;
}

/** 把整份文件的差分切成「改动 + 前后各 context 行」的 hunk，中间省略的行只留计数 */
export function diffHunks(oldText: string | null, newText: string, context = 3): DiffHunk[] {
  const lines = lineDiff(oldText, newText);
  const keep = new Set<number>();
  lines.forEach((line, index) => {
    if (line.kind === "context") return;
    for (
      let i = Math.max(0, index - context);
      i <= Math.min(lines.length - 1, index + context);
      i += 1
    ) {
      keep.add(i);
    }
  });

  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let skipped = 0;
  lines.forEach((line, index) => {
    if (!keep.has(index)) {
      skipped += 1;
      current = null;
      return;
    }
    if (!current) {
      current = { skipped, lines: [] };
      hunks.push(current);
      skipped = 0;
    }
    current.lines.push(line);
  });
  return hunks;
}

export function diffStats(lines: DiffLine[]) {
  let added = 0;
  let removed = 0;
  for (const line of lines) {
    if (line.kind === "add") added += 1;
    else if (line.kind === "del") removed += 1;
  }
  return { added, removed };
}
