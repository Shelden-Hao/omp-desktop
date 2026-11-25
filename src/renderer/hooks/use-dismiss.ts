import { useEffect, useRef, type RefObject } from "react";

interface DismissOptions {
  /** 面板容器：点击不在容器内即关闭 */
  ref?: RefObject<HTMLElement | null>;
  /** 容器之外的豁免区域选择器（触发器、面板本体等） */
  ignore?: string[];
  onDismiss(): void;
}

/**
 * 「点外部 / 按 Esc 关闭」的统一实现。
 * 下拉、弹层都用它，避免每个面板各写一份 document 监听导致重复绑定与遗漏解绑。
 */
export function useDismiss(open: boolean, { ref, ignore, onDismiss }: DismissOptions) {
  const handlerRef = useRef(onDismiss);

  useEffect(() => {
    handlerRef.current = onDismiss;
  });

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (ref) {
        if (!ref.current?.contains(target as Node)) handlerRef.current();
        return;
      }
      for (const selector of ignore ?? []) {
        if (target?.closest(selector)) return;
      }
      handlerRef.current();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") handlerRef.current();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, ref, ignore]);
}
