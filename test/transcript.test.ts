import assert from "node:assert/strict";
import { test } from "node:test";
import { collectMessageRows, findScrollBox, markerRows, normalize, resolvePromptRow, resolveRowsByText, scrollTranscriptTo, stripSequences } from "../src/transcript.ts";
import type { PiLayoutBox, PiScrollView, PiTui } from "../src/types.ts";

const MARK = "\x1b]133;A\x07";

function fakeScrollView(): PiScrollView & { calls: Array<{ row: number; disableFollow?: boolean }> } {
	const calls: Array<{ row: number; disableFollow?: boolean }> = [];
	return {
		scrollTop: 99,
		viewportHeight: 20,
		calls,
		scrollTo(row, options) {
			this.scrollTop = row;
			calls.push({ row, disableFollow: options?.disableFollow });
		},
		scrollToStart() {},
		scrollToEnd() {},
		scrollBy() {
			return 0;
		},
	};
}

interface Frame {
	box: PiLayoutBox;
	scrollView: PiScrollView;
}

function fakeFrame(lines: string[], messageRows: Array<{ id: string; y: number }>, originY = 100): Frame {
	const scrollView = fakeScrollView();
	const content: PiLayoutBox = {
		rect: { x: 0, y: originY, width: 80, height: lines.length },
		children: messageRows.map(({ id, y }) => ({ component: { messageId: id }, rect: { x: 0, y, width: 80, height: 3 }, children: [] })),
	};
	const box: PiLayoutBox = { component: { messageId: undefined }, rect: { x: 0, y: 0, width: 80, height: 20 }, scrollView, scrollContentLines: lines, children: [content] };
	return { box, scrollView };
}

function fakeTui(frame: Frame | undefined): PiTui & { renders: number } {
	return {
		renders: 0,
		requestRender() {
			this.renders += 1;
		},
		getPrimaryScrollView: () => frame?.scrollView,
		currentLayout: frame ? { root: { rect: { x: 0, y: 0, width: 80, height: 20 }, children: [frame.box] } } : undefined,
	};
}

test("normalize drops escape sequences and collapses whitespace, so wrapping stops mattering", () => {
	assert.equal(stripSequences("\x1b[1mbold\x1b[0m \x1b]8;;http://x\x07link\x1b]8;;\x07"), "bold link");
	assert.equal(normalize(`${MARK} hola\n   mundo `), "hola mundo");
});

test("markerRows finds every message start, in order", () => {
	const lines = [`${MARK}a`, "b", `${MARK}c`, "d"];
	assert.deepEqual(markerRows(lines), [0, 2]);
	assert.deepEqual(markerRows(["a", "b"]), []);
});

test("S2: the text route aligns prompts to blocks in order, using the block that matches", () => {
	const lines = [`${MARK}primer prompt sobre el parser`, `${MARK}hola, sobre el parser hablamos luego`, `${MARK}segundo prompt`];
	const rows = resolveRowsByText(lines, [
		{ entryId: "a", text: "primer prompt sobre el parser" },
		{ entryId: "b", text: "segundo prompt" },
	]);
	assert.deepEqual([...rows.entries()], [
		["a", 0],
		["b", 2],
	]);
});

test("S2: repeated prompt text resolves to distinct blocks, in order", () => {
	const lines = [`${MARK}seguí`, `${MARK}respuesta`, `${MARK}seguí`];
	const rows = resolveRowsByText(lines, [
		{ entryId: "a", text: "seguí" },
		{ entryId: "b", text: "seguí" },
	]);
	assert.deepEqual([...rows.entries()], [
		["a", 0],
		["b", 2],
	]);
});

test("S2: markdown decoration in the prompt still matches its rendered text", () => {
	const lines = [`${MARK}Arreglar **el** parser`];
	const rows = resolveRowsByText(lines, [{ entryId: "a", text: "Arreglar **el** parser" }]);
	assert.equal(rows.get("a"), 0);
});

test("S2: the layout route maps an entry id to its content row exactly", () => {
	const frame = fakeFrame([`${MARK}a`, "b", `${MARK}c`], [
		{ id: "a", y: 102 },
		{ id: "c", y: 110 },
	]);
	assert.equal(collectMessageRows(frame.box).get("a"), 2);
	assert.equal(collectMessageRows(frame.box).get("c"), 10);
	assert.equal(collectMessageRows(undefined).size, 0);
});

test("S2: findScrollBox locates the scroll node through nested children", () => {
	const frame = fakeFrame(["x"], []);
	const root: PiLayoutBox = { rect: { x: 0, y: 0, width: 1, height: 1 }, children: [{ rect: { x: 0, y: 0, width: 1, height: 1 }, children: [frame.box] }] };
	assert.equal(findScrollBox(root, frame.scrollView), frame.box);
	assert.equal(findScrollBox(undefined, frame.scrollView), undefined);
});

test("S2: resolvePromptRow prefers the layout row and falls back to text, then gives up", () => {
	const lines = [
		`${MARK}hola`,
		...Array.from({ length: 5 }, () => "x"),
		`${MARK}chau`,
		...Array.from({ length: 5 }, () => "y"),
	];
	const frame = fakeFrame(lines, [
		{ id: "a", y: 102 },
		{ id: "b", y: 108 },
	]);
	const tui = fakeTui(frame);
	const prompts = [
		{ entryId: "a", text: "hola" },
		{ entryId: "b", text: "chau" },
	];
	assert.deepEqual(resolvePromptRow(tui, prompts, "a"), { row: 2, via: "layout" });
	assert.deepEqual(resolvePromptRow(tui, prompts, "b"), { row: 8, via: "layout" });

	// An entry the frame does not carry (rendered before this layout) falls back to
	// aligning the rendered text; one that matches nothing gives up instead of guessing.
	assert.deepEqual(resolvePromptRow(tui, prompts, "unknown"), undefined);
	assert.deepEqual(resolvePromptRow(tui, [{ entryId: "c", text: "chau" }], "c"), { row: 6, via: "text" });
	assert.equal(resolvePromptRow(fakeTui(undefined), prompts, "a"), undefined);
});

test("S2: scrolling moves the alt-screen scroll view and requests one render", () => {
	const frame = fakeFrame(["x"], []);
	const tui = fakeTui(frame);
	const view = frame.scrollView as ReturnType<typeof fakeScrollView>;
	assert.equal(scrollTranscriptTo(tui, 12), true);
	assert.deepEqual(view.calls, [{ row: 12, disableFollow: true }]);
	assert.equal(tui.renders, 1);

	const noScroll = fakeTui(undefined);
	assert.equal(scrollTranscriptTo(noScroll, 3), false);
	assert.equal(noScroll.renders, 0);
});
