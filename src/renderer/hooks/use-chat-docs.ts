import { useCallback, useState } from "react";
import { DEFAULT_DOCS, type DocFile } from "../core/docs";
import { fileName } from "../core/file-changes";

/** 右侧预览栏的文档集合：对话里的代码块、本地文件都落成这里的 tab */
export function useChatDocs(setStatus: (text: string) => void) {
  const [docs, setDocs] = useState<DocFile[]>(DEFAULT_DOCS);
  const [activeDoc, setActiveDoc] = useState<string | null>(null);
  // 默认收起：只有用户主动打开、或会话里出现新的文件改动时才展开
  const [showPreview, setShowPreview] = useState(false);

  const currentDoc = docs.find((doc) => doc.key === activeDoc);

  const openDoc = useCallback((name: string, content: string, path?: string, language?: string) => {
    const key = path || `snippet:${Math.random().toString(36).slice(2, 10)}`;
    setDocs((prev) => [
      ...prev.filter((doc) => doc.key !== key),
      { key, name, content, path, language },
    ]);
    setActiveDoc(key);
    setShowPreview(true);
  }, []);

  /** 会话里生成/修改了文件：跟随到最新内容并展开预览（同一文件反复改只保留最新一份） */
  const openChangedDoc = useCallback(
    (path: string, content: string) => {
      openDoc(fileName(path), content, path);
    },
    [openDoc],
  );

  const openLocalFile = async () => {
    try {
      const file = await window.desktop.files.open();
      if (!file) return;
      openDoc(file.name, file.content, file.path, file.language);
    } catch (error) {
      setStatus(`打开文件失败：${(error as Error).message}`);
    }
  };

  const reloadDoc = async () => {
    if (!currentDoc?.path) return;
    const path = currentDoc.path;
    const key = currentDoc.key;
    try {
      const file = await window.desktop.files.read(path);
      setDocs((prev) =>
        prev.map((doc) =>
          doc.key === key ? { ...doc, content: file.content, language: file.language } : doc,
        ),
      );
    } catch (error) {
      setStatus(`刷新文件失败：${(error as Error).message}`);
    }
  };

  const closeDoc = (key: string) => {
    setDocs((prev) => {
      const next = prev.filter((doc) => doc.key !== key);
      if (activeDoc === key) setActiveDoc(next[0]?.key || null);
      return next;
    });
  };

  return {
    docs,
    activeDoc,
    setActiveDoc,
    showPreview,
    setShowPreview,
    currentDoc,
    openDoc,
    openChangedDoc,
    openLocalFile,
    reloadDoc,
    closeDoc,
  };
}
