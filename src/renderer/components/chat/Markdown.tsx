/**
 * Markdown 渲染：标题/段落/列表交给 core/markdown 解析，
 * 行内代码、加粗、链接与搜索高亮在这里处理。
 */

import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import { parseMarkdown } from "../../core/markdown";
import { CodeBlock } from "./CodeBlock";

export function InlineText({ text, query = "" }: { text: string; query?: string }) {
	const parts = text
		.split(/(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/[^\s<]+)/g)
		.filter(Boolean);
	return (
		<>
			{parts.map((part, index) => {
				if (part.startsWith("`") && part.endsWith("`")) {
					return (
						<code key={index}>
							<Highlight text={part.slice(1, -1)} query={query} />
						</code>
					);
				}
				if (part.startsWith("**") && part.endsWith("**")) {
					return (
						<strong key={index}>
							<Highlight text={part.slice(2, -2)} query={query} />
						</strong>
					);
				}
				const markdownLink = part.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
				if (markdownLink) {
					return (
						<a key={index} href={markdownLink[2]} title={markdownLink[2]}>
							<Highlight text={markdownLink[1]} query={query} />
						</a>
					);
				}
				if (/^https?:\/\//.test(part)) {
					const url = part.replace(/[.,;:!?]+$/, "");
					return (
						<a key={index} href={url} title={url}>
							<Highlight text={url} query={query} />
						</a>
					);
				}
				return (
					<span key={index}>
						<Highlight text={part} query={query} />
					</span>
				);
			})}
		</>
	);
}

function onMarkdownLinkClick(event: ReactMouseEvent<HTMLDivElement>) {
	const anchor = (event.target as HTMLElement).closest("a");
	if (!anchor) return;
	event.preventDefault();
	void window.desktop.links.open(anchor.getAttribute("href") || "").catch(() => undefined);
}

export function Markdown({
	text,
	onOpen,
	query = "",
}: {
	text: string;
	onOpen: (name: string, content: string) => void;
	query?: string;
}) {
	const blocks = useMemo(() => parseMarkdown(text), [text]);
	return (
		<div className="omp-markdown" onClick={onMarkdownLinkClick}>
			{blocks.map((block, index) => {
				if (block.type === "heading") {
					const Tag = `h${Math.min(block.level + 1, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
					return (
						<Tag key={index}>
							<InlineText text={block.text} query={query} />
						</Tag>
					);
				}
				if (block.type === "list") {
					return (
						<ul key={index}>
							{block.items.map((item, itemIndex) => (
								<li key={itemIndex}>
									<InlineText text={item} query={query} />
								</li>
							))}
						</ul>
					);
				}
				if (block.type === "code") {
					return <CodeBlock key={index} code={block.text} lang={block.lang} onOpen={onOpen} />;
				}
				return (
					<p key={index}>
						<InlineText text={block.text} query={query} />
					</p>
				);
			})}
		</div>
	);
}

function Highlight({ text, query }: { text: string; query: string }) {
	if (!query.trim()) return <>{text}</>;
	const lower = text.toLowerCase();
	const target = query.toLowerCase();
	const parts: Array<{ text: string; hit: boolean }> = [];
	let cursor = 0;
	let found = lower.indexOf(target);
	while (found >= 0) {
		if (found > cursor) parts.push({ text: text.slice(cursor, found), hit: false });
		parts.push({ text: text.slice(found, found + query.length), hit: true });
		cursor = found + query.length;
		found = lower.indexOf(target, cursor);
	}
	if (cursor < text.length) parts.push({ text: text.slice(cursor), hit: false });
	return (
		<>
			{parts.map((part, index) =>
				part.hit ? (
					<mark key={index} data-search-hit>
						{part.text}
					</mark>
				) : (
					<span key={index}>{part.text}</span>
				),
			)}
		</>
	);
}
