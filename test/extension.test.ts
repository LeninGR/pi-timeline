import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMAND_NAME, openTimeline, registerTimelineExtension, reportDiagnostics } from "../src/extension.ts";
import type { PiApi, PiCommandOptions, PiContext, PiCustomFactory, PiLayoutBox, PiScrollView, PiTui } from "../src/types.ts";

const MARK = "\x1b]133;A\x07";

interface FakeScroll extends PiScrollView {
	rows: number[];
}

function fakeScroll(): FakeScroll {
	const rows: number[] = [];
	return {
		rows,
		scrollTop: 0,
		viewportHeight: 10,
		scrollTo(row) {
			rows.push(row);
		},
		scrollToStart() {},
		scrollToEnd() {},
		scrollBy: () => 0,
	};
}

function fakeTui(scroll: PiScrollView | undefined, lines: string[], messageY: Record<string, number>): PiTui {
	const content: PiLayoutBox = {
		rect: { x: 0, y: 100, width: 80, height: lines.length },
		children: Object.entries(messageY).map(([id, y]) => ({ component: { messageId: id }, rect: { x: 0, y, width: 80, height: 4 }, children: [] })),
	};
	const box: PiLayoutBox = { rect: { x: 0, y: 0, width: 80, height: 20 }, scrollView: scroll, scrollContentLines: lines, children: [content] };
	return {
		requestRender() {},
		getPrimaryScrollView: () => scroll,
		currentLayout: scroll ? { root: { rect: { x: 0, y: 0, width: 80, height: 20 }, children: [box] } } : undefined,
	};
}

function branch(texts: string[]) {
	return texts.map((text, index) => ({
		type: "message",
		id: `e${index + 1}`,
		parentId: index === 0 ? null : `e${index}`,
		timestamp: "2026-01-01T10:00:00.000Z",
		message: { role: "user", content: text },
	}));
}

interface Harness {
	ctx: PiContext;
	notes: Array<{ message: string; level?: string }>;
	customs: number;
}

function harness(branchTexts: string[], options: { result?: unknown; tui?: PiTui; mode?: string } = {}): Harness {
	const notes: Array<{ message: string; level?: string }> = [];
	const state = { customs: 0 };
	const ctx: PiContext = {
		mode: options.mode ?? "tui",
		hasUI: true,
		sessionManager: { getBranch: () => branch(branchTexts), getEntries: () => branch(branchTexts), getLeafId: () => null },
		ui: {
			async custom<T>(factory: PiCustomFactory): Promise<T> {
				state.customs += 1;
				factory(options.tui ?? fakeTui(undefined, [], {}), { fg: (_c, t) => t, bold: (t) => t }, { matches: () => false }, () => {});
				return (options.result ?? { kind: "close" }) as T;
			},
			notify(message: string, level?: "info" | "warning" | "error") {
				notes.push({ message, level });
			},
		},
	};
	return {
		ctx,
		notes,
		get customs() {
			return state.customs;
		},
	};
}

test("S4: the extension registers the /timeline command", () => {
	const registered: Array<{ name: string; options: PiCommandOptions }> = [];
	const pi: PiApi = { registerCommand: (name, options) => registered.push({ name, options }) };
	registerTimelineExtension(pi);
	assert.equal(registered.length, 1);
	assert.equal(registered[0]?.name, COMMAND_NAME);
	assert.equal(registered[0]?.name, "timeline");
	assert.ok(registered[0]?.options.description);
});

test("S2: choosing a prompt scrolls the transcript to its row", async () => {
	const scroll = fakeScroll();
	const lines = [`${MARK}hola`, "b", "c", `${MARK}chau`, "d"];
	const tui = fakeTui(scroll, lines, { e1: 102, e2: 103 });
	const h = harness(["hola", "chau"], { result: { kind: "jump", entryId: "e2" }, tui });

	await openTimeline(h.ctx);
	assert.equal(h.customs, 1);
	assert.deepEqual(scroll.rows, [3]);
	assert.deepEqual(h.notes, []);
});

test("S2: a prompt the transcript cannot place warns instead of scrolling", async () => {
	const scroll = fakeScroll();
	const tui = fakeTui(scroll, [`${MARK}otra cosa`], {});
	const h = harness(["hola"], { result: { kind: "jump", entryId: "e1" }, tui });

	await openTimeline(h.ctx);
	assert.deepEqual(scroll.rows, []);
	assert.equal(h.notes[0]?.level, "warning");
	assert.match(h.notes[0]?.message ?? "", /could not locate/u);
});

test("S2: closing the modal scrolls nothing, and a runtime without a scrollable transcript says so", async () => {
	const scroll = fakeScroll();
	const closed = harness(["hola"], { result: { kind: "close" }, tui: fakeTui(scroll, [`${MARK}hola`], { e1: 100 }) });
	await openTimeline(closed.ctx);
	assert.deepEqual(scroll.rows, []);

	// Present but not scrollable: the row resolves, the scroll itself refuses.
	const broken = { ...fakeScroll(), scrollTo: undefined } as unknown as PiScrollView;
	const noScroll = harness(["hola"], { result: { kind: "jump", entryId: "e1" }, tui: fakeTui(broken, [`${MARK}hola`], { e1: 100 }) });
	await openTimeline(noScroll.ctx);
	assert.equal(noScroll.notes[0]?.level, "warning");
	assert.match(noScroll.notes[0]?.message ?? "", /cannot scroll/u);

	// No scroll view at all: the prompt cannot be located either.
	const absent = harness(["hola"], { result: { kind: "jump", entryId: "e1" }, tui: fakeTui(undefined, [], {}) });
	await openTimeline(absent.ctx);
	assert.match(absent.notes[0]?.message ?? "", /could not locate/u);
});

test("S1: an empty session and a non-TUI mode never open the modal", async () => {
	const empty = harness([]);
	await openTimeline(empty.ctx);
	assert.equal(empty.customs, 0);
	assert.match(empty.notes[0]?.message ?? "", /no prompts in this session/u);

	const headless = harness(["hola"], { mode: "print" });
	await openTimeline(headless.ctx);
	assert.equal(headless.customs, 0);
	assert.match(headless.notes[0]?.message ?? "", /only available in the terminal UI/u);
});

test("S2: /timeline debug measures the seam live instead of guessing", async () => {
	const scroll = fakeScroll();
	const tui = fakeTui(scroll, [`${MARK}hola`, "b"], { e1: 100 });
	const h = harness(["hola"], { tui });
	const rendered: string[] = [];
	h.ctx.ui.custom = async <T,>(factory: PiCustomFactory): Promise<T> => {
		const component = factory(tui, { fg: (_c, t) => t, bold: (t) => t }, { matches: () => false }, () => {});
		rendered.push(...component.render(80));
		return undefined as T;
	};

	await reportDiagnostics(h.ctx);
	const text = rendered.join("\n");
	assert.match(text, /scrollView=yes/u);
	assert.match(text, /contentLines=2/u);
	assert.match(text, /messageRows=1/u);
	assert.match(text, /markers=1/u);
});
