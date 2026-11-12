/**
 * Local structural types for the slice of Pi's extension API this plugin uses.
 *
 * They are `import type`-free on purpose: Pi loads a package extension with jiti
 * from its own directory, where `@earendil-works/pi-*` is not resolvable, so this
 * package must not import anything at runtime.
 */

export interface PiTheme {
	fg(color: string, text: string): string;
	bold(text: string): string;
	/** Background roles; absent on themes that cannot paint one (the card then stays outlined). */
	bg?(color: string, text: string): string;
}

export interface PiKeybindings {
	matches(data: string, action: string): boolean;
}

/** Normalized cell-based mouse event (subset of pi-tui's `TuiMouseEvent`). */
export interface PiMouseEvent {
	type: "press" | "release" | "move" | "drag" | "click" | "wheel";
	button: "left" | "middle" | "right" | "none";
	x: number;
	y: number;
	width: number;
	height: number;
	wheelDelta?: number;
	clickCount?: number;
}

export interface PiMouseEventResult {
	handled?: boolean;
	render?: boolean;
}

export interface PiScrollView {
	scrollTop: number;
	viewportHeight: number;
	scrollTo(scrollTop: number, options?: { disableFollow?: boolean }): void;
	scrollToStart(): void;
	scrollToEnd(): void;
	scrollBy(lines: number): number;
}

/** One node of Pi's layout frame; only the fields this plugin reads are typed. */
export interface PiLayoutBox {
	component?: unknown;
	rect?: { x: number; y: number; width: number; height: number };
	children?: PiLayoutBox[];
	scrollView?: unknown;
	scrollContentLines?: string[];
}

export interface PiTui {
	requestRender(): void;
	/** Present on the alt-screen renderer only (fullscreen mode). */
	getPrimaryScrollView?(): PiScrollView | undefined;
	currentLayout?: { root?: PiLayoutBox } | undefined;
}

export interface PiOverlayOptions {
	anchor?: string;
	width?: number | string;
	minWidth?: number;
	maxWidth?: number | string;
	maxHeight?: number | string;
	margin?: number;
}

export interface PiCustomOptions {
	overlay?: boolean;
	overlayOptions?: PiOverlayOptions | (() => PiOverlayOptions);
}

export interface PiComponent {
	render(width: number): string[];
	handleInput?(data: string): void;
	handleMouse?(event: PiMouseEvent): PiMouseEventResult | undefined;
	invalidate?(): void;
	dispose?(): void;
}

export type PiCustomFactory = (
	tui: PiTui,
	theme: PiTheme,
	keybindings: PiKeybindings,
	done: (result?: unknown) => void,
) => PiComponent;

export interface PiMessage {
	role?: string;
	content?: unknown;
}

export interface PiSessionEntry {
	type: string;
	id: string;
	parentId: string | null;
	timestamp: string;
	message?: PiMessage;
}

export interface PiSessionManager {
	getBranch(): PiSessionEntry[];
	getEntries(): PiSessionEntry[];
	getLeafId(): string | null;
}

export interface PiUi {
	custom<T>(factory: PiCustomFactory, options?: PiCustomOptions): Promise<T>;
	notify(message: string, level?: "info" | "warning" | "error"): void;
}

export interface PiContext {
	ui: PiUi;
	sessionManager: PiSessionManager;
	hasUI?: boolean;
	mode?: string;
}

export interface PiCommandOptions {
	description?: string;
	handler: (args: string, ctx: PiContext) => void | Promise<void>;
}

export interface PiApi {
	registerCommand(name: string, options: PiCommandOptions): void;
}
