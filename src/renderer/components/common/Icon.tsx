/**
 * 图标集合：一个 name 一条 path，全部内联 SVG，不引外部图标库。
 * 新增图标时同时扩展 IconName 与 switch 分支，避免出现没有路径的名字。
 */

export type IconName =
	| "plus"
	| "settings"
	| "sun"
	| "moon"
	| "monitor"
	| "folder"
	| "file"
	| "link"
	| "close"
	| "send"
	| "stop"
	| "chevron"
	| "panel"
	| "refresh"
	| "copy"
	| "check"
	| "spark"
	| "warning"
	| "search"
	| "chat"
	| "grid"
	| "clock"
	| "layers"
	| "chevron-right"
	| "more"
	| "rotate"
	| "minimize"
	| "maximize"
	| "sidebar"
	| "filter"
	| "shield"
	| "pin"
	| "pencil"
	| "trash";

export function Icon({
	name,
	size = 16,
	className,
}: {
	name: IconName;
	size?: number;
	className?: string;
}) {
	const common = {
		className,
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		"aria-hidden": true,
	};
	switch (name) {
		case "plus":
			return (
				<svg {...common}>
					<path d="M12 5v14M5 12h14" />
				</svg>
			);
		case "settings":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="3" />
					<path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2H8.9v-.2a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1-2.8-2.8.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H1.8v-3.9h.2a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1 2.8-2.8.1.1a1.7 1.7 0 0 0 1.9.3h.1a1.7 1.7 0 0 0 1-1.6V2h3.9v.2a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1 2.8 2.8-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.2v3.9h-.2a1.7 1.7 0 0 0-1.5 1Z" />
				</svg>
			);
		case "sun":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="4" />
					<path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
				</svg>
			);
		case "moon":
			return (
				<svg {...common}>
					<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.7 6.7 0 0 0 10.7 10.7Z" />
				</svg>
			);
		case "monitor":
			return (
				<svg {...common}>
					<rect x="3" y="4" width="18" height="13" rx="2" />
					<path d="M8 21h8M12 17v4" />
				</svg>
			);
		case "folder":
			return (
				<svg {...common}>
					<path d="M3 7.5h6.2l2 2H21v9.5H3z" />
				</svg>
			);
		case "file":
			return (
				<svg {...common}>
					<path d="M6 3h8l4 4v14H6zM14 3v5h4" />
				</svg>
			);
		case "link":
			return (
				<svg {...common}>
					<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
					<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
				</svg>
			);
		case "close":
			return (
				<svg {...common}>
					<path d="M6 6l12 12M18 6 6 18" />
				</svg>
			);
		case "minimize":
			return (
				<svg {...common}>
					<path d="M5 12h14" />
				</svg>
			);
		case "maximize":
			return (
				<svg {...common}>
					<rect x="5" y="5" width="14" height="14" rx="1" />
				</svg>
			);
		case "send":
			return (
				<svg {...common}>
					<path d="M4 12 20 4l-6.5 16-2.7-6.8L4 12Z" />
				</svg>
			);
		case "stop":
			return (
				<svg {...common}>
					<rect x="6" y="6" width="12" height="12" rx="2" />
				</svg>
			);
		case "chevron":
			return (
				<svg {...common}>
					<path d="m6 9 6 6 6-6" />
				</svg>
			);
		case "panel":
			return (
				<svg {...common}>
					<rect x="3" y="4" width="18" height="16" rx="2" />
					<path d="M15 4v16" />
				</svg>
			);
		case "sidebar":
			return (
				<svg {...common}>
					<rect x="3" y="4" width="18" height="16" rx="4.5" />
					<path d="M9.5 5.2v13.6" />
					<path d="M4.6 5.2h4.4v13.6H4.6z" fill="currentColor" stroke="none" opacity="0.5" />
				</svg>
			);
		case "filter":
			return (
				<svg {...common}>
					<path d="M4 5h16l-6 7.6V19l-4-2.4v-4L4 5Z" />
				</svg>
			);
		case "shield":
			return (
				<svg {...common}>
					<path d="M12 3.2 5 6v5.4c0 4.3 2.9 7.4 7 9.4 4.1-2 7-5.1 7-9.4V6l-7-2.8Z" />
				</svg>
			);
		case "pin":
			return (
				<svg {...common}>
					<path d="M9 3h6M12 3v7M8 10h8l-1.4 4.5H9.4L8 10ZM12 14.5V21" />
				</svg>
			);
		case "pencil":
			return (
				<svg {...common}>
					<path d="M4 20h4L20 8l-4-4L4 16v4ZM14 6l4 4" />
				</svg>
			);
		case "trash":
			return (
				<svg {...common}>
					<path d="M4 7h16M9 7V4h6v3M6.5 7l1 13h9l1-13M10 11v6M14 11v6" />
				</svg>
			);
		case "refresh":
			return (
				<svg {...common}>
					<path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
				</svg>
			);
		case "copy":
			return (
				<svg {...common}>
					<rect x="8" y="8" width="12" height="12" rx="2" />
					<path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
				</svg>
			);
		case "check":
			return (
				<svg {...common}>
					<path d="m5 12 4.5 4.5L19 7" />
				</svg>
			);
		case "spark":
			return (
				<svg {...common}>
					<path d="m12 3 2.1 6.9L21 12l-6.9 2.1L12 21l-2.1-6.9L3 12l6.9-2.1L12 3Z" />
				</svg>
			);
		case "warning":
			return (
				<svg {...common}>
					<path d="M12 3 2.5 20h19L12 3ZM12 9v5M12 17.5v.5" />
				</svg>
			);
		case "search":
			return (
				<svg {...common}>
					<circle cx="11" cy="11" r="7" />
					<path d="m20 20-4-4" />
				</svg>
			);
		case "chat":
			return (
				<svg {...common}>
					<path d="M20 15a2 2 0 0 1-2 2H8l-4 3V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2Z" />
				</svg>
			);
		case "grid":
			return (
				<svg {...common}>
					<rect x="3" y="3" width="7" height="7" rx="1.5" />
					<rect x="14" y="3" width="7" height="7" rx="1.5" />
					<rect x="3" y="14" width="7" height="7" rx="1.5" />
					<rect x="14" y="14" width="7" height="7" rx="1.5" />
				</svg>
			);
		case "clock":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="9" />
					<path d="M12 7v5l3 2" />
				</svg>
			);
		case "layers":
			return (
				<svg {...common}>
					<path d="m12 3 9 5-9 5-9-5 9-5ZM3 13l9 5 9-5" />
				</svg>
			);
		case "chevron-right":
			return (
				<svg {...common}>
					<path d="m9 6 6 6-6 6" />
				</svg>
			);
		case "more":
			return (
				<svg {...common}>
					<circle cx="5" cy="12" r="1" />
					<circle cx="12" cy="12" r="1" />
					<circle cx="19" cy="12" r="1" />
				</svg>
			);
		case "rotate":
			return (
				<svg {...common}>
					<path d="M3 12a9 9 0 1 0 2.6-6.4L3 8M3 3v5h5" />
				</svg>
			);
	}
}
