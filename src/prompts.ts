import type { PiMessage, PiSessionEntry } from "./types.ts";

/** One prompt the user sent to the model in the current session. */
export interface SessionPrompt {
	/** Session entry id: the stable anchor the transcript render also carries. */
	entryId: string;
	/** 1-based position among this session's prompts, in conversation order. */
	position: number;
	timestamp: string;
	text: string;
}

function textOf(message: PiMessage | undefined): string {
	const content = message?.content;
	if (typeof content === "string") return content;
	if (!Array.isArray(content)) return "";
	const parts: string[] = [];
	for (const block of content) {
		if (block && typeof block === "object" && (block as { type?: unknown }).type === "text") {
			const text = (block as { text?: unknown }).text;
			if (typeof text === "string") parts.push(text);
		}
	}
	return parts.join("\n");
}

/**
 * S1: every prompt the user wrote to the model, in order. Only real user turns
 * count: tool results, custom entries, compaction summaries and empty texts are
 * skipped, so the list matches what the transcript shows as the user's words.
 */
export function extractPrompts(entries: readonly PiSessionEntry[]): SessionPrompt[] {
	const prompts: SessionPrompt[] = [];
	for (const entry of entries) {
		if (entry?.type !== "message") continue;
		if (entry.message?.role !== "user") continue;
		const text = textOf(entry.message).trim();
		if (!text) continue;
		prompts.push({ entryId: entry.id, position: prompts.length + 1, timestamp: entry.timestamp, text });
	}
	return prompts;
}

/** Single-line preview for a selector row: first non-empty line, whitespace collapsed. */
export function previewOf(text: string): string {
	for (const line of text.split(/\r?\n/u)) {
		const collapsed = line.replace(/\s+/gu, " ").trim();
		if (collapsed) return collapsed;
	}
	return "";
}

/** `HH:MM` in local time, or an empty string when the timestamp is unusable. */
export function clockOf(timestamp: string): string {
	if (!timestamp) return "";
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) return "";
	return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

/** Case-insensitive substring filter over the full prompt text. */
export function filterPrompts(prompts: readonly SessionPrompt[], query: string): SessionPrompt[] {
	const needle = query.trim().toLowerCase();
	if (!needle) return [...prompts];
	return prompts.filter((prompt) => prompt.text.toLowerCase().includes(needle));
}
