import type { SystemInfoData } from "../../../../shared/types";
import { formatBytes } from "../util";
import type { PaneProps } from "../types";

interface StoragePaneProps extends PaneProps {
	systemInfo: SystemInfoData | null;
	onOpenCache(): void;
	onPickWorkspace(): void;
}

export function StoragePane({ draft, systemInfo, onOpenCache, onPickWorkspace }: StoragePaneProps) {
	const usedPercent =
		systemInfo && systemInfo.totalBytes > 0
			? Math.min(100, (systemInfo.usedBytes / systemInfo.totalBytes) * 100)
			: 0;

	return (
		<section id="omp-settings-storage" className="omp-settings-section">
			<div className="omp-settings-card">
				<div className="omp-set-storage">
					<div className="omp-set-row-text">
						<div className="omp-set-row-title">系统缓存目录</div>
						<p className="omp-set-row-desc" title={systemInfo?.cacheDir}>
							{systemInfo?.cacheDir || "读取中…"}
						</p>
					</div>
					<button type="button" onClick={onOpenCache}>
						打开目录
					</button>
				</div>
				{systemInfo && (
					<div className="omp-set-disk">
						<div className="omp-set-disk-bar">
							<span style={{ width: `${usedPercent}%` }} />
						</div>
						<div className="omp-set-disk-legend">
							<span>磁盘已用 {formatBytes(systemInfo.usedBytes)}</span>
							<span>可用 {formatBytes(systemInfo.availableBytes)}</span>
							<span>共 {formatBytes(systemInfo.totalBytes)}</span>
						</div>
					</div>
				)}
				<div className="omp-set-storage">
					<div className="omp-set-row-text">
						<div className="omp-set-row-title">omp 默认工作空间</div>
						<p className="omp-set-row-desc">新任务默认在该路径下运行，不影响已有会话。</p>
						<input className="omp-set-path" value={draft.cwd} readOnly title={draft.cwd} />
					</div>
					<button type="button" onClick={onPickWorkspace}>
						更改
					</button>
				</div>
			</div>
		</section>
	);
}
