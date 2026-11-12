import type { PiOverlayOptions, PiTui } from "./types.ts";

/**
 * gentle-shell publishes its fullscreen rail state on the terminal under this
 * global symbol, so an extension can learn the rail's width without importing
 * the package. Same symbol the shell's own prompt picker reads.
 */
const SIDEBAR_STATE_SYMBOL = Symbol.for("gentle-pi.experimental-sidebar.state");
/** Breathing room between the conversation column and the overlay. */
const RAIL_PADDING = 1;
const MIN_WIDTH = 56;
const DEFAULT_RATIO = 0.76;

interface SidebarStateLike {
	active?: unknown;
	ownsHost?: unknown;
	railColumns?: unknown;
}

/**
 * Columns the rail takes from the conversation column, or 0 when it is not
 * painting. Fails closed: anything unexpected means "no rail", which leaves the
 * overlay centered on the whole terminal exactly like before.
 */
export function railColumns(terminal: unknown): number {
	if (typeof terminal !== "object" || terminal === null) return 0;
	const state = (terminal as Record<symbol, unknown>)[SIDEBAR_STATE_SYMBOL] as SidebarStateLike | undefined;
	if (typeof state !== "object" || state === null) return 0;
	if (state.active !== true || typeof state.ownsHost !== "function") return 0;
	const columns = state.railColumns;
	if (typeof columns !== "number" || !Number.isInteger(columns) || columns <= 0) return 0;
	try {
		return (state.ownsHost as () => unknown).call(state) === true ? columns + RAIL_PADDING : 0;
	} catch {
		return 0;
	}
}

/** Live terminal width, or 0 when the runtime does not expose it. */
export function terminalColumns(tui: PiTui | undefined): number {
	const terminal = tui?.terminal;
	const columns = terminal?.columns;
	if (typeof columns !== "number" || !Number.isFinite(columns) || columns <= 0) return 0;
	return Math.floor(columns);
}

/**
 * Overlay options that seat the modal over the conversation column instead of the
 * whole window: the right margin confines it to the space left of the rail, and a
 * centered overlay is then centred inside that box.
 *
 * Every value is a getter on purpose. Pi keeps the options object from
 * `showOverlay` time, but re-reads `width` and `margin` on every render pass, so
 * resizing across the rail's breakpoint while the modal is open re-seats it.
 */
export function conversationOverlayOptions(getTui: () => PiTui | undefined, ratio: number = DEFAULT_RATIO): PiOverlayOptions {
	const rail = (): number => railColumns(getTui()?.terminal);
	return {
		anchor: "center",
		maxHeight: "85%",
		get width(): number | `${number}%` {
			const columns = terminalColumns(getTui());
			if (columns === 0) return `${Math.round(ratio * 100)}%`;
			const available = Math.max(1, columns - rail());
			// A percentage would be resolved against the whole terminal and then clamped
			// by the margin, so an absolute width is what keeps the ratio of the column.
			return Math.max(1, Math.min(available, Math.max(MIN_WIDTH, Math.floor(available * ratio))));
		},
		get margin(): { right: number } | undefined {
			const right = rail();
			return right > 0 ? { right } : undefined;
		},
	};
}
