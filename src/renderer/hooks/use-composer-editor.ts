import { useEffect, useRef, useState } from "react";
import type {
  FormEvent as ReactFormEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
} from "react";
import type { ChatMessage, SkillSummary } from "../../shared/types";
import {
  chipBeforeCaret,
  chipFromEventTarget,
  focusEditor,
  getEditorRange,
  insertResourceChip,
  insertSkillChip,
  insertTextAtCursor,
  readDraft,
  readEditorText,
  readSkillChips,
  removeChip,
} from "../core/composer/editor";
import type { DocFile } from "../core/docs";
import {
  extractPathsFromMessages,
  extractUrlsFromMessages,
  urlLabel,
  type ResourceCandidate,
} from "../core/resources";

interface ComposerEditorOptions {
  docs: DocFile[];
  messages: ChatMessage[];
  /** 回车发送：走调用方的 send，保证用的是最新会话与设置 */
  onSubmit(): void;
}

/**
 * 输入区（非受控 contenteditable）与两组联想菜单。
 * DOM 操作全部在 core/composer/editor.ts，这里只把 DOM 结果同步到 React state，
 * 并维护 chip、@ 资源、/ 技能三套候选的展开状态。
 */
export function useComposerEditor({ docs, messages, onSubmit }: ComposerEditorOptions) {
  const editorRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const [input, setInput] = useState("");
  const [skillChips, setSkillChips] = useState<string[]>([]);

  const [skillSuggestOpen, setSkillSuggestOpen] = useState(false);
  const [skillQuery, setSkillQuery] = useState("");
  const [skillActive, setSkillActive] = useState(0);
  const [installedSkills, setInstalledSkills] = useState<SkillSummary[]>([]);

  const [resourceSuggestOpen, setResourceSuggestOpen] = useState(false);
  const [resourceQuery, setResourceQuery] = useState("");
  const [resourceActive, setResourceActive] = useState(0);

  // 回车发送走 ref，避免 keydown 闭包拿到上一帧的 send
  const submitRef = useRef(onSubmit);
  useEffect(() => {
    submitRef.current = onSubmit;
  });

  // 每次打开联想都重新读 omp 技能列表，这样面板里新装/卸载的技能即刻生效
  useEffect(() => {
    if (!skillSuggestOpen) return;
    let cancelled = false;
    void window.desktop.skills.list().then((reply) => {
      if (!cancelled && reply.ok && reply.data) setInstalledSkills(reply.data.skills);
    });
    return () => {
      cancelled = true;
    };
  }, [skillSuggestOpen]);

  const skillQueryText = skillQuery.trim().toLowerCase();
  const skillBase = skillQueryText
    ? installedSkills.filter(
        (skill) =>
          skill.name.toLowerCase().includes(skillQueryText) ||
          skill.description.toLowerCase().includes(skillQueryText),
      )
    : installedSkills;
  const skillSuggestions = skillBase
    .filter((skill) => !skillChips.includes(skill.name))
    .slice(0, 8);

  // @ 候选全部来自真实数据：已打开文档、本会话工具调用出现过的路径、本会话出现过的网址、用户键入的网址
  const resourceQueryText = resourceQuery.trim().toLowerCase();
  const resourceList: ResourceCandidate[] = [];
  for (const doc of docs) {
    if (!doc.path) continue;
    resourceList.push({
      value: doc.path.includes(" ") ? `@"${doc.path}"` : `@${doc.path}`,
      label: doc.name,
      group: "对话中的文件",
      detail: doc.path,
    });
  }
  for (const path of extractPathsFromMessages(messages)) {
    resourceList.push({
      value: path.includes(" ") ? `@"${path}"` : `@${path}`,
      label: path.split(/[\\/]/).pop() || path,
      group: "对话中的资源",
      detail: path,
    });
  }
  const typed = resourceQuery.trim();
  if (/^https?:\/\/\S+\.\S+/.test(typed)) {
    resourceList.push({ value: typed, label: urlLabel(typed), group: "网址", detail: typed });
  }
  for (const url of extractUrlsFromMessages(messages)) {
    resourceList.push({ value: url, label: urlLabel(url), group: "网址", detail: url });
  }
  // 同一路径可能同时出现在文档和工具调用里，只保留首次出现的分组
  const seen = new Set<string>();
  const unique = resourceList.filter((item) => {
    if (seen.has(item.value)) return false;
    seen.add(item.value);
    return true;
  });
  const resourceCandidates = (
    resourceQueryText
      ? unique.filter(
          (item) =>
            item.label.toLowerCase().includes(resourceQueryText) ||
            item.detail.toLowerCase().includes(resourceQueryText),
        )
      : unique
  ).slice(0, 12);

  const editor = {
    text: () => readEditorText(editorRef.current),
    chips: () => readSkillChips(editorRef.current),
    range: () => getEditorRange(editorRef.current),
    focus: () => focusEditor(editorRef.current),
    insertText: (text: string) => insertTextAtCursor(editorRef.current, text),
    insertSkill: (name: string) => insertSkillChip(editorRef.current, name),
    insertResource: (candidate: ResourceCandidate) =>
      insertResourceChip(editorRef.current, candidate),
    remove: (chip: HTMLElement) => removeChip(editorRef.current, chip),
  };

  const syncFromEditor = () => {
    setInput(editor.text());
    setSkillChips(editor.chips());
  };

  const clear = () => {
    if (editorRef.current) editorRef.current.innerHTML = "";
    setInput("");
    setSkillChips([]);
  };

  const applyResource = (candidate: ResourceCandidate) => {
    editor.insertResource(candidate);
    setResourceSuggestOpen(false);
    setResourceQuery("");
    syncFromEditor();
    editor.focus();
  };

  const applySkill = (name: string) => {
    if (!editor.range()) editor.focus();
    editor.insertSkill(name);
    setSkillSuggestOpen(false);
    setSkillQuery("");
    syncFromEditor();
    editor.focus();
  };

  const insertHint = (text: string) => {
    if (!editor.range()) editor.focus();
    editor.insertText(text);
    syncFromEditor();
    editor.focus();
  };

  const openResourceSuggest = () => {
    if (!editor.range()) editor.focus();
    editor.insertText("@");
    onEditorInput();
    editor.focus();
  };

  const onEditorInput = () => {
    if (composingRef.current) return;
    syncFromEditor();
    const draft = readDraft(editor.range());
    // @ 优先：@ 里可能出现的 / 不应被当成技能指令
    setResourceSuggestOpen(draft.resource !== null);
    setResourceQuery(draft.resource ?? "");
    setResourceActive(0);
    setSkillSuggestOpen(draft.skill !== null);
    setSkillQuery(draft.skill ?? "");
    setSkillActive(0);
  };

  const onEditorBeforeInput = (event: ReactFormEvent<HTMLDivElement>) => {
    // 换行统一写成文本节点里的 \n，配合 white-space: pre-wrap；避免出现 div/br 打乱序列化
    const inputType = (event.nativeEvent as InputEvent).inputType;
    if (inputType === "insertParagraph" || inputType === "insertLineBreak") {
      event.preventDefault();
      editor.insertText("\n");
      syncFromEditor();
    }
  };

  const onEditorMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const chip = chipFromEventTarget(event.target as HTMLElement);
    if (!chip) return;
    event.preventDefault();
    editor.remove(chip);
    syncFromEditor();
  };

  const onEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (resourceSuggestOpen && resourceCandidates.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setResourceActive((current) => (current + 1) % resourceCandidates.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setResourceActive(
          (current) => (current - 1 + resourceCandidates.length) % resourceCandidates.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const chosen = resourceCandidates[resourceActive];
        if (chosen) applyResource(chosen);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setResourceSuggestOpen(false);
        return;
      }
    }
    if (skillSuggestOpen && skillSuggestions.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSkillActive((current) => (current + 1) % skillSuggestions.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSkillActive(
          (current) => (current - 1 + skillSuggestions.length) % skillSuggestions.length,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const chosen = skillSuggestions[skillActive];
        if (chosen) applySkill(chosen.name);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSkillSuggestOpen(false);
        return;
      }
    }
    if (event.key === "Backspace") {
      const range = editor.range();
      const hit = range ? chipBeforeCaret(range) : null;
      if (hit) {
        event.preventDefault();
        if (hit.blank) hit.blank.parentNode?.removeChild(hit.blank);
        editor.remove(hit.chip);
        syncFromEditor();
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submitRef.current();
    }
  };

  return {
    editorRef,
    /** 纯文本草稿，用于按钮可用状态与敏感信息检测 */
    input,
    skillChips,
    installedSkills,
    setInstalledSkills,
    readText: () => readEditorText(editorRef.current),
    clear,
    focus: () => editor.focus(),
    insertHint,
    applyResource,
    applySkill,
    openResourceSuggest,
    resourceSuggest: {
      open: resourceSuggestOpen,
      query: resourceQuery,
      active: resourceActive,
      setActive: setResourceActive,
      candidates: resourceCandidates,
      close: () => setResourceSuggestOpen(false),
    },
    skillSuggest: {
      open: skillSuggestOpen,
      active: skillActive,
      setActive: setSkillActive,
      items: skillSuggestions,
      close: () => setSkillSuggestOpen(false),
    },
    handlers: {
      onInput: onEditorInput,
      onBeforeInput: onEditorBeforeInput,
      onKeyDown: onEditorKeyDown,
      onMouseDown: onEditorMouseDown,
      onCompositionStart: () => {
        composingRef.current = true;
      },
      onCompositionEnd: () => {
        composingRef.current = false;
        onEditorInput();
      },
      onBlur: () => setSkillSuggestOpen(false),
    },
  };
}
