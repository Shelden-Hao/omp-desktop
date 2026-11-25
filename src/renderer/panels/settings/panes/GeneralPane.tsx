import type { LinkOpenMode, ProxyMode } from "../../../../shared/types";
import { Row, Toggle } from "../controls";
import { LINK_LABEL, PROXY_LABEL } from "../labels";
import type { PaneProps } from "../types";

export function GeneralPane({ draft, patch }: PaneProps) {
	return (
		<section id="omp-settings-general" className="omp-settings-section">
			<div className="omp-settings-card">
				<Row title="开机自动启动" desc="登录系统后自动启动应用。">
					<Toggle
						checked={draft.openAtLogin}
						label="开机自动启动"
						onChange={(value) => patch({ openAtLogin: value })}
					/>
				</Row>
				<Row title="运行时防止系统休眠" desc="仅在 omp 会话执行任务期间阻止系统休眠。">
					<Toggle
						checked={draft.preventSystemSleep}
						label="运行时防止系统休眠"
						onChange={(value) => patch({ preventSystemSleep: value })}
					/>
				</Row>
				<Row title="允许锁屏运行" desc="锁屏后仍然保持后台任务运行，屏幕可正常熄灭。">
					<Toggle
						checked={draft.keepAwakeOnLock}
						label="允许锁屏运行"
						onChange={(value) => patch({ keepAwakeOnLock: value })}
					/>
				</Row>
				<Row title="链接打开方式" desc="对话中链接被点击时的行为。">
					<select
						value={draft.linkOpenMode}
						onChange={(event) => patch({ linkOpenMode: event.target.value as LinkOpenMode })}
					>
						{Object.entries(LINK_LABEL).map(([value, label]) => (
							<option key={value} value={value}>
								{label}
							</option>
						))}
					</select>
				</Row>
				<div className="omp-set-row omp-set-row-stack">
					<div className="omp-set-row-text">
						<div className="omp-set-row-title">网络代理</div>
						<p className="omp-set-row-desc">应用网络立即生效；omp 会话在下次启动时沿用新代理。</p>
					</div>
					<div className="omp-set-proxy">
						<select
							value={draft.proxyMode}
							onChange={(event) => patch({ proxyMode: event.target.value as ProxyMode })}
						>
							{Object.entries(PROXY_LABEL).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
						{draft.proxyMode === "manual" && (
							<input
								value={draft.proxyUrl}
								placeholder="http://127.0.0.1:7890"
								onChange={(event) => patch({ proxyUrl: event.target.value })}
							/>
						)}
					</div>
				</div>
			</div>
		</section>
	);
}
