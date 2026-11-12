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
