import type { ThemeMode } from "../../../../shared/types";
import { Row } from "../controls";
import { THEME_LABEL } from "../labels";
import type { PaneProps } from "../types";

export function AppearancePane({ draft, patch }: PaneProps) {
	return (
		<section id="omp-settings-appearance" className="omp-settings-section">
			<h4>全部主题</h4>
			<div className="omp-settings-card">
				<div className="omp-set-theme-grid">
					{(["light", "dark", "system"] as ThemeMode[]).map((mode) => (
						<button
							key={mode}
							type="button"
							className={`omp-set-theme-card ${draft.theme === mode ? "active" : ""}`}
							onClick={() => patch({ theme: mode })}
						>
							<span className={`omp-set-theme-thumb ${mode}`}>
								<i />
								<i />
								<i />
								{mode === "system" && <b />}
							</span>
							<span className="omp-set-theme-name">{THEME_LABEL[mode]}</span>
						</button>
					))}
				</div>
				<Row title="字体大小" desc="缩放整个界面的字号，默认 100%。">
					<div className="omp-set-range">
						<input
							type="range"
							min={0.85}
							max={1.25}
							step={0.05}
							value={draft.fontScale}
							aria-label="字体大小"
							onChange={(event) => patch({ fontScale: Number(event.target.value) })}
						/>
						<span>{Math.round(draft.fontScale * 100)}%</span>
					</div>
				</Row>
			</div>
		</section>
	);
}
