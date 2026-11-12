import assert from "node:assert/strict";
import { test } from "node:test";
import { conversationOverlayOptions, railColumns, terminalColumns } from "../src/overlay.ts";
import type { PiTui } from "../src/types.ts";

const SYMBOL = Symbol.for("gentle-pi.experimental-sidebar.state");

function terminal(columns: number, state?: Record<symbol, unknown>): PiTui {
	return { requestRender() {}, terminal: state ? { columns, ...state } : { columns } };
}

function railState(overrides: { active?: boolean; ownsHost?: () => boolean; railColumns?: unknown } = {}): Record<symbol, unknown> {
	return {
		[SYMBOL]: {
			active: overrides.active ?? true,
			ownsHost: overrides.ownsHost ?? (() => true),
			railColumns: overrides.railColumns ?? 53,
			...overrides,
		},
	};
}

test("S6: the rail's published columns are read from the terminal state", () => {
	assert.equal(railColumns({ [SYMBOL]: { active: true, ownsHost: () => true, railColumns: 53 } }), 54);
});

test("S6: anything unexpected reads as no rail, so the overlay stays where it was", () => {
	assert.equal(railColumns(undefined), 0);
	assert.equal(railColumns(null), 0);
	assert.equal(railColumns({}), 0);
	assert.equal(railColumns(railState({ active: false })), 0);
	assert.equal(railColumns(railState({ ownsHost: () => false })), 0);
	assert.equal(
		railColumns(
			railState({
				ownsHost: () => {
					throw new Error("boom");
				},
			}),
		),
		0,
	);
	assert.equal(railColumns(railState({ railColumns: 0 })), 0);
	assert.equal(railColumns(railState({ railColumns: 10.5 })), 0);
	assert.equal(railColumns(railState({ railColumns: "53" })), 0);
	assert.equal(railColumns({ [SYMBOL]: { active: true } }), 0);
});

test("S6: terminal width comes from the live terminal and never from a guess", () => {
	assert.equal(terminalColumns(terminal(188)), 188);
	assert.equal(terminalColumns(terminal(187.9)), 187);
	assert.equal(terminalColumns(undefined), 0);
	assert.equal(terminalColumns({ requestRender() {} }), 0);
	assert.equal(terminalColumns({ requestRender() {}, terminal: { columns: 0 } }), 0);
	assert.equal(terminalColumns({ requestRender() {}, terminal: { columns: Number.NaN } }), 0);
});

test("S6: with the rail painting, the overlay is confined to the conversation column", () => {
	const tui = terminal(200, railState());
	const options = conversationOverlayOptions(() => tui);

	// 200 columns - 54 for the rail = 146 available; 76% of that is 110.
	assert.equal(options.width, 110);
	assert.deepEqual(options.margin, { right: 54 });
	assert.equal(options.anchor, "center");
	assert.equal(options.maxHeight, "85%");
});

test("S6: without a rail the overlay keeps the previous full-window behaviour", () => {
	const tui = terminal(200);
	const options = conversationOverlayOptions(() => tui);
	assert.equal(options.width, 152);
	assert.equal(options.margin, undefined);

	const unknown = conversationOverlayOptions(() => undefined);
	assert.equal(unknown.width, "76%");
	assert.equal(unknown.margin, undefined);
});

test("S6: width never collapses below a usable minimum and never exceeds the column", () => {
	const tiny = conversationOverlayOptions(() => terminal(60));
	assert.equal(tiny.width, 56);

	const narrowRail = conversationOverlayOptions(() => terminal(100, railState({ railColumns: 40 })));
	// 100 - 41 = 59 available: 76% would be 44, so the minimum width wins and stays inside.
	assert.equal(narrowRail.width, 56);
	assert.deepEqual(narrowRail.margin, { right: 41 });
	assert.ok(Number(narrowRail.width) <= 59);
});

test("S6: width and margin are live, so a resize re-seats an open modal", () => {
	let columns = 200;
	const state = railState();
	const tui = { requestRender() {}, get terminal() { return { columns, ...state }; } } as PiTui;
	const options = conversationOverlayOptions(() => tui);

	assert.equal(options.width, 110);
	assert.deepEqual(options.margin, { right: 54 });

	// Crossing the rail's breakpoint must move the overlay back to the full window.
	columns = 120;
	const narrower = conversationOverlayOptions(() => ({ requestRender() {}, terminal: { columns } }));
	assert.equal(narrower.width, 91);
	assert.equal(narrower.margin, undefined);
});
