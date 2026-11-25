/**
 * 「是否正在跑一轮请求」的单一真相源。
 * state 用于渲染，ref 用于事件回调里读最新值（ACP 事件不受渲染时机约束），
 * 两者必须同时更新，所以对外只暴露 setRunning。
 */

import { useCallback, useRef, useState } from "react";
import type { MutableRefObject } from "react";

export interface RunningFlag {
  running: boolean;
  runningRef: MutableRefObject<boolean>;
  setRunning: (value: boolean) => void;
}

export function useRunningFlag(): RunningFlag {
  const [running, setRunningState] = useState(false);
  const runningRef = useRef(false);

  const setRunning = useCallback((value: boolean) => {
    runningRef.current = value;
    setRunningState(value);
  }, []);

  return { running, runningRef, setRunning };
}
