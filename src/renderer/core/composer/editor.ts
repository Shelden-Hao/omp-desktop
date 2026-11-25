/**
 * contenteditable 输入区的 DOM 操作。全部是普通函数，接收编辑器元素，
 * 不依赖 React —— chip 直接嵌在文本流里，文字会围绕它换行；
 * React 只在 chip 增删/发送后同步 state，不回写 innerHTML。
 */

import type { ResourceCandidate } from "../resources";
import {
  CHIP_ATTRS,
  CHIP_SELECTOR,
  RESOURCE_CHIP_ATTR,
  RESOURCE_TOKEN_RE,
  SKILL_CHIP_ATTR,
  SKILL_TOKEN_RE,
} from "./tokens";

/** 序列化编辑器内容：chip 还原成 `/skill:name` / `@path`，普通文本原样输出 */
export function readEditorText(editor: HTMLElement | null): string {
  if (!editor) return "";
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? "";
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const elem = node as HTMLElement;
    const skill = elem.getAttribute(SKILL_CHIP_ATTR);
    if (skill) {
      out += `/skill:${skill}`;
      return;
    }
    const resource = elem.getAttribute(RESOURCE_CHIP_ATTR);
    if (resource) {
      out += resource;
      return;
    }
    if (elem.tagName === "BR") {
      out += "\n";
      return;
    }
    if ((elem.tagName === "DIV" || elem.tagName === "P") && out && !out.endsWith("\n")) {
      out += "\n";
    }
    elem.childNodes.forEach(walk);
  };
  editor.childNodes.forEach(walk);
  return out;
}

/** 当前编辑器里出现的技能名（去重），用于禁用重复联想 */
export function readSkillChips(editor: HTMLElement | null): string[] {
  if (!editor) return [];
  const chips: string[] = [];
  editor.querySelectorAll(`[${SKILL_CHIP_ATTR}]`).forEach((node) => {
    const name = node.getAttribute(SKILL_CHIP_ATTR);
    if (name && !chips.includes(name)) chips.push(name);
  });
  return chips;
}

/** 只在选区确实落在编辑器内时返回 range */
export function getEditorRange(editor: HTMLElement | null): Range | null {
  const sel = window.getSelection();
  if (!editor || !sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0);
  if (!editor.contains(range.startContainer)) return null;
  return range;
}

/** 聚焦并把光标放到末尾 */
export function focusEditor(editor: HTMLElement | null) {
  if (!editor) return;
  editor.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(editor);
  range.collapse(false);
  sel?.removeAllRanges();
  sel?.addRange(range);
}

function collapseAfter(range: Range, node: Node) {
  range.setStartAfter(node);
  range.collapse(true);
  const sel = window.getSelection();
  sel?.removeAllRanges();
  sel?.addRange(range);
}

/** 在光标处插入纯文本，替换选区 */
export function insertTextAtCursor(editor: HTMLElement | null, text: string) {
  const range = getEditorRange(editor);
  if (!range) return;
  range.deleteContents();
  const node = document.createTextNode(text);
  range.insertNode(node);
  collapseAfter(range, node);
}

/** 把联想草稿（@xxx 或 /xxx）从光标前的文本节点里删掉，避免 chip 与文本重复 */
export function dropDraftBeforeCursor(range: Range, tokenRe: RegExp) {
  let node = range.startContainer;
  let offset = range.startOffset;
  // 光标可能停在 contenteditable 容器本身（如点击联想项后），此时取前一个文本节点的末尾
  if (node.nodeType === Node.ELEMENT_NODE && offset > 0) {
    const previous = node.childNodes[offset - 1];
    if (previous?.nodeType === Node.TEXT_NODE) {
      node = previous;
      offset = previous.textContent?.length ?? 0;
    }
  }
  if (node.nodeType !== Node.TEXT_NODE || offset === 0) return;
  const match = (node.textContent ?? "").slice(0, offset).match(tokenRe);
  if (!match) return;
  const start = offset - match[0].length;
  const drop = document.createRange();
  drop.setStart(node, start);
  drop.setEnd(node, offset);
  drop.deleteContents();
  range.setStart(node, start);
  range.collapse(true);
}

interface ChipSpec {
  className: string;
  attr: string;
  value: string;
  title: string;
  label: string;
  tokenRe: RegExp;
}

/** 插入一个不可编辑的 inline chip + 尾随空格（空格既是间隔也是光标锚点） */
function insertChip(editor: HTMLElement | null, spec: ChipSpec) {
  const range = getEditorRange(editor);
  if (!range) return;
  dropDraftBeforeCursor(range, spec.tokenRe);
  const chip = document.createElement("span");
  chip.className = spec.className;
  chip.setAttribute("contenteditable", "false");
  chip.setAttribute(spec.attr, spec.value);
  chip.title = spec.title;
  const remove = document.createElement("span");
  remove.className = "omp-skill-chip-remove";
  remove.setAttribute("contenteditable", "false");
  remove.textContent = "×";
  const label = document.createElement("span");
  label.textContent = spec.label;
  chip.append(remove, label);
  const tail = document.createTextNode(" ");
  const fragment = document.createDocumentFragment();
  fragment.append(chip, tail);
  range.insertNode(fragment);
  collapseAfter(range, tail);
}

export function insertSkillChip(editor: HTMLElement | null, name: string) {
  insertChip(editor, {
    className: "omp-skill-chip",
    attr: SKILL_CHIP_ATTR,
    value: name,
    title: `技能 ${name} · × 或 Backspace 删除`,
    label: name,
    tokenRe: SKILL_TOKEN_RE,
  });
}

export function insertResourceChip(editor: HTMLElement | null, candidate: ResourceCandidate) {
  if (!getEditorRange(editor)) focusEditor(editor);
  insertChip(editor, {
    className: "omp-resource-chip",
    attr: RESOURCE_CHIP_ATTR,
    value: candidate.value,
    title: `${candidate.group}：${candidate.detail} · × 或 Backspace 删除`,
    label: candidate.label,
    tokenRe: RESOURCE_TOKEN_RE,
  });
}

/** 删除 chip，连带去掉它的尾随空白，避免留下孤立的空格 */
export function removeChip(editor: HTMLElement | null, chip: HTMLElement) {
  const blank = chip.nextSibling;
  if (blank?.nodeType === Node.TEXT_NODE && (blank.textContent ?? "").trim() === "") {
    blank.parentNode?.removeChild(blank);
  }
  chip.remove();
  return readSkillChips(editor);
}

export interface ComposerDraft {
  skill: string | null;
  resource: string | null;
}

/** 读取光标前的联想草稿：`@` 优先，避免 `@path/xxx` 被当成技能指令 */
export function readDraft(range: Range | null): ComposerDraft {
  if (!range) return { skill: null, resource: null };
  const node = range.startContainer;
  const before =
    node.nodeType === Node.TEXT_NODE && range.startOffset > 0
      ? (node.textContent ?? "").slice(0, range.startOffset)
      : (node.textContent ?? "");
  const skillMatch = before.match(SKILL_TOKEN_RE);
  const resourceMatch = before.match(RESOURCE_TOKEN_RE);
  return {
    skill: resourceMatch ? null : (skillMatch?.[1] ?? null),
    resource: resourceMatch?.[1] ?? null,
  };
}

/**
 * Backspace 时判断光标前是否紧邻 chip。
 * 光标停在 chip 的尾随空格里时一次删除空格与 chip。
 */
export function chipBeforeCaret(range: Range): { chip: HTMLElement; blank: Node | null } | null {
  if (!range.collapsed) return null;
  const node = range.startContainer;
  let chip: Node | null = null;
  let blank: Node | null = null;
  if (node.nodeType === Node.TEXT_NODE) {
    if (range.startOffset === 0) {
      chip = node.previousSibling;
    } else if (range.startOffset <= 1 && !(node.textContent ?? "").trim()) {
      chip = node.previousSibling;
      blank = node;
    }
  } else {
    chip = node.childNodes[range.startOffset - 1] ?? null;
  }
  if (chip instanceof HTMLElement && CHIP_ATTRS.some((attr) => chip.hasAttribute(attr))) {
    return { chip, blank };
  }
  return null;
}

/** 点击 × 时从事件目标向上找 chip */
export function chipFromEventTarget(target: HTMLElement): HTMLElement | null {
  const removeButton = target.closest(".omp-skill-chip-remove");
  if (!removeButton) return null;
  const chip = removeButton.closest(CHIP_SELECTOR);
  return chip instanceof HTMLElement ? chip : null;
}
