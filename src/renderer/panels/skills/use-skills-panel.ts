/**
 * 技能面板的状态与动作：列表读取、市场搜索、启停、安装/卸载、创建、发布。
 *
 * 数据全部来自 omp CLI，这里不缓存也不推测状态；每个动作完成后重新拉列表，
 * 保证界面与 omp 真实配置一致。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { SkillPathsData, SkillScope, SkillSummary } from "../../../shared/types";
import { isTrustedHit, scopeOf, SCOPE_LABEL, toHits } from "./labels";
import type { MarketHit, ScopeFilter, SkillSelection, SkillSort, SkillTab } from "./types";

interface SkillsPanelOptions {
  cwd: string;
  autoInstallTrustedSkills: boolean;
}

export function useSkillsPanel({ cwd, autoInstallTrustedSkills }: SkillsPanelOptions) {
  const [tab, setTab] = useState<SkillTab>("installed");
  const [skills, setSkills] = useState<SkillSummary[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [ignored, setIgnored] = useState<string[]>([]);
  const [paths, setPaths] = useState<SkillPathsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SkillSort>("relevance");
  const [hits, setHits] = useState<MarketHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<SkillSelection>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [detailBusy, setDetailBusy] = useState(false);
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>("all");
  const [installScope, setInstallScope] = useState<SkillScope>("user");
  const [busyName, setBusyName] = useState("");
  const noticeTimer = useRef<number | null>(null);

  const flash = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => {
      setNotice((current) => (current === text ? "" : current));
    }, 4000);
  }, []);

  useEffect(
    () => () => {
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
    },
    [],
  );

  const loadInstalled = useCallback(async () => {
    setLoading(true);
    setError("");
    const [listReply, configReply, pathsReply] = await Promise.all([
      window.desktop.skills.list(cwd),
      window.desktop.skills.config("skills.ignoredSkills"),
      window.desktop.skills.paths(),
    ]);
    if (!listReply.ok || !listReply.data) {
      setError(listReply.error ?? "读取技能列表失败");
      setLoading(false);
      return;
    }
    setSkills(listReply.data.skills);
    setWarnings(listReply.data.warnings.map((item) => item.message));
    const ignoredValue = configReply.data;
    setIgnored(
      Array.isArray(ignoredValue)
        ? ignoredValue.filter((item): item is string => typeof item === "string")
        : [],
    );
    if (pathsReply.data) setPaths(pathsReply.data);
    setLoading(false);
  }, [cwd]);

  useEffect(() => {
    // 异步读取 omp 数据，放到微任务避免 effect 内同步 setState 触发级联渲染
    void Promise.resolve().then(() => void loadInstalled());
  }, [loadInstalled]);

  const runSearch = useCallback(
    async (text: string) => {
      if (!text.trim()) {
        setHits([]);
        return;
      }
      setSearching(true);
      const reply = await window.desktop.skills.search(text, sort);
      if (reply.ok && reply.data) {
        setHits(toHits(reply.data));
      } else {
        setHits([]);
        setError(reply.error ?? "搜索技能失败");
      }
      setSearching(false);
    },
    [sort],
  );

  useEffect(() => {
    if (tab !== "market" || !query.trim()) return;
    const timer = window.setTimeout(() => void runSearch(query), 350);
    return () => window.clearTimeout(timer);
  }, [query, tab, runSearch]);

  const openDetail = useCallback(
    async (item: NonNullable<SkillSelection>) => {
      setSelected(item);
      setDetail(null);
      if (item.kind !== "market") return;
      setDetailBusy(true);
      const reply = await window.desktop.skills.info(item.hit.fullName);
      setDetail(reply.ok ? (reply.data ?? null) : null);
      if (!reply.ok) flash(reply.error ?? "读取技能详情失败");
      setDetailBusy(false);
    },
    [flash],
  );

  const toggleSkill = useCallback(
    async (skill: SkillSummary, enabled: boolean) => {
      setBusyName(skill.name);
      const reply = await window.desktop.skills.enabled(skill.name, enabled);
      if (reply.ok) {
        await loadInstalled();
        setSelected(null);
        flash(`${enabled ? "已启用" : "已禁用"}技能 ${skill.name}`);
      } else {
        flash(reply.error ?? "更新技能状态失败");
      }
      setBusyName("");
    },
    [flash, loadInstalled],
  );

  const uninstall = useCallback(
    async (skill: SkillSummary) => {
      if (
        !window.confirm(`确定卸载技能 ${skill.name}？此操作由 omp 执行，会删除已安装的技能文件。`)
      )
        return;
      setBusyName(skill.name);
      const reply = await window.desktop.skills.uninstall(skill.name, scopeOf(skill.source));
      setBusyName("");
      if (reply.ok) {
        await loadInstalled();
        setSelected(null);
        flash(`已卸载 ${skill.name}`);
      } else {
        flash(reply.error ?? "卸载失败");
      }
    },
    [flash, loadInstalled],
  );

  const install = useCallback(
    async (hit: MarketHit) => {
      const trusted = isTrustedHit(hit);
      if (!(autoInstallTrustedSkills && trusted)) {
        const hint = trusted ? "该技能被标记为可信。" : "该技能未标记为可信。";
        if (!window.confirm(`安装技能 ${hit.fullName}？${hint}`)) return;
      }
      setBusyName(hit.fullName);
      const reply = await window.desktop.skills.install(hit.fullName, installScope);
      setBusyName("");
      if (reply.ok) {
        await loadInstalled();
        setTab("installed");
        flash(`已安装 ${hit.fullName} 到${SCOPE_LABEL[installScope]}`);
      } else {
        flash(reply.error ?? "安装失败");
      }
    },
    [autoInstallTrustedSkills, flash, installScope, loadInstalled],
  );

  /** 返回 true 表示创建成功，调用方据此关闭对话框 */
  const createSkill = useCallback(
    async (input: { name: string; description: string; scope: SkillScope }) => {
      const reply = await window.desktop.skills.create(input);
      if (!reply.ok) {
        flash(reply.error ?? "创建技能失败");
        return false;
      }
      await loadInstalled();
      setTab("installed");
      flash("技能已创建，编辑 SKILL.md 即可补充内容");
      return true;
    },
    [flash, loadInstalled],
  );

  const publishSkill = useCallback(
    async (dir: string, scope: string) => {
      const reply = await window.desktop.skills.publish(dir, scope);
      if (!reply.ok) {
        flash(reply.error ?? "发布技能失败");
        return false;
      }
      flash("技能已发布到 Skillshare");
      return true;
    },
    [flash],
  );

  const activeSkills = skills.filter(
    (skill) => scopeFilter === "all" || scopeOf(skill.source) === scopeFilter,
  );
  const disabledNames = ignored.filter((name) => !skills.some((skill) => skill.name === name));
  const disabledSkills: SkillSummary[] = disabledNames.map((name) => ({
    name,
    description: "已通过 omp 配置禁用",
    filePath: "",
    baseDir: "",
    source: "skills.ignoredSkills",
    hide: false,
  }));

  return {
    tab,
    setTab,
    skills,
    warnings,
    paths,
    loading,
    error,
    notice,
    query,
    setQuery,
    sort,
    setSort,
    hits,
    searching,
    selected,
    setSelected,
    detail,
    detailBusy,
    scopeFilter,
    setScopeFilter,
    installScope,
    setInstallScope,
    busyName,
    runSearch,
    loadInstalled,
    openDetail,
    toggleSkill,
    uninstall,
    install,
    createSkill,
    publishSkill,
    disabledNames,
    disabledSkills,
    userSkills: activeSkills.filter((skill) => scopeOf(skill.source) === "user"),
    projectSkills: activeSkills.filter((skill) => scopeOf(skill.source) === "project"),
    activeCount: activeSkills.length,
  };
}

export type SkillsPanelState = ReturnType<typeof useSkillsPanel>;
