import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";

/**
 * The conversation card style chosen in Gentle → Customize. gentle-pi 4.7.0 has
 * exactly these two; anything else, a missing file or a malformed one reads as
 * `float`, which is the shell's own default.
 */
export type CardStyle = "float" | "neon";

export const CARD_STYLE_SCHEMA = "gentle-pi.card-style/v1";
export const CARD_STYLE_FILE = "card-style.json";

export function isCardStyle(value: unknown): value is CardStyle {
	return value === "float" || value === "neon";
}

/**
 * Strict shape, mirroring gentle-pi's `parseCardStyleFile`: exactly
 * `{schema, style}` with the expected schema. Anything else is malformed.
 */
export function parseCardStyleFile(raw: string | undefined): CardStyle | undefined {
	if (raw === undefined) return undefined;
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
		const record = value as Record<string, unknown>;
		if (Object.keys(record).length !== 2) return undefined;
		if (record.schema !== CARD_STYLE_SCHEMA) return undefined;
		if (!("style" in record)) return undefined;
		return isCardStyle(record.style) ? record.style : undefined;
	} catch {
		return undefined;
	}
}

export interface ConfigHomeEnv {
	GENTLE_SHELL_PREFIX?: string;
	GENTLE_PI_CONFIG_HOME?: string;
	GENTLE_SHELL_CONFIG_HOME?: string;
}

/**
 * Candidate config homes in gentle-pi's own precedence: a bundled prefix's
 * `<prefix>/config/gentle-ai`, then an explicit `GENTLE_PI_CONFIG_HOME`, then the
 * launcher's absolute `GENTLE_SHELL_CONFIG_HOME`, then `~/.pi/gentle-ai`.
 *
 * The shell validates its bundled prefix against a real install; a third-party
 * extension cannot, so the candidates are probed for the file instead and the
 * first one that exists decides.
 */
export function configHomeCandidates(env: ConfigHomeEnv, home: string): string[] {
	const candidates: string[] = [];
	const prefix = env.GENTLE_SHELL_PREFIX;
	if (prefix && isAbsolute(prefix)) candidates.push(join(prefix, "config", "gentle-ai"));
	if (env.GENTLE_PI_CONFIG_HOME) candidates.push(env.GENTLE_PI_CONFIG_HOME);
	const marker = env.GENTLE_SHELL_CONFIG_HOME;
	if (marker && isAbsolute(marker)) candidates.push(marker);
	candidates.push(join(home, ".pi", "gentle-ai"));
	return [...new Set(candidates)];
}

export interface CardStyleDeps {
	env?: ConfigHomeEnv;
	homedir?: string;
	/** Returns the file's text, or undefined when it cannot be read. */
	readFile?: (path: string) => string | undefined;
}

function defaultReadFile(path: string): string | undefined {
	try {
		return readFileSync(path, "utf8");
	} catch {
		return undefined;
	}
}

/** The user's selected card style; never throws, falls back to `float`. */
export function readCardStyle(deps: CardStyleDeps = {}): CardStyle {
	const env = deps.env ?? process.env;
	const home = deps.homedir ?? homedir();
	const read = deps.readFile ?? defaultReadFile;
	for (const dir of configHomeCandidates(env, home)) {
		let raw: string | undefined;
		try {
			raw = read(join(dir, CARD_STYLE_FILE));
		} catch {
			// An injected or unusual reader must not escape: an unreadable file is no file.
			raw = undefined;
		}
		if (raw === undefined) continue;
		// An existing file decides, malformed included: it reads as float, exactly
		// like the shell, which also refuses to rewrite it.
		return parseCardStyleFile(raw) ?? "float";
	}
	return "float";
}
