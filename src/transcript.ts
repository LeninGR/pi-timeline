import type { PiLayoutBox, PiScrollView, PiTui } from "./types.ts";

/**
 * Pi marks the first rendered line of a user/assistant message with the OSC 133
 * "prompt start" sequence, and its own `tui.altScreen.previousPrompt` navigation
 * scans exactly these rows. The same marker is the only public-ish anchor from a
 * rendered line back to a conversation turn.
 */
export const OSC133_PROMPT_START = /^\x1b\]133;A(?:\x07|\x1b\\)/;

const OSC_SEQUENCE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/gu;
const CSI_SEQUENCE = /\x1b\[[0-9;?]*[ -/]*[@-~]/gu;
/** Markdown decoration that Pi's renderer drops, so the prompt text must drop it too. */
const MARKDOWN_DECORATION = /[*_`#>~]/gu;

/** Remove terminal escape sequences so a rendered line can be compared by its text. */
export function stripSequences(text: string): string {
	return text.replace(OSC_SEQUENCE, "").replace(CSI_SEQUENCE, "");
}

/** Escape-free, whitespace-collapsed text: wrapping and styling stop mattering. */
export function normalize(text: string): string {
	return stripSequences(text).replace(/\s+/gu, " ").trim();
}

/** Depth-first search for the layout box that owns a given scroll view. */
export function findScrollBox(root: PiLayoutBox | undefined, scrollView: PiScrollView): PiLayoutBox | undefined {
	if (!root) return undefined;
	if (root.scrollView === scrollView) return root;
	for (const child of root.children ?? []) {
		const found = findScrollBox(child, scrollView);
		if (found) return found;
	}
	return undefined;
}

/**
 * Exact route: every message component carries the session `entry.id` as its
 * `messageId`, so the layout frame maps an entry to its first content row. Only
 * boxes that are part of the current frame resolve; the caller falls back to the
 * text route when the entry is not there.
 */
export function collectMessageRows(box: PiLayoutBox | undefined): Map<string, number> {
	const rows = new Map<string, number>();
	const content = box?.children?.[0];
	const originY = content?.rect?.y;
	if (!content || originY === undefined) return rows;
	const visit = (node: PiLayoutBox): void => {
		const component = node.component as { messageId?: unknown } | undefined;
		const messageId = component?.messageId;
		const y = node.rect?.y;
		if (typeof messageId === "string" && messageId && y !== undefined && !rows.has(messageId)) {
			rows.set(messageId, y - originY);
		}
		for (const child of node.children ?? []) visit(child);
	};
	visit(content);
	return rows;
}

/** Content rows that begin a message, in document order. */
export function markerRows(lines: readonly string[]): number[] {
	const rows: number[] = [];
	for (let row = 0; row < lines.length; row += 1) {
		if (OSC133_PROMPT_START.test(lines[row] ?? "")) rows.push(row);
	}
	return rows;
}

/** Comparison candidates for a prompt: the longest identifying prefix, markdown stripped. */
export function signatures(text: string): string[] {
	const plain = normalize(text);
	const undecorated = normalize(plain.replace(MARKDOWN_DECORATION, ""));
	const candidates: string[] = [];
	for (const source of [plain, undecorated]) {
		for (const length of [32, 20, 12]) {
			const candidate = source.slice(0, length).trim();
			if (candidate) candidates.push(candidate);
		}
	}
	return [...new Set(candidates)];
}

/**
 * Fallback route: align the session's prompts with the rendered message blocks by
 * text, in order, so a prompt that shares words with an assistant answer cannot
 * steal an earlier block. Returns the row of every prompt it could place.
 */
export function resolveRowsByText(lines: readonly string[], prompts: readonly { entryId: string; text: string }[]): Map<string, number> {
	const markers = markerRows(lines);
	const blocks: Array<{ start: number; text: string }> = [];
	if (markers.length === 0) {
		if (lines.length > 0) blocks.push({ start: 0, text: normalize(lines.join(" ")) });
	} else {
		markers.forEach((start, index) => {
			const end = markers[index + 1] ?? lines.length;
			blocks.push({ start, text: normalize(lines.slice(start, end).join(" ")) });
		});
	}

	const rows = new Map<string, number>();
	let cursor = 0;
	for (const prompt of prompts) {
		const candidates = signatures(prompt.text);
		if (candidates.length === 0) continue;
		for (let index = cursor; index < blocks.length; index += 1) {
			const block = blocks[index] as { start: number; text: string };
			if (!candidates.some((candidate) => block.text.includes(candidate))) continue;
			rows.set(prompt.entryId, block.start);
			cursor = index + 1;
			break;
		}
	}
	return rows;
}

export interface ResolvedRow {
	row: number;
	via: "layout" | "text";
}

/**
 * S2's seam: where in the rendered transcript does this prompt start? Prefers the
 * exact layout mapping and only then the text alignment. Returns undefined when
 * neither can place the entry, so the caller can say so instead of scrolling to
 * the wrong place.
 */
export function resolvePromptRow(
	tui: PiTui,
	prompts: readonly { entryId: string; text: string }[],
	entryId: string,
): ResolvedRow | undefined {
	const scrollView = tui.getPrimaryScrollView?.();
	if (!scrollView) return undefined;
	const box = findScrollBox(tui.currentLayout?.root, scrollView);
	const lines = box?.scrollContentLines ?? [];

	const exact = collectMessageRows(box).get(entryId);
	if (exact !== undefined && (lines.length === 0 || exact < lines.length)) return { row: exact, via: "layout" };

	const scanned = resolveRowsByText(lines, prompts).get(entryId);
	if (scanned !== undefined) return { row: scanned, via: "text" };
	return undefined;
}

/**
 * Scroll the transcript so `row` is the first visible line. Uses the alt-screen
 * scroll view Pi's own prompt navigation uses; it is not part of the extension UI
 * contract, so every access is guarded.
 */
export function scrollTranscriptTo(tui: PiTui, row: number): boolean {
	const scrollView = tui.getPrimaryScrollView?.();
	if (!scrollView || typeof scrollView.scrollTo !== "function") return false;
	scrollView.scrollTo(Math.max(0, row), { disableFollow: true });
	tui.requestRender();
	return true;
}
