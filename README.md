<div align="center">

# gentle-timeline

<a href="https://github.com/Gentleman-Programming/gentle-ai">
  <img width="220" src="https://raw.githubusercontent.com/Gentleman-Programming/gentle-ai/main/docs/assets/brand/built-with-gentle-ai.png" alt="Built with Gentle-AI" />
</a>

**Extensión de [Pi](https://github.com/earendil-works/pi) / [gentle-shell](https://github.com/Gentleman-Programming/gentle-shell) que agrega `/timeline`: el listado de todos los prompts de la sesión actual, y un Enter para volver a ese punto de la conversación.**

</div>

---

## Capturas

El modal se dibuja como un card nativo del shell, con tu tema y tu estilo de card (`float` o `neon`):

```
 ▎
 ▎  ▾ TIMELINE                                                    5/5 prompts
 ▎
 ▎    ›  5 15:40 perfecto, funciona. ahora, podemos hacer que el modal…
 ▎       4 15:23 podemos hacer que el modal de timeline tenga el estilo…
 ▎       3 15:02 funciona, acabo de probarlo, pero necesito que borres…
 ▎       2 14:36 acá hay un ejemplo de un plugin que hizo alguien para…
 ▎       1 14:30 quiero crear un plugin para gentle-shell estilo el comando…
 ▎    type to filter · ↵ jump · esc close
 ▎
```

## Qué hace

| Acción | Tecla | Qué pasa |
|---|---|---|
| Abrir el listado | `/timeline` | Modal con **todos los prompts** que le escribiste al modelo en esta sesión, en orden |
| Saltar a un prompt | `Enter` o **clic** | Cierra el modal y lleva el transcript a ese prompt, que queda en la primera línea visible |
| Moverte por la lista | `↑` `↓`, `PageUp`/`PageDown`, `Home`/`End`, rueda del mouse | Cambia la fila seleccionada; la ventana sigue a la selección |
| Filtrar | escribí | Filtra por cualquier texto del prompt; `Backspace` edita, `ctrl+u` limpia |
| Cerrar | `Esc` | Sale sin mover nada |
| Diagnóstico | `/timeline debug` | Reporta en vivo el mecanismo del salto (`scrollView`, `contentLines`, `messageRows`, `markers`, `railColumns`) |

Además:

- **Card nativo, no un look propio.** Respeta el tema activo y el estilo de card que elegiste en Gentle → Customize: `float` (bloque tintado con la barra de acento `▎`) o `neon` (marco redondeado `╭─ ▾ TIMELINE ────╮`).
- **No pisa las cards de la derecha.** El overlay se sienta sobre la columna de la conversación usando las columnas que la rail publica en el terminal, y se reacomoda si redimensionás.
- **Solo turnos tuyos.** Resultados de tools, resúmenes de compactación, entradas custom y prompts vacíos quedan afuera, así que la lista coincide con lo que el transcript muestra como tus palabras.
- **No guarda nada.** Lee la sesión viva: funciona con el prompt-history capture apagado, sin archivos nuevos, sin red.
- **Falla avisando.** Sin transcript, sin fila ubicable o sin modo fullscreen, avisa en vez de scrollear a cualquier lado.

## Instalación

### Opción 1: desde npm (recomendada)

```bash
pi install npm:gentle-timeline
```

### Opción 2: desde este repositorio

```bash
git clone https://github.com/LeninGR/gentle-timeline.git
pi install ./gentle-timeline
```

### Opción 3: probarla sin cambiar tu configuración

```bash
pi -e ./gentle-timeline
```

### Opción 4: agregarla a tu `settings.json`

```json
{ "packages": ["npm:gentle-timeline"] }
```

Para desarrollo, como extensión suelta: `ln -s "$PWD" ~/.gentle-shell/agent/extensions/gentle-timeline` desde adentro del checkout. Pi descubre `<agent home>/extensions/<nombre>/index.ts` al arrancar, así que `/reload` alcanza después de cada cambio.

El paquete declara su entrada con el manifiesto `pi.extensions` de `package.json` (`./index.ts`), así que Pi lo carga como una extensión normal. **No tiene dependencias de runtime**: Pi lo carga con jiti y todos los tipos de Pi son shims estructurales locales, no hay nada que instalar.

> **Requisitos**: Node.js ≥ 22.18 (Pi ya lo exige) y modo **fullscreen** para el salto, que es donde el shell tiene transcript scrolleable.

## Uso

### El comando `/timeline`

Abre el modal. El contador de arriba a la derecha dice cuántos prompts entran de los que hay (`5/5`, o `2/5` si estás filtrando), y el pie recuerda las teclas.

### El salto

`Enter` o clic aplican el salto **después** de cerrar el modal, así que lo que ves en el siguiente frame ya es el transcript movido: el prompt elegido queda en la primera línea visible. Si después querés volver al final, `ctrl+end` (o la rueda) te devuelve.

### `/timeline debug`

Una pantalla con lo que el plugin mide en vivo del shell:

| Campo | Qué significa |
|---|---|
| `scrollView` | El shell expone la vista scrolleable del transcript |
| `contentLines` | Líneas renderizadas del transcript completo |
| `messageRows` | Mensajes que el layout actual puede anclar por `id` |
| `markers` | Marcadores OSC 133 de inicio de mensaje |
| `railColumns` | Columnas que la rail de la derecha está ocupando (+1 de aire) |

Es la forma de saber en un toque qué eslabón se movió después de una actualización de Pi.

## Configuración

No hay variables propias: el plugin sigue lo que ya configuraste en el shell.

| Qué | Dónde | Valores |
|---|---|---|
| Estilo de card | `<gentle config home>/card-style.json` | `"float"` (default) o `"neon"` |
| Config home | `GENTLE_SHELL_PREFIX` → `GENTLE_PI_CONFIG_HOME` → `GENTLE_SHELL_CONFIG_HOME` → `~/.pi/gentle-ai` | Mismo orden de precedencia que usa el shell |
| Tema | El activo en el shell | Roles `accent`, `text`, `muted`, `dim`, `border` y el fondo del tono |
| Ancho de la lista | El ancho del overlay | 76% de la columna de la conversación, mínimo 56 columnas |
| Filas visibles | Fijo | 14 por ventana; el resto se pagina con `PageUp`/`PageDown` |

Un `card-style.json` ausente, ilegible o malformado se lee como `float`, exactamente igual que el shell. Si el tema no puede pintar fondo, o la terminal baja de 10 columnas, el card cae al marco `neon` en vez de dibujar medio card.

## Cómo funciona el salto

La mitad "listar" usa solo API documentada: `pi.registerCommand`, `ctx.sessionManager.getBranch()` y `ctx.ui.custom()` para el overlay.

La mitad "saltar" **no tiene API pública**: el contrato de extensiones de Pi no expone ninguna forma de scrollear la conversación. El plugin usa el mismo mecanismo que la navegación de prompts del propio Pi (`ctrl+shift+up`), alcanzado a través del objeto `tui` que `ctx.ui.custom()` le entrega a un overlay:

1. `tui.getPrimaryScrollView()` → la vista scrolleable del transcript.
2. El frame de layout del último render → la fila donde empieza el componente del mensaje elegido, mapeado por el `entry.id` de la sesión que Pi guarda como `messageId` del componente.
3. Si la entrada no está en el frame actual, un fallback alinea el texto renderizado de los prompts con los bloques de mensaje, en orden.
4. `scrollView.scrollTo(fila, { disableFollow: true })`.

Para el centrado, el overlay usa el estado que gentle-shell publica en el terminal (`Symbol.for("gentle-pi.experimental-sidebar.state")`) como margen derecho vivo, que es el mismo canal que lee su propio selector de prompts.

## Límites y degradación

- **El salto depende de interioridades de Pi.** Es el único camino que existe hoy; no es API declarada. Por eso cada acceso va guardado y `/timeline debug` existe.
- **Solo fullscreen.** En modo terminal normal el plugin avisa que el transcript no se puede scrollear, en vez de fallar.
- **Nunca lanza.** Sin prompts, sin TUI, sin transcript o con una fila que no se puede ubicar, la respuesta es un aviso: un handler jamás rompe la sesión.
- **Preferimos no mover a mover mal.** Si no puede ubicar el prompt elegido, no scrollea: lo dice.
- **Nada se escribe al disco.** Ni prompts, ni estado, ni caché. Lo único que se lee es la preferencia de estilo del shell.

## Desarrollo

```bash
npm test         # node --test con TypeScript directo, sin build
npm run typecheck
```

48 tests cubren las especificaciones de punta a punta con tema, keybindings y `tui` falsos: extracción de prompts, resolución de fila y scroll, el modal (teclado, filtro, mouse, ventana, ancho), el chrome de los dos estilos con su fallback, y el seating respecto de la rail. Nada toca una terminal real.

El documento de la feature, con las specs verbatim y el registro de decisiones, está en [`odd/tasks/timeline-plugin.md`](https://github.com/LeninGR/gentle-timeline/blob/main/odd/tasks/timeline-plugin.md).

## Licencia

MIT
