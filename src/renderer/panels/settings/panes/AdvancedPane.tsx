import type { CustomModelState, OmpConfigData } from "../../../../shared/types";
import type { PaneProps } from "../types";

interface AdvancedPaneProps extends PaneProps {
	ompConfig: OmpConfigData | null;
	models: CustomModelState | null;
}

export function AdvancedPane({ draft, patch, ompConfig, models }: AdvancedPaneProps) {
	return (
		<section id="omp-settings-advanced" className="omp-settings-section">
			<div className="omp-settings-card">
				<div className="omp-set-stack">
					<label>
						<span>omp CLI 路径</span>
						<input
							value={draft.ompCliPath}
							onChange={(event) => patch({ ompCliPath: event.target.value })}
						/>
					</label>
					<label>
						<span>bun 路径</span>
						<input
							value={draft.bunPath}
							onChange={(event) => patch({ bunPath: event.target.value })}
						/>
					</label>
					<label>
						<span>omp 配置文件</span>
						<input value={ompConfig?.configPath ?? ""} readOnly />
					</label>
					<label>
						<span>模型配置文件</span>
						<input value={models?.path ?? ""} readOnly />
					</label>
				</div>
			</div>
		</section>
	);
}
