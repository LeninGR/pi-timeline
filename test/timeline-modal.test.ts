import assert from "node:assert/strict";
import { test } from "node:test";
import { extractPrompts } from "../src/prompts.ts";
import type { SessionPrompt } from "../src/prompts.ts";
import { createTimelineModal } from "../src/timeline-modal.ts";
import type { TimelineResult } from "../src/timeline-modal.ts";
import type { PiKeybindings, PiTheme, PiTui } from "../src/types.ts";

const THEME: PiTheme = { fg: (_color, text) => text, bold: (text) => text };
/** Only the logical actions are matched by name; raw sequences are exercised separately. */
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

function open(texts: string[], options: { maxRows?: number } = {}) {
	const results: TimelineResult[] = [];
	const modal = createTimelineModal(TUI, THEME, KEYS, (result) => results.push(result), promptsFrom(texts), options);
	return { modal, results };
}

function selectedRow(lines: string[]): string | undefined {
	return lines.find((line) => line.startsWith("▌"));
}

test("S1: the modal lists every prompt of the session, one row each, in order", () => {
	const { modal } = open(["primer prompt", "segundo prompt"]);
	const lines = modal.render(70);
	const body = lines.filter((line) => line.includes("primer prompt") || line.includes("segundo prompt"));
	assert.equal(body.length, 2);
	assert.match(body[0] ?? "", /primer prompt/u);
	assert.match(body[1] ?? "", /segundo prompt/u);
	assert.match(lines[0] ?? "", /Timeline · 2\/2 prompts/u);
});

test("S1: an empty session says so instead of drawing an empty list", () => {
	const { modal } = open([]);
	assert.match(modal.render(70).join("\n"), /No prompts in this session yet/u);
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
	const lines = modal.render(70);
	assert.match(lines.join("\n"), /filter: cosa/u);
	assert.doesNotMatch(lines.join("\n"), /arreglar el parser/u);

	modal.handleInput?.("\r");
	assert.deepEqual(results, [{ kind: "jump", entryId: "e2" }]);
});

test("S3: backspace edits the filter and ctrl+u clears it", () => {
	const { modal } = open(["alpha", "beta"]);
	modal.handleInput?.("b");
	modal.handleInput?.("x");
	assert.match(modal.render(70).join("\n"), /No prompt matches that filter/u);
	modal.handleInput?.("\x7f");
	assert.match(modal.render(70).join("\n"), /filter: b/u);
	modal.handleInput?.("\x15");
	assert.doesNotMatch(modal.render(70).join("\n"), /filter:/u);
});

test("S2: a click on a row jumps to that prompt", () => {
	const { modal, results } = open(["uno", "dos", "tres"]);
	const lines = modal.render(70);
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
	const first = modal.render(70);
	assert.match(first.join("\n"), /rows 1-5 of 20/u);

	for (let step = 0; step < 10; step += 1) modal.handleInput?.("\x1b[B");
	const later = modal.render(70);
	assert.match(later.join("\n"), /rows 7-11 of 20/u);
	assert.match(selectedRow(later) ?? "", /prompt 11/u);
});

test("S2: rows are truncated to the render width instead of wrapping", () => {
	const { modal } = open(["un prompt larguísimo con muchísimo texto para recortar"]);
	const lines = modal.render(24);
	for (const line of lines) assert.ok([...line].length <= 24, `line too wide: ${line}`);
});
