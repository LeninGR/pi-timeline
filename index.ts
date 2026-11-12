// Pi package entry point. Pi discovers this through the `pi.extensions` manifest
// in package.json and calls the default export with its ExtensionAPI.
import { registerTimelineExtension } from "./src/extension.ts";
import type { PiApi } from "./src/types.ts";

export { registerTimelineExtension, openTimeline, COMMAND_NAME, COMMAND_DESCRIPTION } from "./src/extension.ts";
export { extractPrompts, filterPrompts, previewOf, clockOf } from "./src/prompts.ts";
export type { SessionPrompt } from "./src/prompts.ts";
export { createTimelineModal, truncate, widthOf } from "./src/timeline-modal.ts";
export type { TimelineResult } from "./src/timeline-modal.ts";
export { configHomeCandidates, parseCardStyleFile, readCardStyle } from "./src/card-style.ts";
export type { CardStyle } from "./src/card-style.ts";
export { normalize, resolvePromptRow, resolveRowsByText, markerRows } from "./src/transcript.ts";

export default function piTimeline(pi: PiApi): void {
	registerTimelineExtension(pi);
}
