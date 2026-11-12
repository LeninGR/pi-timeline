import type { CardStyle } from "./card-style.ts";
import { pad, truncate, widthOf } from "./width.ts";
import type { PiTheme } from "./types.ts";

/** Theme roles a card uses; only roles gentle-pi's own themes define. */
export type CardRole = "accent" | "text" | "muted" | "dim" | "border";

export interface CardTheme extends PiTheme {
	bg?(color: string, text: string): string;
}

export interface CardSegment {
	text: string;
	role: CardRole;
	bold?: boolean;
}

/** One body row: styled segments, already meaningful without padding. */
export interface CardBodyRow {
	segments: CardSegment[];
}

export interface CardFrame {
	/** Rendered uppercased by the caller. */
	title: string;
	/** Right-aligned summary next to the title. */
	meta?: string;
	/** Already-styled body rows. */
	rows: CardBodyRow[];
	/** Shown instead of the rows when there are none. */
	empty?: string;
	/** Hint line at the bottom of the card. */
	footer?: string;
}

export interface CardRender {
	lines: string[];
	/** Index in `lines` of the first body row, for mouse hit-testing. */
	bodyStart: number;
}

/** Columns a card row leaves for its content: frame or float chrome take four. */
export function cardContentWidth(width: number): number {
	return Math.max(1, Math.floor(width) - 4);
}

const FLOAT_BG_ROLE = "toolSuccessBg";

function paint(theme: CardTheme, role: CardRole, text: string): string {
	try {
		return theme.fg(role, text);
	} catch {
		return text;
	}
}

function bold(theme: CardTheme, text: string): string {
	try {
		return theme.bold(text);
	} catch {
		return text;
	}
}

/**
 * A row painter for the theme's background role, derived from `theme.bg` itself so
 * it works with any theme. The background is re-armed after every reset the row
 * carries, which is what makes styled content sit on the card's tone.
 */
export function backgroundPainter(theme: CardTheme, role: string = FLOAT_BG_ROLE): ((row: string) => string) | undefined {
	if (typeof theme.bg !== "function") return undefined;
	const marker = "\u0000";
	let probe: string;
	try {
		probe = theme.bg(role, marker);
	} catch {
		return undefined;
	}
	if (typeof probe !== "string" || !probe.includes(marker)) return undefined;
	const [open = "", tail = ""] = probe.split(marker);
	if (!open) return undefined;
	const close = tail || "\x1b[49m";
	return (row: string) => `${open}${row.replace(/\x1b\[(?:0|49)m/gu, (reset) => reset + open)}${close}`;
}

/** Float style applies only with a paintable background and enough room, like the shell. */
function floatPainter(theme: CardTheme, style: CardStyle, width: number): ((row: string) => string) | undefined {
	if (style !== "float" || Math.floor(width) < 10) return undefined;
	return backgroundPainter(theme);
}

function styleSegment(theme: CardTheme, segment: CardSegment): string {
	return paint(theme, segment.role, segment.bold ? bold(theme, segment.text) : segment.text);
}

/** Builds one content row exactly `width` cells wide, clipping at a segment boundary. */
export function renderSegments(theme: CardTheme, segments: readonly CardSegment[], width: number): string {
	let out = "";
	let used = 0;
	for (const segment of segments) {
		const room = width - used;
		if (room <= 0) break;
		const text = truncate(segment.text, room);
		out += styleSegment(theme, { ...segment, text });
		used += widthOf(text);
		if (text !== segment.text) break;
	}
	return pad(out, width);
}

/** `▾ TITLE …right`: the rail-section header, on a card row. */
export function renderHeader(theme: CardTheme, title: string, right: string, width: number): string {
	const glyph = "▾";
	const plainLeft = `${glyph} ${title}`;
	if (right && widthOf(right) + 1 + Math.min(widthOf(plainLeft), 12) <= width) {
		const room = width - widthOf(right) - 1;
		const left = `${paint(theme, "muted", glyph)} ${paint(theme, "text", bold(theme, title))}`;
		const shown = widthOf(plainLeft) <= room ? plainLeft : truncate(plainLeft, room);
		const styled = shown === plainLeft ? left : `${paint(theme, "muted", glyph)} ${paint(theme, "text", bold(theme, shown.slice(2)))}`;
		return `${styled}${" ".repeat(Math.max(0, width - widthOf(shown) - widthOf(right)))}${paint(theme, "muted", right)}`;
	}
	const shown = truncate(plainLeft, width);
	const styled = shown.startsWith(glyph) && shown.length > 1
		? `${paint(theme, "muted", glyph)} ${paint(theme, "text", bold(theme, shown.slice(2)))}`
		: paint(theme, "text", bold(theme, shown));
	return pad(styled, width);
}

function bodyRows(theme: CardTheme, frame: CardFrame, width: number): CardBodyRow[] {
	if (frame.rows.length > 0) return [...frame.rows];
	return frame.empty ? [{ segments: [{ text: truncate(frame.empty, width), role: "dim" }] }] : [];
}

function floatLines(theme: CardTheme, frame: CardFrame, width: number, painter: (row: string) => string): CardRender {
	const content = cardContentWidth(width);
	const border = (text: string) => paint(theme, "border", text);
	const row = (inner: string) => {
		const painted = `${border("▎")} ${inner}`;
		return ` ${painter(painted)} `;
	};
	const rows = bodyRows(theme, frame, content);
	const lines: string[] = [
		row(" ".repeat(content)),
		row(renderHeader(theme, frame.title, frame.meta ?? "", content)),
		row(" ".repeat(content)),
	];
	const bodyStart = lines.length;
	for (const entry of rows) lines.push(row(renderSegments(theme, entry.segments, content)));
	if (frame.footer) {
		lines.push(row(renderSegments(theme, [{ text: truncate(frame.footer, content), role: "dim" }], content)));
	}
	lines.push(row(" ".repeat(content)));
	return { lines, bodyStart };
}

function neonLines(theme: CardTheme, frame: CardFrame, width: number): CardRender {
	const content = cardContentWidth(width);
	const border = (text: string) => paint(theme, "border", text);
	const plainLeft = `╭─ ▾ ${frame.title} `;
	const meta = frame.meta ?? "";
	const plainRight = meta ? ` ${meta} ─╮` : "╮";
	const fits = widthOf(plainLeft) + 1 + widthOf(plainRight) <= width;
	const right = fits ? plainRight : "╮";
	const fill = Math.max(1, width - widthOf(plainLeft) - widthOf(right));
	const top = fits
		? `${border("╭─ ")}${paint(theme, "muted", "▾")} ${paint(theme, "text", bold(theme, frame.title))} ${border("─".repeat(fill))}${paint(theme, "muted", ` ${meta} `)}${border("─╮")}`
		: `${border("╭─ ")}${paint(theme, "muted", "▾")} ${paint(theme, "text", bold(theme, frame.title))} ${border("─".repeat(fill))}${border("╮")}`;

	const rows = bodyRows(theme, frame, content);
	const lines: string[] = [top];
	const bodyStart = lines.length;
	for (const entry of rows) lines.push(`${border("│ ")}${renderSegments(theme, entry.segments, content)}${border(" │")}`);
	if (frame.footer) lines.push(`${border("│ ")}${renderSegments(theme, [{ text: truncate(frame.footer, content), role: "dim" }], content)}${border(" │")}`);
	lines.push(border(`╰${"─".repeat(Math.max(1, width - 2))}╯`));
	return { lines, bodyStart };
}

/**
 * Renders the modal as a gentle-shell card: the float style paints the tone
 * background behind every row with a `▎` edge, the outlined style draws the
 * rounded frame. Falls back to the frame when the float chrome cannot be painted.
 */
export function renderCardFrame(frame: CardFrame, theme: CardTheme, style: CardStyle, width: number): CardRender {
	const target = Math.max(10, Math.floor(width));
	const painter = floatPainter(theme, style, target);
	if (painter) return floatLines(theme, frame, target, painter);
	return neonLines(theme, frame, target);
}
