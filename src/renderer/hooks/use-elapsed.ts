/**
 * 执行中每秒刷新一次的已用时长，给「处理中」标题提供实时进度；
 * 结束后调用方改用最终的 durationMs。
 */

import { useEffect, useState } from "react";

export function useElapsed(active: boolean, since: number) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) return;
    const update = () => setElapsed(Date.now() - since);
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [active, since]);

  return active ? elapsed : 0;
}
