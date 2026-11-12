import { clockOf, filterPrompts, previewOf } from "./prompts.ts";
import type { SessionPrompt } from "./prompts.ts";
import { stripSequences } from "./transcript.ts";
import type { PiComponent, PiKeybindings, PiMouseEvent, PiMouseEventResult, PiTheme, PiTui } from "./types.ts";

/** What the modal returns to its caller: jump to a prompt, or just close. */
export type TimelineResult = { kind: "jump"; entryId: string } | { kind: "close" };

export interface TimelineModalOptions {
	/** Visible prompt rows; the window follows the selection past this size. */
	maxRows?: number;
	title?: string;
}

const DEFAULT_MAX_ROWS = 14;
const PAGE_STEPS = 10;

const UP_KEYS = new Set(["\x1b[A", "\x1bOA"]);
const DOWN_KEYS = new Set(["\x1b[B", "\x1bOB"]);
const PAGE_UP_KEYS = new Set(["\x1b[5~"]);
const PAGE_DOWN_KEYS = new Set(["\x1b[6~"]);
const HOME_KEYS = new Set(["\x1b[H", "\x1b[1~", "\x1bOH"]);
const END_KEYS = new Set(["\x1b[F", "\x1b[4~", "\x1bOF"]);
const ENTER_KEYS = new Set(["\r", "\n"]);
const BACKSPACE_KEYS = new Set(["\x7f", "\b"]);

function cellWidth(text: string): number {
	let width = 0;
	for (const char of text) {
		if (/\p{Mark}|\p{Default_Ignorable_Code_Point}/u.test(char)) continue;
		width += /[\p{Extended_Pictographic}\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(char) ? 2 : 1;
	}
	return width;
}

/** Visible cell count of an escape-free string. */
export function widthOf(text: string): number {
	return cellWidth(text);
}

/** Cut to `width` cells, appending an ellipsis when something was dropped. */
export function truncate(text: string, width: number): string {
	if (width <= 0) return "";
	if (widthOf(text) <= width) return text;
	const budget = Math.max(0, width - 1);
	let out = "";
	for (const char of text) {
		if (widthOf(out + char) > budget) break;
		out += char;
	}
	return `${out}…`;
}

/** Pad to exactly `width` cells (never truncates). */
export function pad(text: string, width: number): string {
	const missing = width - widthOf(text);
	return missing > 0 ? `${text}${" ".repeat(missing)}` : text;
}

interface TimelineState {
	query: string;
	selected: number;
	windowTop: number;
	finished: boolean;
}

/**
 * The `/timeline` modal: every prompt of this session as one row, newest last,
 * with the same interaction as opencode's timeline — arrows or the wheel to move,
 * Enter or a click to jump, Esc to close, and typing to filter by text.
 */
export function createTimelineModal(
	tui: PiTui,
	theme: PiTheme,
	keys: PiKeybindings,
	done: (result: TimelineResult) => void,
	prompts: readonly SessionPrompt[],
	options: TimelineModalOptions = {},
): PiComponent {
	const maxRows = Math.max(1, options.maxRows ?? DEFAULT_MAX_ROWS);
	const title = options.title ?? "Timeline";
	const state: TimelineState = { query: "", selected: 0, windowTop: 0, finished: false };
	/** Row index inside the card → index in the filtered list, for mouse hits. */
	let hits: Array<{ y: number; index: number }> = [];

	const paint = (style: (text: string) => string, text: string): string => {
		try {
			return style(text);
		} catch {
			return text;
		}
	};
	const dim = (text: string) => paint((value) => theme.fg("dim", value), text);
	const accent = (text: string) => paint((value) => theme.fg("accent", value), text);
	const bold = (text: string) => paint((value) => theme.bold(value), text);

	const matched = (): SessionPrompt[] => filterPrompts(prompts, state.query);

	const clampSelection = (total: number): void => {
		if (total === 0) {
			state.selected = 0;
			state.windowTop = 0;
			return;
		}
		state.selected = Math.min(Math.max(0, state.selected), total - 1);
		if (state.selected < state.windowTop) state.windowTop = state.selected;
		if (state.selected >= state.windowTop + maxRows) state.windowTop = state.selected - maxRows + 1;
		state.windowTop = Math.max(0, Math.min(state.windowTop, Math.max(0, total - maxRows)));
	};

	const move = (delta: number): void => {
		const total = matched().length;
		state.selected += delta;
		clampSelection(total);
		tui.requestRender();
	};

	const setQuery = (query: string): void => {
		state.query = query;
		state.selected = 0;
		state.windowTop = 0;
		clampSelection(matched().length);
		tui.requestRender();
	};

	const jumpTo = (index: number): void => {
		const list = matched();
		const prompt = list[Math.min(Math.max(0, index), list.length - 1)];
		if (!prompt || state.finished) return;
		state.finished = true;
		done({ kind: "jump", entryId: prompt.entryId });
	};

	const close = (): void => {
		if (state.finished) return;
		state.finished = true;
		done({ kind: "close" });
	};

	const matchesAction = (data: string, action: string): boolean => {
		try {
			return keys.matches(data, action);
		} catch {
			return false;
		}
	};

	const handleInput = (data: string): void => {
		if (state.finished || !data) return;
		if (UP_KEYS.has(data) || matchesAction(data, "tui.select.up")) return move(-1);
		if (DOWN_KEYS.has(data) || matchesAction(data, "tui.select.down")) return move(1);
		if (PAGE_UP_KEYS.has(data) || matchesAction(data, "tui.select.pageUp")) return move(-PAGE_STEPS);
		if (PAGE_DOWN_KEYS.has(data) || matchesAction(data, "tui.select.pageDown")) return move(PAGE_STEPS);
		if (HOME_KEYS.has(data)) {
			state.selected = 0;
			clampSelection(matched().length);
			tui.requestRender();
			return;
		}
		if (END_KEYS.has(data)) {
			state.selected = matched().length - 1;
			clampSelection(matched().length);
			tui.requestRender();
			return;
		}
		if (ENTER_KEYS.has(data) || matchesAction(data, "tui.select.confirm")) return jumpTo(state.selected);
		if (data === "\x1b" || matchesAction(data, "tui.select.cancel") || data === "\x03") return close();
		if (data === "\x15") return setQuery("");
		if (BACKSPACE_KEYS.has(data)) return setQuery(state.query.slice(0, -1));
		if (data.startsWith("\x1b")) return;
		const printable = [...data].length === 1 && data >= " " && data !== "\x7f";
		if (printable) setQuery(state.query + data);
	};

	const handleMouse = (event: PiMouseEvent): PiMouseEventResult | undefined => {
		if (state.finished) return undefined;
		if (event.type === "wheel" && event.wheelDelta) {
			move(event.wheelDelta > 0 ? 1 : -1);
			return { handled: true, render: true };
		}
		if (event.button !== "left") return undefined;
		const hit = hits.find((candidate) => candidate.y === event.y);
		if (!hit) return undefined;
		if (event.type === "press") {
			state.selected = hit.index;
			tui.requestRender();
			return { handled: true, render: true };
		}
		if (event.type === "click") {
			jumpTo(hit.index);
			return { handled: true, render: true };
		}
		return undefined;
	};

	const renderRow = (prompt: SessionPrompt, index: number, width: number): string => {
		const selected = index === state.selected;
		const marker = selected ? "▌" : " ";
		const number = String(prompt.position).padStart(3, " ");
		const clock = clockOf(prompt.timestamp);
		const head = `${marker}${number} ${clock ? `${clock} ` : ""}`;
		const room = Math.max(8, width - widthOf(head));
		const body = truncate(previewOf(prompt.text) || "(empty prompt)", room);
		const line = pad(`${head}${body}`, width);
		return selected ? accent(line) : paint((value) => theme.fg("text", value), line);
	};

	const render = (width: number): string[] => {
		const list = matched();
		clampSelection(list.length);
		const innerWidth = Math.max(16, width);
		const rule = dim("─".repeat(innerWidth));
		const lines: string[] = [];
		const counter = `${list.length}/${prompts.length}`;
		const header = `${bold(accent(title))} ${dim(`· ${counter} prompts`)}`;
		lines.push(truncatePlainLine(header, innerWidth));
		if (state.query) lines.push(dim(truncate(`filter: ${state.query}`, innerWidth)));
		lines.push(rule);

		hits = [];
		if (list.length === 0) {
			lines.push(dim(truncate(prompts.length === 0 ? "No prompts in this session yet" : "No prompt matches that filter", innerWidth)));
		} else {
			const visible = list.slice(state.windowTop, state.windowTop + maxRows);
			const offset = state.windowTop;
			visible.forEach((prompt, row) => {
				// `lines.length` is this row's own index: the hit is pushed right before the row.
				hits.push({ y: lines.length, index: offset + row });
				lines.push(renderRow(prompt, offset + row, innerWidth));
			});
			if (list.length > maxRows) {
				const from = state.windowTop + 1;
				const to = Math.min(list.length, state.windowTop + maxRows);
				lines.push(dim(truncate(`rows ${from}-${to} of ${list.length}`, innerWidth)));
			}
		}

		lines.push(rule);
		lines.push(dim(truncate("type to filter · enter/click jump · ↑↓ move · esc close", innerWidth)));
		return lines;
	};

	return {
		render,
		handleInput,
		handleMouse,
		invalidate(): void {
			hits = [];
		},
		dispose(): void {
			hits = [];
		},
	};
}

/**
 * Truncate a line that already carries escapes: the cut is applied to the visible
 * text, and styled rows are only cut at their own boundaries when safe. Prefer
 * building rows from plain text; this is the safety net for composed headers.
 */
function truncatePlainLine(styled: string, width: number): string {
	if (widthOf(stripSequences(styled)) <= width) return styled;
	return truncate(stripSequences(styled), width);
}
