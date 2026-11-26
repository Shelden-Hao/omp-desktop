/**
 * 工作区分组的本地元数据：显示别名与置顶，持久化在 sessions.json 的 workspaces 字段。
 * 分组本体由会话 cwd 推导，这里只存「用户改过的部分」，删除目录不存在于磁盘校验之外。
 */
import { useCallback, useEffect, useState } from "react";
import { dirName } from "../core/format";
import type { StoredWorkspace } from "../../shared/types";

export function useWorkspaceMeta() {
  const [workspaces, setWorkspaces] = useState<StoredWorkspace[]>([]);

  useEffect(() => {
    window.desktop.workspaces
      .get()
      .then(setWorkspaces)
      .catch(() => undefined);
  }, []);

  const persist = useCallback((next: StoredWorkspace[]) => {
    setWorkspaces(next);
    void window.desktop.workspaces.set(next).catch(() => undefined);
  }, []);

  const togglePin = useCallback(
    (dir: string) => {
      const existing = workspaces.find((item) => item.cwd === dir);
      persist(
        existing?.pinned
          ? workspaces.map((item) => (item.cwd === dir ? { ...item, pinned: false } : item))
          : [
              ...workspaces.filter((item) => item.cwd !== dir),
              { cwd: dir, ...(existing?.name ? { name: existing.name } : {}), pinned: true },
            ],
      );
    },
    [persist, workspaces],
  );

  const rename = useCallback(
    (dir: string, name: string) => {
      const existing = workspaces.find((item) => item.cwd === dir);
      const next = existing
        ? workspaces.map((item) => (item.cwd === dir ? { ...item, name } : item))
        : [...workspaces, { cwd: dir, name }];
      persist(next);
    },
    [persist, workspaces],
  );

  const remove = useCallback(
    (dir: string) => persist(workspaces.filter((item) => item.cwd !== dir)),
    [persist, workspaces],
  );

  return { workspaces, togglePin, rename, remove };
}

/** 分组排序：置顶在前，其余按目录名（分组的稳定序，不随时间抖动） */
export function sortGroupEntries<T>(
  entries: Array<[string, T]>,
  meta: StoredWorkspace[],
): Array<[string, T]> {
  const pinned = new Set(meta.filter((item) => item.pinned).map((item) => item.cwd));
  return entries.toSorted((left, right) => {
    const pin = Number(pinned.has(right[0])) - Number(pinned.has(left[0]));
    if (pin !== 0) return pin;
    return left[0].localeCompare(right[0]);
  });
}

/** 分组显示名：别名优先，缺省用目录名 */
export function groupName(dir: string, meta: StoredWorkspace[]) {
  return meta.find((item) => item.cwd === dir)?.name || dirName(dir);
}
