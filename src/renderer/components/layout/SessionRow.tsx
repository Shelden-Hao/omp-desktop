/**
 * 会话列表行：选中、运行态、时间，以及「三点」操作菜单（置顶/重命名/打开文件夹/归档）。
 * 只有打开文件夹是 omp 之外的真实系统能力，其余三项都落在本地索引上，文案里不夸大。
 * 批量选择：勾选框悬停显示，进入批量态后行点击改为切换勾选。
 * 只有打开文件夹是 omp 之外的真实系统能力，其余三项都落在本地索引上，文案里不夸大。
 */

import { useEffect, useRef, useState } from "react";
import { relativeTime } from "../../core/format";
import type { Session } from "../../core/session-filters";
import { useDismiss } from "../../hooks/use-dismiss";
import { Icon } from "../common/Icon";

const MENU_WIDTH = 184;

interface SessionRowProps {
	session: Session;
	active: boolean;
	running: boolean;
	/** 分组视图里行本身就是缩进项，不画会话图标 */
	grouped?: boolean;
	onSelect(session: Session): void;
	onTogglePin(session: Session): void;
	onRename(session: Session, title: string): void;
	onOpenFolder(session: Session): void;
	onArchive(session: Session): void;
	/** 批量选择态：当前行是否被勾选 */
	checked?: boolean;
	/** 是否处于批量选择态（任一行被勾选） */
	batchActive?: boolean;
	onToggleSelect?(session: Session): void;
}

interface MenuPosition {
	top: number;
	left: number;
}

export function SessionRow({
	session,
	active,
	running,
	grouped = false,
	onSelect,
	onTogglePin,
	onRename,
	onOpenFolder,
	onArchive,
	checked = false,
	batchActive = false,
	onToggleSelect,
}: SessionRowProps) {
	const [menuOpen, setMenuOpen] = useState(false);
	const [position, setPosition] = useState<MenuPosition>({ top: 0, left: 0 });
	const [confirmArchive, setConfirmArchive] = useState(false);
	const [renaming, setRenaming] = useState(false);
	const [draft, setDraft] = useState("");
	const rowRef = useRef<HTMLDivElement>(null);
	const moreRef = useRef<HTMLButtonElement>(null);

	const closeMenu = () => {
		setMenuOpen(false);
		setConfirmArchive(false);
	};

	useDismiss(menuOpen, { ref: rowRef, onDismiss: closeMenu });

	// 菜单用 fixed 定位，避免被列表的 overflow 裁掉；列表一滚就对不上，直接关掉
	useEffect(() => {
		if (!menuOpen) return;
		const onScroll = () => {
			setMenuOpen(false);
			setConfirmArchive(false);
		};
		document.addEventListener("scroll", onScroll, true);
		return () => document.removeEventListener("scroll", onScroll, true);
	}, [menuOpen]);

	const toggleMenu = () => {
		if (menuOpen) {
			closeMenu();
			return;
		}
		const rect = moreRef.current?.getBoundingClientRect();
		if (rect) {
			setPosition({
				top: rect.bottom + 4,
				left: Math.max(8, Math.min(rect.right - MENU_WIDTH, window.innerWidth - MENU_WIDTH - 8)),
			});
		}
		setConfirmArchive(false);
		setMenuOpen(true);
	};

	const startRename = () => {
		setDraft(session.title);
		setRenaming(true);
		closeMenu();
	};

	const commitRename = () => {
		const title = draft.trim();
		setRenaming(false);
		if (!title || title === session.title) return;
		onRename(session, title);
	};

	return (
		<div
			ref={rowRef}
			className={`omp-session ${active ? "active" : ""} ${grouped ? "grouped" : ""} ${
				menuOpen ? "menu-open" : ""
			}`}
		>
			{onToggleSelect && (
				<button
					type="button"
					role="checkbox"
					aria-checked={checked}
					aria-label={`选择会话 ${session.title}`}
					className={`omp-check omp-session-check ${checked ? "checked" : ""}`}
					onClick={() => onToggleSelect(session)}
				>
					{checked && <Icon name="check" size={12} />}
				</button>
			)}
			{renaming ? (
				<input
					className="omp-session-rename"
					value={draft}
					autoFocus
					aria-label="重命名会话"
					onChange={(event) => setDraft(event.target.value)}
					onBlur={commitRename}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							commitRename();
						} else if (event.key === "Escape") {
							event.preventDefault();
							setRenaming(false);
						}
					}}
				/>
			) : (
				<button
					type="button"
					className="omp-session-main"
					onClick={() => {
						closeMenu();
						if (batchActive && onToggleSelect) {
							onToggleSelect(session);
							return;
						}
						onSelect(session);
					}}
				>
					{!grouped && <Icon name={session.pinned ? "pin" : "chat"} size={14} />}
					<span className="omp-session-title">{session.title}</span>
					{running && active ? (
						<span className="omp-session-spinner" title="运行中" />
					) : (
						<time>{relativeTime(session.ts)}</time>
					)}
				</button>
			)}

			<button
				ref={moreRef}
				type="button"
				className="omp-session-more"
				aria-label="会话操作"
				aria-haspopup="menu"
				aria-expanded={menuOpen}
				onClick={toggleMenu}
			>
				<Icon name="more" size={14} />
			</button>

			{menuOpen && (
				<div
					className="omp-session-menu"
					role="menu"
					style={{ top: position.top, left: position.left }}
				>
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							onTogglePin(session);
							closeMenu();
						}}
					>
						<Icon name="pin" size={14} />
						<span>{session.pinned ? "取消置顶" : "置顶"}</span>
					</button>
					<button type="button" role="menuitem" onClick={startRename}>
						<Icon name="pencil" size={14} />
						<span>重命名</span>
					</button>
					<button
						type="button"
						role="menuitem"
						onClick={() => {
							onOpenFolder(session);
							closeMenu();
						}}
					>
						<Icon name="folder" size={14} />
						<span>打开文件夹</span>
					</button>
					<div className="omp-session-menu-seg" />
					{confirmArchive ? (
						<div className="omp-session-confirm">
							<p>
								归档会关闭 omp 会话并从本地列表移除，不会删除 omp
								服务端保存的对话记录文件。确认归档吗？
							</p>
							<div className="omp-session-confirm-actions">
								<button
									type="button"
									className="danger"
									onClick={() => {
										closeMenu();
										void onArchive(session);
									}}
								>
									归档
								</button>
								<button type="button" onClick={() => setConfirmArchive(false)}>
									取消
								</button>
							</div>
						</div>
					) : (
						<button
							type="button"
							role="menuitem"
							className="danger"
							onClick={() => setConfirmArchive(true)}
						>
							<Icon name="archive" size={14} />
							<span>归档会话</span>
						</button>
					)}
				</div>
			)}
		</div>
	);
}
