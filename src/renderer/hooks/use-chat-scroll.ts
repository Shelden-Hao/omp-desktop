/* eslint-disable react/exhaustive-effect-dependencies, react/set-state-in-effect -- messages/running/permissionOpen 是「重新贴底」的触发条件；切换会话必须在布局阶段把 atBottom 复位，否则本次提交的跟随判断会用到旧值 */
import { useLayoutEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../shared/types";

interface ChatScrollOptions {
  activeId: string | null;
  messages: ChatMessage[];
  running: boolean;
  /** 权限弹窗出现时也要重新贴底，否则弹窗盖住输入区时列表停在半空 */
  permissionOpen: boolean;
}

/** 消息列表的滚动位置：只在用户本来就在底部时才自动跟随新内容 */
export function useChatScroll({ activeId, messages, running, permissionOpen }: ChatScrollOptions) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const [atBottom, setAtBottom] = useState(true);

  const updateAtBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    const next = el.scrollHeight - el.scrollTop - el.clientHeight <= 24;
    atBottomRef.current = next;
    setAtBottom(next);
  };

  /** 只标记「在底部」，不主动滚动：交给跟随副作用，避免发送时列表先跳一下再回落 */
  const stickToBottom = () => {
    atBottomRef.current = true;
    setAtBottom(true);
  };

  const scrollToBottom = () => {
    const el = scrollRef.current;
    if (!el) return;
    // 不用 smooth：动画中间帧会触发 onScroll，把尚未到底的瞬间误判成用户离开了底部
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
    stickToBottom();
  };

  // 切换会话（含启动、新建）默认从底部看起；必须在布局阶段重置，否则本次提交的跟随判断会用到旧值
  useLayoutEffect(() => {
    atBottomRef.current = true;
    setAtBottom(true);
  }, [activeId]);

  useLayoutEffect(() => {
    if (!atBottomRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    // 跟随 messages 引用而非 length：流式文本是原地追加到同一个 agent 消息里的，长度不变
    el.scrollTo({ top: el.scrollHeight, behavior: "auto" });
  }, [messages, permissionOpen, running]);

  return { scrollRef, atBottom, updateAtBottom, scrollToBottom, stickToBottom };
}
