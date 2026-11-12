import { renderCardFrame } from "./card-chrome.ts";
import type { CardBodyRow, CardSegment } from "./card-chrome.ts";
import type { CardStyle } from "./card-style.ts";
import { clockOf, filterPrompts, previewOf } from "./prompts.ts";
import type { SessionPrompt } from "./prompts.ts";
import { pad, truncate, widthOf } from "./width.ts";
import type { PiComponent, PiKeybindings, PiMouseEvent, PiMouseEventResult, PiTheme, PiTui } from "./types.ts";

/** What the modal returns to its caller: jump to a prompt, or just close. */
export type TimelineResult = { kind: "jump"; entryId: string } | { kind: "close" };

export interface TimelineModalOptions {
	/** Visible prompt rows; the window follows the selection past this size. */
	maxRows?: number;
	title?: string;
	/** From Gentle → Customize; `float` unless the shell said otherwise. */
	style?: CardStyle;
}

export { pad, truncate, widthOf };

const DEFAULT_MAX_ROWS = 14;
const PAGE_STEPS = 10;
const FOOTER_HINT = "type to filter · ↵ jump · esc close";

const UP_KEYS = new Set(["\x1b[A", "\x1bOA"]);
const DOWN_KEYS = new Set(["\x1b[B", "\x1bOB"]);
const PAGE_UP_KEYS = new Set(["\x1b[5~"]);
const PAGE_DOWN_KEYS = new Set(["\x1b[6~"]);
const HOME_KEYS = new Set(["\x1b[H", "\x1b[1~", "\x1bOH"]);
const END_KEYS = new Set(["\x1b[F", "\x1b[4~", "\x1bOF"]);
const ENTER_KEYS = new Set(["\r", "\n"]);
const BACKSPACE_KEYS = new Set(["\x7f", "\b"]);

interface TimelineState {
	query: string;
	selected: number;
	windowTop: number;
	finished: boolean;
}

/**
 * The `/timeline` modal: every prompt of this session as one row, newest last,
 * with opencode's timeline interaction — arrows or the wheel to move, Enter or a
 * click to jump, Esc to close — drawn as a gentle-shell card in the user's
 * selected card style.
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
	const title = (options.title ?? "Timeline").toUpperCase();
	const style: CardStyle = options.style ?? "float";
	const state: TimelineState = { query: "", selected: 0, windowTop: 0, finished: false };
	/** Row index inside the rendered card → index in the filtered list, for mouse hits. */
	let hits: Array<{ y: number; index: number }> = [];

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
		state.selected += delta;
		clampSelection(matched().length);
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

	const rowSegments = (prompt: SessionPrompt, index: number): CardSegment[] => {
		const selected = index === state.selected;
		const role = selected ? "accent" : "muted";
		const clock = clockOf(prompt.timestamp);
		const segments: CardSegment[] = [
			{ text: `${selected ? "›" : " "}${String(prompt.position).padStart(3, " ")} `, role, bold: selected },
		];
		if (clock) segments.push({ text: `${clock} `, role });
		segments.push({ text: previewOf(prompt.text) || "(empty prompt)", role: selected ? "accent" : "text", bold: selected });
		return segments;
	};

	const render = (width: number): string[] => {
		const list = matched();
		clampSelection(list.length);

		// Native rail cards indent their body two columns under the header glyph.
		const indent: CardSegment = { text: "  ", role: "dim" };
		const rows: CardBodyRow[] = [];
		let promptRows = 0;
		if (state.query) rows.push({ segments: [indent, { text: `filter: ${state.query}`, role: "dim" }] });

		if (list.length === 0) {
			rows.push({
				segments: [indent, { text: prompts.length === 0 ? "No prompts in this session yet" : "No prompt matches that filter", role: "dim" }],
			});
			promptRows = 0;
		} else {
			const windowTop = state.windowTop;
			list.slice(windowTop, windowTop + maxRows).forEach((prompt, row) => {
				rows.push({ segments: [indent, ...rowSegments(prompt, windowTop + row)] });
			});
			promptRows = rows.length - (state.query ? 1 : 0);
			if (list.length > maxRows) {
				const from = windowTop + 1;
				const to = Math.min(list.length, windowTop + maxRows);
				rows.push({ segments: [indent, { text: `rows ${from}-${to} of ${list.length}`, role: "dim" }] });
			}
		}

		const rendered = renderCardFrame(
			{
				title,
				meta: `${list.length}/${prompts.length} prompts`,
				rows,
				footer: `  ${FOOTER_HINT}`,
			},
			theme,
			style,
			width,
		);

		// The hit map is the body offset plus each prompt row's own position; rows that
		// are not prompts (filter line, window indicator) are simply absent from it.
		const firstPromptRow = rendered.bodyStart + (state.query ? 1 : 0);
		hits = [];
		for (let index = 0; index < promptRows; index += 1) {
			hits.push({ y: firstPromptRow + index, index: state.windowTop + index });
		}
		return rendered.lines;
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
