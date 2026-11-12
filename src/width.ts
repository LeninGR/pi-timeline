const OSC_SEQUENCE = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/gu;
const CSI_SEQUENCE = /\x1b\[[0-9;?]*[ -/]*[@-~]/gu;

/** Remove terminal escape sequences so a rendered line can be measured. */
export function stripSequences(text: string): string {
	return text.replace(OSC_SEQUENCE, "").replace(CSI_SEQUENCE, "");
}

function cellWidth(char: string): number {
	if (/\p{Mark}|\p{Default_Ignorable_Code_Point}/u.test(char)) return 0;
	return /[\p{Extended_Pictographic}\u1100-\u115f\u2e80-\ua4cf\uac00-\ud7a3\uf900-\ufaff\ufe10-\ufe6f\uff01-\uff60\uffe0-\uffe6]/u.test(char) ? 2 : 1;
}

/** Visible cell count of a plain-or-ANSI string. */
export function widthOf(text: string): number {
	let width = 0;
	for (const char of stripSequences(text)) width += cellWidth(char);
	return width;
}

/** Cut to `width` cells, appending an ellipsis when something was dropped. */
export function truncate(text: string, width: number): string {
	if (width <= 0) return "";
	if (widthOf(text) <= width) return text;
	const budget = Math.max(0, width - 1);
	let out = "";
	for (const char of text) {
		if (widthOf(out + char) > budget) break;
		out += char;
	}
	return `${out}…`;
}

/** Pad to exactly `width` cells (never truncates). */
export function pad(text: string, width: number): string {
	const missing = width - widthOf(text);
	return missing > 0 ? `${text}${" ".repeat(missing)}` : text;
}
