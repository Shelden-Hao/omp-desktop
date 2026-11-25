import type { DesktopSettings } from "../../../shared/types";

export interface NavItem {
  id: string;
  label: string;
  desc: string;
  icon: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

/** 所有设置分页共用的上下文：草稿、改写草稿、报错与轻提示 */
export interface PaneProps {
  draft: DesktopSettings;
  patch(next: Partial<DesktopSettings>): void;
  setError(text: string): void;
  notify(text: string): void;
}
