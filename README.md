# pi-timeline

A [Pi](https://github.com/earendil-works/pi) / [gentle-shell](https://github.com/Gentleman-Programming/gentle-shell) extension that adds `/timeline`, the prompt list opencode has: every prompt you sent to the model in this session, in one modal, and Enter (or a click) takes the transcript straight to that point.

```
 ▎                                                           
 ▎ ▾ TIMELINE                                    4/4 prompts 
 ▎                                                           
 ▎   ›  4 21:12 arreglá el parser del timeline                
 ▎      3 21:05 ahora los tests                               
 ▎      2 20:58 ¿por qué falla en fullscreen?                 
 ▎      1 20:41 quiero crear un plugin para gentle-shell …    
 ▎   type to filter · ↵ jump · esc close                      
 ▎                                                           
```

It is drawn as a gentle-shell card, in whatever card style you picked in Gentle →
Customize: `float` (the tinted block with its `▎` accent bar, this one) or `neon`
(the rounded `╭─ ▾ TIMELINE ────╮` frame). The style comes from
`<gentle config home>/card-style.json`, resolved in the same order the shell uses
(bundled prefix → `GENTLE_PI_CONFIG_HOME` → `GENTLE_SHELL_CONFIG_HOME` →
`~/.pi/gentle-ai`); a missing, malformed or unreadable file means `float`, exactly
like the shell. A theme that cannot paint a background, or a terminal narrower
than 10 columns, falls back to the frame instead of drawing half a card.

## What it does

- **`/timeline`** opens the prompt list of the **current session**. One row per prompt, in conversation order, with its position, local time and first line.
- **Enter** or a **click** closes the modal and scrolls the conversation so that prompt is the first visible line.
- **↑ / ↓**, `PageUp` / `PageDown`, `Home` / `End` and the **wheel** move the selection.
- Typing filters by any substring of the prompt; `Backspace` edits the filter, `ctrl+u` clears it, `Esc` closes.
- The card is centred on the **conversation column**, not the window: gentle-shell publishes its rail state on the terminal (`gentle-pi.experimental-sidebar.state`), and the overlay uses it as a live right margin, so the modal never covers the TODOS / AGENTS / CHANGES / STATS cards and re-seats itself if you resize across the rail's breakpoint. Without that state the overlay centres on the whole window, as before.
- **`/timeline debug`** opens a one-screen report of the mechanism the jump relies on (`scrollView`, `contentLines`, `messageRows`, `markers`, `railColumns`). Useful when a Pi upgrade moves something.
- The card follows your **card style** and **theme**: `float` tints the block and puts the `▎` accent bar on its edge, `neon` draws the rounded frame; title in `text`+bold, meta in `muted`, hints in `dim`, selected row in `accent`.

Only user turns are listed: tool results, compaction summaries, custom entries and empty prompts are skipped. Nothing is stored and nothing is captured — the list is read from the live session, so it works with prompt-history capture off.

## Install

### From a checkout

```bash
git clone https://github.com/LeninGR/pi-timeline.git
pi install ./pi-timeline
```

### Without touching your configuration

```bash
pi -e ./pi-timeline
```

### Loose extension (what a development checkout uses)

From inside the checkout, so the link always points at your working copy:

```bash
ln -s "$PWD" ~/.gentle-shell/agent/extensions/pi-timeline
```

Pi discovers `<agent home>/extensions/<name>/index.ts` on startup, so `/reload` is enough after a change.

### In `settings.json`

```json
{ "packages": ["./pi-timeline"] }
```

The package declares its entry through the `pi.extensions` manifest in `package.json` (`./index.ts`). It has no runtime dependencies: Pi loads it with jiti, and every Pi type here is a local structural shim, so nothing needs to be installed.

## How the jump works, and what can break

The list half uses only documented API: `pi.registerCommand`, `ctx.sessionManager.getBranch()` and `ctx.ui.custom()` for the overlay.

The jump half has no public API. Pi's extension UI contract exposes no way to scroll the conversation, so this plugin uses the same mechanism Pi's own `ctrl+shift+up` prompt navigation uses, reached through the `tui` object that `ctx.ui.custom()` hands to an overlay:

1. `tui.getPrimaryScrollView()` → the transcript's scroll view.
2. The layout frame of the last render → the row where the selected message component starts, matched by the session `entry.id` that Pi stores as the component's `messageId`.
3. If the entry is not in the current frame, a fallback aligns the rendered text of the session's prompts with the rendered message blocks, in order.
4. `scrollView.scrollTo(row, { disableFollow: true })`.

Everything is guarded: no transcript, no scroll view, or no locatable row produces a notice, never an exception and never a wrong jump. This route only exists in fullscreen mode (`tuiMode: "fullscreen"`); in regular terminal mode `/timeline` reports that the transcript cannot be scrolled.

If a Pi upgrade moves those internals, `/timeline debug` is the fastest way to see which link broke.

## Development

```bash
npm test         # node --test, plain TypeScript, no build step
npm run typecheck
```

Tests cover the three specs end to end: prompt extraction (S1), row resolution plus scrolling (S2), and the modal's keyboard, filter and mouse behaviour (S1–S3), each with a fake theme, keybinding manager and `tui` so nothing touches a real terminal.

## License

MIT
