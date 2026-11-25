/* eslint-disable react/exhaustive-effect-dependencies, react/set-state-in-effect -- 命中数只能在渲染后的 DOM 上数，deps 仅作为重算触发器 */
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../shared/types";

/**
 * 对话内搜索：命中数来自渲染后的 <mark data-search-hit>，
 * 因为真正的内容经过 Markdown 渲染，只有 DOM 阶段才能数准。
 */
export function useSessionSearch(messages: ChatMessage[]) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [index, setIndex] = useState(0);
  const [hitCount, setHitCount] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const jump = (delta: number) => {
    if (!hitCount) return;
    setIndex((current) => (current + delta + hitCount) % hitCount);
  };

  const openSearch = () => {
    setOpen(true);
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
  };

  const closeSearch = () => {
    setOpen(false);
    setText("");
  };

  useEffect(() => {
    if (!open || !text.trim()) {
      setHitCount(0);
      return;
    }
    const marks = document.querySelectorAll("mark[data-search-hit]");
    setHitCount(marks.length);
    setIndex((current) => (marks.length ? current % marks.length : 0));
  }, [open, text, messages]);

  useEffect(() => {
    const marks = Array.from(document.querySelectorAll<HTMLElement>("mark[data-search-hit]"));
    marks.forEach((mark) => mark.classList.remove("omp-search-hit-active"));
    if (!open || !text.trim() || !marks.length) return;
    const active = marks[index % marks.length];
    active.classList.add("omp-search-hit-active");
    const fold = active.closest("details.omp-process-fold");
    if (fold) fold.setAttribute("open", "");
    requestAnimationFrame(() => {
      active.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }, [open, text, index, hitCount]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        openSearch();
      } else if (event.key === "Escape" && open) {
        closeSearch();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return {
    open,
    text,
    index,
    hitCount,
    inputRef,
    setText,
    setIndex,
    jump,
    openSearch,
    closeSearch,
  };
}
