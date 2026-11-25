/** 市场分页：排序、安装范围与搜索结果 */
import type { SkillScope } from "../../../shared/types";
import { MarketSkillCard } from "./SkillCard";
import { SORT_LABEL } from "./labels";
import type { SkillSort } from "./types";
import type { SkillsPanelState } from "./use-skills-panel";

interface MarketTabProps {
	data: SkillsPanelState;
}

export function MarketTab({ data }: MarketTabProps) {
	const empty = () => {
		if (!data.query.trim()) return "输入关键词搜索 Skillshare 技能；结果由 omp 注册表实时返回。";
		if (data.searching) return "正在搜索…";
		if (data.hits.length === 0) return "没有找到匹配的技能。";
		return "";
	};

	return (
		<div className="omp-skill-content">
			<div className="omp-skill-toolbar">
				<div className="omp-skill-scope-switch" role="group" aria-label="排序">
					{(Object.keys(SORT_LABEL) as SkillSort[]).map((value) => (
						<button
							key={value}
							type="button"
							className={data.sort === value ? "active" : ""}
							onClick={() => data.setSort(value)}
						>
							{SORT_LABEL[value]}
						</button>
					))}
				</div>
				<div className="omp-skill-scope-switch" role="group" aria-label="安装范围">
					{(["user", "project"] as SkillScope[]).map((value) => (
						<button
							key={value}
							type="button"
							className={data.installScope === value ? "active" : ""}
							onClick={() => data.setInstallScope(value)}
						>
							{value === "user" ? "装到全局" : "装到项目"}
						</button>
					))}
				</div>
			</div>
			{empty() ? (
				<div className="omp-skill-empty">{empty()}</div>
			) : (
				<>
					<p className="omp-skill-hint">找到 {data.hits.length} 个技能</p>
					<div className="omp-skill-grid">
						{data.hits.map((hit) => (
							<MarketSkillCard
								key={hit.fullName}
								hit={hit}
								busy={data.busyName === hit.fullName}
								installScope={data.installScope}
								onOpen={() => void data.openDetail({ kind: "market", hit })}
								onInstall={() => void data.install(hit)}
							/>
						))}
					</div>
				</>
			)}
		</div>
	);
}
