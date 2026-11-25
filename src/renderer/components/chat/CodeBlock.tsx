/**
 * 代码块：等宽显示 + 复制 + 在预览区打开。
 */

import { useState } from "react";
import { Icon } from "../common/Icon";

export function CodeBlock({
	code,
	lang,
	onOpen,
}: {
	code: string;
	lang?: string;
	onOpen?: (name: string, content: string) => void;
}) {
	const [copied, setCopied] = useState(false);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(code);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	};

	return (
		<div className="omp-codeblock">
			<div className="omp-codeblock-head">
				<span>{lang || "text"}</span>
				<div>
					<button type="button" onClick={copy} title="复制代码">
						<Icon name={copied ? "check" : "copy"} size={13} />
						{copied ? "已复制" : "复制"}
					</button>
					{onOpen && (
						<button type="button" onClick={() => onOpen("snippet.md", code)} title="在预览中打开">
							<Icon name="file" size={13} />
							预览
						</button>
					)}
				</div>
			</div>
			<pre>
				<code>{code}</code>
			</pre>
		</div>
	);
}
