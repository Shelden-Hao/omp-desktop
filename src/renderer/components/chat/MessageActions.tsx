/**
 * 消息操作：复制全文，用户消息可重试。
 */

import { useState } from "react";
import { Icon } from "../common/Icon";

export function MessageActions({ text, onRetry }: { text: string; onRetry?: () => void }) {
	const [copied, setCopied] = useState(false);
	const copy = async () => {
		try {
			await navigator.clipboard.writeText(text);
			setCopied(true);
			window.setTimeout(() => setCopied(false), 1400);
		} catch {
			setCopied(false);
		}
	};
	return (
		<div className="omp-message-actions">
			<button type="button" onClick={() => void copy()} title="复制消息">
				<Icon name={copied ? "check" : "copy"} size={13} />
				{copied ? "已复制" : "复制"}
			</button>
			{onRetry && (
				<button type="button" onClick={onRetry} title="重新发送">
					<Icon name="rotate" size={13} />
					重试
				</button>
			)}
		</div>
	);
}
