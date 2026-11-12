# Timeline plugin for gentle-shell

A Pi package (`pi.extensions`) that adds `/timeline`: a modal listing every prompt
sent to the model in the current session, where click or Enter takes the transcript
to that point.

## Specs

- **S1** — «mostrar en un modal el listado de todos los prompts que le he escrito al
  modelo en la sesión en la que se encuentra».
- **S2** — «si doy clic o enter en alguno, me lleve directamente a ese punto en la
  sesión».
- **S3** — «estilo el comando que tiene opencode /timeline»: the command is `/timeline`.
- **S4** — «crear un plugin para gentle-shell» following its own plugin mechanism, with
  `https://github.com/facundomv01/pi-qwencloud-quota` as the packaging reference: a Pi
  package whose `package.json` declares `pi.extensions`, entry `index.ts` with a default
  export factory, tests under `test/`.

## Tasks

- **T1** — Feature document, probe evidence, and repo scaffold (manifest, tsconfig,
  README). Route: inline. Spec: S4.
- **T2** — `src/prompts.ts`: extract user prompts, in order, from the session branch.
  Spec: S1.
- **T3** — `src/transcript.ts`: map a session entry id to a rendered transcript row and
  scroll there, with a text-scan fallback. Spec: S2.
- **T4** — `src/timeline-modal.ts`: overlay list with arrows/PageUp/PageDown, type-to-filter,
  Enter/click to jump, Esc to close. Spec: S1–S3.
- **T5** — `src/extension.ts` + `index.ts`: register `/timeline`, open the modal, apply the
  jump, degrade with a notice when the runtime has no scrollable transcript. Spec: S2–S4.
- **T6** — tests (`node --test`) + live install into the agent extension dir. Spec: S1–S4.
- **T9** — inner padding on the card (1 left, 2 right) for header, rows and footer.
  Spec: S7.
- **T8** — `src/overlay.ts`: read the rail width gentle-shell publishes on the terminal and
  pass it as a live right margin plus an absolute width, so the overlay is centred inside
  the conversation column and re-seats itself on resize. Spec: S6.
- **T7** — `src/card-style.ts` + `src/card-chrome.ts`: read the card style the shell uses and
  render the modal as a native card (float tint with the `▎` accent bar, or the neon frame),
  with a frame fallback when the theme cannot paint a background. Spec: S5.

## Evidence

Seam used for the jump (all read from the installed runtime, not guessed):

- `pi.registerCommand(name, { description, handler })` — `dist/core/extensions/types.d.ts`.
- `ctx.sessionManager.getBranch()` → ordered `SessionEntry[]`, `entry.id` stable, user
  messages are `entry.type === "message" && entry.message.role === "user"`.
- `ctx.ui.custom(factory, { overlay: true, overlayOptions })`; the `tui` argument is a
  proxy over the live `TuiAltScreen` (`interactive-mode.js` `createInteractiveTuiReference`),
  so `tui.getPrimaryScrollView()`, `tui.currentLayout`, `tui.scrollToPrompt()` and
  `ScrollView.scrollTo(row)` are reachable at runtime.
- Rendered transcript content lines carry the OSC 133 prompt markers
  (`\x1b]133;A`) that `TuiAltScreen.scrollToPrompt` scans; `UserMessageComponent` and
  `AssistantMessageComponent` store the session `entry.id` as `messageId`.

- Card chrome mirrors gentle-pi's own `lib/shell-card.ts` / `lib/shell-panel.ts`:
  `▾ TITLE` header with a right-aligned count, body indented 2 columns, float = tone
  background painted per row with the `▎` accent bar inside a one-column margin, neon =
  `╭─ ▾ TITLE ─── count ─╮` frame. Style from `<config home>/card-style.json`
  (`gentle-pi.card-style/v1`), resolved in the shell's own precedence.

- Overlay seating comes from the rail state gentle-pi publishes on the terminal under
  `Symbol.for("gentle-pi.experimental-sidebar.state")` (`{active, ownsHost(), railColumns}`),
  the same channel its own prompt picker reads (`extensions/history/selector-helpers.ts`
  `editorOverlayMargin`). Pi re-reads `width` and `margin` on every render pass, so both are
  getters over the live terminal.

Limits accepted by this design (documented in the README): the scroll route uses
runtime internals that Pi does not declare as public API, so it is guarded and falls
back to a notice instead of throwing.

## Log

- **L1** (user, verbatim): «quiero crear un plugin para gentle-shell estilo el comando que
  tiene opencode /timeline que lo que hace es mostrar en un modal el listado de todos los
  prompts que le he escrito al modelo en la sesión en la que se encuentra y si doy clic o
  enter en alguno, me lleve directamente a ese punto en la sesión, se entiende? para ello te
  comparto el link de gentle-shell de github para que investigues cómo es que se crean estos
  plugins para gentle-shell: https://github.com/Gentleman-Programming/gentle-shell»
- **L2** (user, verbatim): «acá hay un ejemplo de un plugin que hizo alguien para
  gentle-shell: https://github.com/facundomv01/pi-qwencloud-quota#readme»
- **L7** (user, verbatim): «aparece así [Image#1] a la derecha se ve cortado, deberías de mover
  el indicador de cantidad de prompts y a la lista ponerle padding»
- **L6** (user, verbatim): «podemos hacer que el modal se centre en la salida del modelo y
  que no pise las cards de la derecha, se entiende?»
- **L5** (user, verbatim): «podemos hacer que el modal de timeline tenga el estilo que el
  usuario tenga seleccionado en customization de gentle-shell? así como los recuadros que
  se ven a la derecha»
- **L3** (user, verbatim): «funciona, acabo de probarlo, pero necesito que borres el clone y
  muevas timeline dentro de gentle-shell»
- **L4** (user, decision): destino final elegido entre las opciones ofrecidas —
  `plugins/gentle-shell/timeline`; el clon de referencia de `gentle-shell` se borró entero.
