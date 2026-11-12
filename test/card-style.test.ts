import assert from "node:assert/strict";
import { test } from "node:test";
import { parseCardStyleFile, configHomeCandidates, readCardStyle } from "../src/card-style.ts";

test("S4: a well-formed preference file reads as its style", () => {
	assert.equal(parseCardStyleFile('{"schema":"gentle-pi.card-style/v1","style":"float"}'), "float");
	assert.equal(parseCardStyleFile('{"schema":"gentle-pi.card-style/v1","style":"neon"}'), "neon");
});

test("S4: a malformed file, a wrong schema or an unknown style reads as undefined", () => {
	assert.equal(parseCardStyleFile(undefined), undefined);
	assert.equal(parseCardStyleFile("not json"), undefined);
	assert.equal(parseCardStyleFile("[]"), undefined);
	assert.equal(parseCardStyleFile('{"schema":"other/v1","style":"neon"}'), undefined);
	assert.equal(parseCardStyleFile('{"schema":"gentle-pi.card-style/v1","style":"boxed"}'), undefined);
	assert.equal(parseCardStyleFile('{"schema":"gentle-pi.card-style/v1","style":"neon","extra":1}'), undefined);
	assert.equal(parseCardStyleFile('{"style":"neon"}'), undefined);
});

test("S4: config homes follow gentle-pi's precedence, bundled prefix first", () => {
	const env = { GENTLE_SHELL_PREFIX: "/opt/shell", GENTLE_PI_CONFIG_HOME: "/cfg/pi", GENTLE_SHELL_CONFIG_HOME: "/cfg/marker" };
	assert.deepEqual(configHomeCandidates(env, "/home/u"), ["/opt/shell/config/gentle-ai", "/cfg/pi", "/cfg/marker", "/home/u/.pi/gentle-ai"]);

	assert.deepEqual(configHomeCandidates({ GENTLE_SHELL_CONFIG_HOME: "/cfg/marker" }, "/home/u"), ["/cfg/marker", "/home/u/.pi/gentle-ai"]);
	// A relative marker is a launcher error, not a home: it must never be used.
	assert.deepEqual(configHomeCandidates({ GENTLE_SHELL_CONFIG_HOME: "relative/path" }, "/home/u"), ["/home/u/.pi/gentle-ai"]);
	assert.deepEqual(configHomeCandidates({ GENTLE_SHELL_PREFIX: "relative" }, "/home/u"), ["/home/u/.pi/gentle-ai"]);
});

test("S4: the first home that has the file decides, and a malformed file means float", () => {
	const read = (content: Record<string, string>) => (path: string): string | undefined => content[path];

	assert.equal(
		readCardStyle({
			env: { GENTLE_PI_CONFIG_HOME: "/cfg/pi" },
			homedir: "/home/u",
			readFile: read({ "/cfg/pi/card-style.json": '{"schema":"gentle-pi.card-style/v1","style":"neon"}' }),
		}),
		"neon",
	);

	// Bundled prefix wins over an explicit home: it is the shell's own order.
	assert.equal(
		readCardStyle({
			env: { GENTLE_SHELL_PREFIX: "/opt/shell", GENTLE_PI_CONFIG_HOME: "/cfg/pi" },
			homedir: "/home/u",
			readFile: read({
				"/opt/shell/config/gentle-ai/card-style.json": '{"schema":"gentle-pi.card-style/v1","style":"neon"}',
				"/cfg/pi/card-style.json": '{"schema":"gentle-pi.card-style/v1","style":"float"}',
			}),
		}),
		"neon",
	);

	// A file that exists but is unusable reads as float, exactly like the shell.
	assert.equal(
		readCardStyle({ env: {}, homedir: "/home/u", readFile: read({ "/home/u/.pi/gentle-ai/card-style.json": "{oops" }) }),
		"float",
	);
});

test("S4: no file anywhere is float, and a throwing reader never escapes", () => {
	assert.equal(readCardStyle({ env: {}, homedir: "/home/u", readFile: () => undefined }), "float");
	assert.equal(
		readCardStyle({
			env: {},
			homedir: "/home/u",
			readFile: () => {
				throw new Error("EACCES");
			},
		}),
		"float",
	);
});
