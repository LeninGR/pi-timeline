import assert from "node:assert/strict";
import { test } from "node:test";
import { clockOf, extractPrompts, filterPrompts, previewOf } from "../src/prompts.ts";
import type { PiSessionEntry } from "../src/types.ts";

function entry(partial: Partial<PiSessionEntry> & { id: string }): PiSessionEntry {
	return { type: "message", parentId: null, timestamp: "2026-01-01T10:00:00.000Z", ...partial } as PiSessionEntry;
}

test("S1: extracts user prompts in order, with their entry id and 1-based position", () => {
	const entries: PiSessionEntry[] = [
		entry({ id: "a", message: { role: "user", content: "primer prompt" } }),
		entry({ id: "b", message: { role: "assistant", content: [{ type: "text", text: "respuesta" }] } }),
		entry({ id: "c", message: { role: "user", content: [{ type: "text", text: "segundo" }, { type: "image", data: "x" }] } }),
	];

	assert.deepEqual(
		extractPrompts(entries).map((prompt) => [prompt.entryId, prompt.position, prompt.text]),
		[
			["a", 1, "primer prompt"],
			["c", 2, "segundo"],
		],
	);
});

test("S1: skips non-message entries, non-user roles and empty prompts", () => {
	const entries: PiSessionEntry[] = [
		entry({ id: "compact", type: "compaction" }),
		entry({ id: "b", message: { role: "toolResult", content: "salida" } }),
		entry({ id: "d", message: { role: "user", content: "   \n  " } }),
		entry({ id: "e", message: { role: "user", content: [] } }),
		entry({ id: "f", message: { role: "user", content: "sobrevive" } }),
	];

	assert.deepEqual(
		extractPrompts(entries).map((prompt) => prompt.entryId),
		["f"],
	);
});

test("S1: keeps a timestamp for each prompt and formats it as local HH:MM", () => {
	const [prompt] = extractPrompts([entry({ id: "a", timestamp: "2026-01-01T14:32:10.000Z", message: { role: "user", content: "x" } })]);
	assert.equal(prompt?.timestamp, "2026-01-01T14:32:10.000Z");
	const local = new Date("2026-01-01T14:32:10.000Z");
	assert.equal(clockOf("2026-01-01T14:32:10.000Z"), `${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`);
	assert.equal(clockOf(""), "");
	assert.equal(clockOf("not-a-date"), "");
});

test("S3: the row preview is the first non-empty line with collapsed whitespace", () => {
	assert.equal(previewOf("   \n\n  hola   mundo  \nsegunda linea"), "hola mundo");
	assert.equal(previewOf(""), "");
});

test("S3: filter is a case-insensitive substring search over the whole prompt", () => {
	const prompts = extractPrompts([
		entry({ id: "a", message: { role: "user", content: "Arreglar el parser" } }),
		entry({ id: "b", message: { role: "user", content: "otra cosa" } }),
	]);
	assert.deepEqual(filterPrompts(prompts, "PARSER").map((prompt) => prompt.entryId), ["a"]);
	assert.deepEqual(filterPrompts(prompts, " ").map((prompt) => prompt.entryId), ["a", "b"]);
	assert.deepEqual(filterPrompts(prompts, "").map((prompt) => prompt.entryId), ["a", "b"]);
});
