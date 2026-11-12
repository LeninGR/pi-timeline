import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPrompts } from "../src/prompts.ts";
import type { SessionPrompt } from "../src/prompts.ts";
import { createTimelineModal } from "../src/timeline-modal.ts";
import type { TimelineResult } from "../src/timeline-modal.ts";
import { widthOf } from "../src/width.ts";
import type { CardStyle } from "../src/card-style.ts";
import type { PiKeybindings, PiTheme, PiTui } from "../src/types.ts";

const ANSI = /\x1b\[[0-9;]*m/gu;
const plain = (text: string): string => text.replace(ANSI, "");

/** Identity colors and no background: the modal must fall back to the outlined frame. */
const OUTLINED_THEME: PiTheme = { fg: (_color, text) => text, bold: (text) => text };

/** Records every background paint, so float chrome is observable. */
function floatTheme(): { theme: PiTheme; bgCalls: string[] } {
	const bgCalls: string[] = [];
	return {
		bgCalls,
		theme: {
			fg: (_color, text) => text,
			bold: (text) => text,
			bg: (color, text) => {
				bgCalls.push(color);
				return `\x1b[48m${text}\x1b[49m`;
			},
		},
	};
}

/** Only logical actions are matched by name; raw sequences are exercised separately. */
const KEYS: PiKeybindings = { matches: (data, action) => data === action };
const TUI: PiTui = { requestRender() {} };

function promptsFrom(texts: string[]): SessionPrompt[] {
	return extractPrompts(
		texts.map((text, index) => ({
			type: "message",
			id: `e${index + 1}`,
			parentId: index === 0 ? null : `e${index}`,
			timestamp: `2026-01-01T10:0${index}:00.000Z`,
			message: { role: "user", content: text },
		})),
	);
}

function open(texts: string[], options: { maxRows?: number; style?: CardStyle; theme?: PiTheme } = {}) {
	const results: TimelineResult[] = [];
	const modal = createTimelineModal(
		TUI,
		options.theme ?? OUTLINED_THEME,
		KEYS,
		(result) => results.push(result),
		promptsFrom(texts),
		{ maxRows: options.maxRows, style: options.style ?? "neon" },
	);
	return { modal, results };
}

function visible(lines: string[]): string[] {
	return lines.map(plain);
}

function selectedRow(lines: string[]): string | undefined {
	return visible(lines).find((line) => line.includes("›"));
}

test("S1: the modal lists every prompt of the session, one row each, in order", () => {
	const { modal } = open(["primer prompt", "segundo prompt"]);
	const lines = visible(modal.render(70));
	const body = lines.filter((line) => line.includes("primer prompt") || line.includes("segundo prompt"));
	assert.equal(body.length, 2);
	assert.match(body[0] ?? "", /primer prompt/u);
	assert.match(body[1] ?? "", /segundo prompt/u);
	assert.match(lines[0] ?? "", /▾ TIMELINE/u);
	assert.match(lines[0] ?? "", /2\/2 prompts/u);
});

test("S1: an empty session says so inside the card", () => {
	const { modal } = open([]);
	const text = visible(modal.render(70)).join("\n");
	assert.match(text, /No prompts in this session yet/u);
	assert.match(text, /▾ TIMELINE/u);
});

test("S2: arrows move the selection and Enter jumps to the selected prompt", () => {
	const { modal, results } = open(["uno", "dos", "tres"]);
	assert.match(selectedRow(modal.render(70)) ?? "", /uno/u);

	modal.handleInput?.("\x1b[B");
	assert.match(selectedRow(modal.render(70)) ?? "", /dos/u);

	modal.handleInput?.("\r");
	assert.deepEqual(results, [{ kind: "jump", entryId: "e2" }]);
});

test("S2: the selection is clamped at both ends", () => {
	const { modal } = open(["uno", "dos"]);
	modal.handleInput?.("\x1b[A");
	assert.match(selectedRow(modal.render(70)) ?? "", /uno/u);
	modal.handleInput?.("\x1b[B");
	modal.handleInput?.("\x1b[B");
	assert.match(selectedRow(modal.render(70)) ?? "", /dos/u);
});

test("S2: Escape closes without jumping", () => {
	const { modal, results } = open(["uno"]);
	modal.handleInput?.("\x1b");
	assert.deepEqual(results, [{ kind: "close" }]);
});

test("S3: typing filters the list and Enter jumps to the first match", () => {
	const { modal, results } = open(["arreglar el parser", "otra cosa"]);
	for (const char of "cosa") modal.handleInput?.(char);
	const text = visible(modal.render(70)).join("\n");
	assert.match(text, /filter: cosa/u);
	assert.doesNotMatch(text, /arreglar el parser/u);

	modal.handleInput?.("\r");
	assert.deepEqual(results, [{ kind: "jump", entryId: "e2" }]);
});

test("S3: backspace edits the filter and ctrl+u clears it", () => {
	const { modal } = open(["alpha", "beta"]);
	modal.handleInput?.("b");
	modal.handleInput?.("x");
	assert.match(visible(modal.render(70)).join("\n"), /No prompt matches that filter/u);
	modal.handleInput?.("\x7f");
	assert.match(visible(modal.render(70)).join("\n"), /filter: b/u);
	modal.handleInput?.("\x15");
	assert.doesNotMatch(visible(modal.render(70)).join("\n"), /filter:/u);
});

test("S2: a click on a row jumps to that exact prompt", () => {
	const { modal, results } = open(["uno", "dos", "tres"]);
	const lines = visible(modal.render(70));
	const y = lines.findIndex((line) => line.includes("tres"));
	assert.ok(y > 0);

	modal.handleMouse?.({ type: "click", button: "left", x: 3, y, width: 70, height: lines.length });
	assert.deepEqual(results, [{ kind: "jump", entryId: "e3" }]);
});

test("S2: the wheel moves the selection", () => {
	const { modal } = open(["uno", "dos"]);
	modal.handleMouse?.({ type: "wheel", button: "none", x: 3, y: 2, width: 70, height: 10, wheelDelta: 1 });
	assert.match(selectedRow(modal.render(70)) ?? "", /dos/u);
});

test("S3: a long list shows a window that follows the selection", () => {
	const texts = Array.from({ length: 20 }, (_, index) => `prompt ${index + 1}`);
	const { modal } = open(texts, { maxRows: 5 });
	assert.match(visible(modal.render(70)).join("\n"), /rows 1-5 of 20/u);

	for (let step = 0; step < 10; step += 1) modal.handleInput?.("\x1b[B");
	const later = visible(modal.render(70)).join("\n");
	assert.match(later, /rows 7-11 of 20/u);
	assert.match(selectedRow(modal.render(70)) ?? "", /prompt 11/u);
});

test("S3: every rendered row fits the render width in both styles", () => {
	const texts = ["un prompt larguísimo con muchísimo texto para recortar", "otro"];
	for (const style of ["neon", "float"] as const) {
		const { theme } = floatTheme();
		const { modal } = open(texts, { style, theme, maxRows: 5 });
		for (const line of modal.render(28)) assert.ok(widthOf(line) <= 28, `${style}: line too wide: ${JSON.stringify(plain(line))}`);
	}
});

test("S4: the float style paints the card background behind every row", () => {
	const { theme, bgCalls } = floatTheme();
	const { modal } = open(["uno", "dos"], { style: "float", theme });
	const lines = modal.render(60);

	assert.ok(lines.length >= 6);
	// The opener is derived once from `theme.bg` on the card's tone role, then every
	// row is painted with it, margin included and closed with a background reset.
	assert.deepEqual([...new Set(bgCalls)], ["toolSuccessBg"]);
	assert.ok(lines.length > 0);
	for (const line of lines) {
		assert.ok(line.includes("\x1b[48m"), `row not painted: ${JSON.stringify(line)}`);
		assert.ok(line.trimEnd().endsWith("\x1b[49m"), `row not closed: ${JSON.stringify(line)}`);
	}
	assert.ok(plain(lines[1] ?? "").includes("▾ TIMELINE"));
	assert.ok(plain(lines[1] ?? "").startsWith(" ▎"));
	assert.doesNotMatch(visible(lines).join("\n"), /[╭╮╰╯│]/u);
});

test("S4: the outlined style draws the frame and paints no background", () => {
	const { theme, bgCalls } = floatTheme();
	const { modal } = open(["uno"], { style: "neon", theme });
	const text = visible(modal.render(60)).join("\n");
	assert.match(text, /╭─ ▾ TIMELINE/u);
	assert.match(text, /╰─+╯/u);
	assert.equal(bgCalls.length, 0);
});

test("S4: asking for float without a paintable theme falls back to the frame", () => {
	const { modal } = open(["uno"], { style: "float", theme: OUTLINED_THEME });
	const text = visible(modal.render(60)).join("\n");
	assert.match(text, /╭─ ▾ TIMELINE/u);
});
