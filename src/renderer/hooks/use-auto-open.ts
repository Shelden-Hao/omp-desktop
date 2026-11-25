/**
 * 过程类折叠区的展开规则：运行中自动展开（让用户看到 Agent 在做什么），
 * 这一轮结束后自动折叠；用户手动切换过一次之后，以用户的意图为准。
 *
 * `toggle` 事件在属性被程序改动时也会触发，所以只处理与当前派生值不同的切换。
 */

import { useState, type SyntheticEvent } from "react";

export function useAutoOpen(live: boolean) {
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? live;

  const onToggle = (event: SyntheticEvent<HTMLDetailsElement>) => {
    const next = event.currentTarget.open;
    if (next !== open) setManual(next);
  };

  return { open, onToggle };
}
