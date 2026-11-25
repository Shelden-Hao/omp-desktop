/**
 * 工作目录选择：omp 的 cwd 在 session/new 时就固定下来，工具也只能在该目录内读写，
 * 所以这里的每一项都会落到一个新会话上；不选就用默认目录。
 */

import { dirName, shortPath } from "../../core/format";
import { Icon } from "../common/Icon";

export interface WorkspaceMenuProps {
	open: boolean;
	/** 当前会话的工作目录 */
	current: string;
	/** 设置里的默认目录 */
	defaultDir: string;
	/** 最近用过的工作目录（不含默认目录） */
	recent: string[];
	disabled: boolean;
	onToggle(): void;
	onSelect(dir: string): void;
	onBrowse(): void;
}

export function WorkspaceMenu({
	open,
	current,
	defaultDir,
	recent,
	disabled,
	onToggle,
	onSelect,
	onBrowse,
}: WorkspaceMenuProps) {
	const isDefault = current === defaultDir;
	const options = recent.filter((dir) => dir !== current && dir !== defaultDir);

	return (
		<div className="omp-workspace-picker">
			<button
				type="button"
				className={`omp-workspace-picker-trigger ${open ? "active" : ""}`}
				onClick={onToggle}
				disabled={disabled}
				title={`工作目录：${current}`}
				aria-haspopup="menu"
				aria-expanded={open}
			>
				<Icon name="folder" size={13} />
				<span className="omp-workspace-picker-current">{shortPath(current)}</span>
				<Icon name="chevron" size={12} />
			</button>

			{open && (
				<div className="omp-workspace-picker-menu" role="menu">
					<span className="omp-workspace-picker-label">在此目录执行</span>
					<button
						type="button"
						role="menuitemradio"
						aria-checked={isDefault}
						onClick={() => onSelect(defaultDir)}
					>
						<Icon name="folder" size={13} />
						<span className="omp-workspace-picker-item-name">默认目录</span>
						<span className="omp-workspace-picker-item-path">{shortPath(defaultDir)}</span>
						{isDefault && <Icon name="check" size={13} />}
					</button>
					{options.map((dir) => (
						<button
							key={dir}
							type="button"
							role="menuitemradio"
							aria-checked={dir === current}
							onClick={() => onSelect(dir)}
						>
							<Icon name="folder" size={13} />
							<span className="omp-workspace-picker-item-name">{dirName(dir)}</span>
							<span className="omp-workspace-picker-item-path">{shortPath(dir)}</span>
							{dir === current && <Icon name="check" size={13} />}
						</button>
					))}
					<div className="omp-workspace-picker-seg" />
					<button type="button" role="menuitem" onClick={onBrowse}>
						<Icon name="plus" size={13} />
						<span className="omp-workspace-picker-item-name">选择文件夹…</span>
					</button>
				</div>
			)}
		</div>
	);
}
