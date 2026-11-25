export function SetIcon({ name, size = 15 }: { name: string; size?: number }) {
	const common = {
		width: size,
		height: size,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.7,
		strokeLinecap: "round" as const,
		strokeLinejoin: "round" as const,
		"aria-hidden": true,
	};
	switch (name) {
		case "search":
			return (
				<svg {...common}>
					<circle cx="11" cy="11" r="7" />
					<path d="m20 20-3.5-3.5" />
				</svg>
			);
		case "gear":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="3" />
					<path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2M19 5l-2 2M7 17l-2 2" />
				</svg>
			);
		case "palette":
			return (
				<svg {...common}>
					<circle cx="12" cy="12" r="9" />
					<circle cx="9" cy="9" r="1.2" />
					<circle cx="15" cy="9" r="1.2" />
					<circle cx="9.5" cy="14.5" r="1.2" />
				</svg>
			);
		case "folder":
			return (
				<svg {...common}>
					<path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
				</svg>
			);
		case "user":
			return (
				<svg {...common}>
					<circle cx="12" cy="8" r="3.5" />
					<path d="M5 20a7 7 0 0 1 14 0" />
				</svg>
			);
		case "spark":
			return (
				<svg {...common}>
					<path d="M12 3v4m0 10v4M4.5 12h3m9 0h3M6.2 6.2l2.1 2.1m7.4 7.4 2.1 2.1m0-11.6-2.1 2.1M8.3 15.7l-2.1 2.1" />
				</svg>
			);
		case "chip":
			return (
				<svg {...common}>
					<rect x="6" y="6" width="12" height="12" rx="2" />
					<path d="M10 3v3m4-3v3m-4 12v3m4-3v3M3 10h3m-3 4h3m12-4h3m-3 4h3" />
				</svg>
			);
		case "shield":
			return (
				<svg {...common}>
					<path d="M12 3l7 3v6c0 4.2-2.9 7.6-7 9-4.1-1.4-7-4.8-7-9V6Z" />
					<path d="m9 12 2 2 4-4" />
				</svg>
			);
		case "code":
			return (
				<svg {...common}>
					<path d="m9 7-5 5 5 5m6-10 5 5-5 5" />
				</svg>
			);
		case "chevron":
			return (
				<svg {...common}>
					<path d="m9 6 6 6-6 6" />
				</svg>
			);
		case "trash":
			return (
				<svg {...common}>
					<path d="M4 7h16M9 7V5h6v2m-8 0 1 13h8l1-13" />
				</svg>
			);
		case "pencil":
			return (
				<svg {...common}>
					<path d="M4 20h4l10-10-4-4L4 16Z" />
				</svg>
			);
		case "plug":
			return (
				<svg {...common}>
					<path d="M9 3v6m6-6v6M6 9h12v3a6 6 0 0 1-12 0Z M12 18v3" />
				</svg>
			);
		case "check":
			return (
				<svg {...common}>
					<path d="m5 13 4 4 10-10" />
				</svg>
			);
		default:
			return null;
	}
}
