import { readCardStyle } from "./card-style.ts";
import { extractPrompts } from "./prompts.ts";
import { createTimelineModal } from "./timeline-modal.ts";
import type { TimelineResult } from "./timeline-modal.ts";
import { conversationOverlayOptions, railColumns } from "./overlay.ts";
import { collectMessageRows, findScrollBox, markerRows, resolvePromptRow, scrollTranscriptTo } from "./transcript.ts";
import type { PiApi, PiContext, PiTui } from "./types.ts";

export const COMMAND_NAME = "timeline";
export const COMMAND_DESCRIPTION = "List every prompt of this session and jump to one";

// The overlay is seated by a live getter, and `tui` is only available inside the
// factory, which Pi resolves before it shows the overlay.
function overlayFor(getTui: () => PiTui | undefined) {
	return { overlay: true as const, overlayOptions: conversationOverlayOptions(getTui) };
}

function notify(ctx: PiContext, message: string, level: "info" | "warning" | "error" = "info"): void {
	try {
		ctx.ui.notify(message, level);
	} catch {
		// A failed notification must never break the command.
	}
}

export function registerTimelineExtension(pi: PiApi): void {
	pi.registerCommand(COMMAND_NAME, {
		description: COMMAND_DESCRIPTION,
		handler: async (args, ctx) => {
			if (args.trim().toLowerCase() === "debug") {
				await reportDiagnostics(ctx);
				return;
			}
			await openTimeline(ctx);
		},
	});
}

/**
 * S1 + S2: list this session's prompts, then move the transcript to the chosen
 * one. The jump is applied after the modal resolves, so the overlay is gone and
 * the scroll is what the user sees on the next frame.
 */
export async function openTimeline(ctx: PiContext): Promise<void> {
	if (ctx.mode !== "tui" || !ctx.hasUI) {
		notify(ctx, "timeline: the prompt list is only available in the terminal UI", "warning");
		return;
	}

	const prompts = extractPrompts(ctx.sessionManager.getBranch());
	if (prompts.length === 0) {
		notify(ctx, "timeline: no prompts in this session yet", "info");
		return;
	}

	let tui: PiTui | undefined;
	// Read once per open: the style is a preference file, not per-frame state.
	const style = readCardStyle();
	const result = await ctx.ui.custom<TimelineResult>(
		(tuiArg, theme, keys, done) => {
			tui = tuiArg;
			return createTimelineModal(tuiArg, theme, keys, (value) => done(value), prompts, { style });
		},
		overlayFor(() => tui),
	);

	if (!result || result.kind !== "jump" || !tui) return;

	const resolved = resolvePromptRow(tui, prompts, result.entryId);
	if (!resolved) {
		notify(ctx, "timeline: could not locate that prompt in the transcript", "warning");
		return;
	}
	if (!scrollTranscriptTo(tui, resolved.row)) {
		notify(ctx, "timeline: this terminal mode cannot scroll the transcript", "warning");
	}
}

/**
 * `/timeline debug`: the seam this plugin relies on, measured live from inside an
 * overlay (the only place the live `tui` is reachable). Kept because the scroll
 * route uses runtime internals that a Pi upgrade can move away.
 */
export async function reportDiagnostics(ctx: PiContext): Promise<void> {
	const prompts = extractPrompts(ctx.sessionManager.getBranch());
	let diagnosticsTui: PiTui | undefined;
	await ctx.ui.custom<void>(
		(tui, theme, _keys, done) => {
			diagnosticsTui = tui;
			return {
				render: (width: number) => {
					const scrollView = tui.getPrimaryScrollView?.();
					const box = scrollView ? findScrollBox(tui.currentLayout?.root, scrollView) : undefined;
					const lines = box?.scrollContentLines ?? [];
					const parts = [
						`mode=${ctx.mode ?? "unknown"}`,
						`prompts=${prompts.length}`,
						`scrollView=${scrollView ? "yes" : "no"}`,
						`contentLines=${lines.length}`,
						`messageRows=${collectMessageRows(box).size}`,
						`markers=${markerRows(lines).length}`,
						`railColumns=${railColumns(tui.terminal)}`,
					];
					const inner = Math.max(16, width);
					return [
						theme.fg("accent", "timeline debug"),
						...parts.map((part) => theme.fg("dim", part.slice(0, inner))),
						theme.fg("dim", "enter or esc closes"),
					];
				},
				handleInput: (data: string) => {
					if (data === "\r" || data === "\n" || data === "\x1b" || data === "\x03") done();
				},
			};
		},
		overlayFor(() => diagnosticsTui),
	);
}
