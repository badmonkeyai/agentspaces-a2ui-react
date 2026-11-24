# About the renderer

Written for: developers who draw A2UI surfaces with this package, and hosts that add their own catalogs.

## What it draws

The catalogs come from [agentspaces-a2ui](https://github.com/badmonkeyai/agentspaces-a2ui), the Java library whose records and `Surfaces` pen an agent writes with. `tools/generate.mjs` reads its `agentspaces-viz` and `agentspaces-widgets` catalogs, its look-and-feel schema, and its golden surfaces, and the build fails when this package's generated files no longer match them.

- The A2UI basic catalog, through `@a2ui/react` and `@a2ui/web_core`.
- Every component of `agentspaces-viz`: Chart, DataTable, Map, Graph, Timeline, Report, Notification, Form, Stat, Window, Conversation, Notice, Toolbar, KeyValue, Prose, TitleBar, Menu and Split.
- `Chat`, `FileTree` and `FilePreview` of `agentspaces-widgets`, with the old names `Conversation`, `ChatInput` and `FileShare` drawn as their aliases through 0.6.x.
- The components a host still draws are listed in `HOSTED`: `ApprovalCard` and `TimelineStrip`, which read a platform's own approvals and events.

A host adds its own catalog with `registerComponents(catalogId, implementations)`, and lets an old catalog id draw another catalog's components with `registerAlias(catalogId, [otherIds])`.

## The frame of a page

- `TitleBar` draws the app's name and status from `WorkingOn` rows in the A2A task words. The first `TitleBar` on a page claims the page's bar through `FrameContext`, so a page that provides `useFrameProvider(tools)` draws one bar.
- `Menu` follows the WAI-ARIA Menu Button and Menu patterns. `MenuView` is the popup alone, for a component with a menu of its own.
- `Split` wraps `<agentspaces-split>`, the WAI-ARIA Window Splitter. The arrows move a separator by 5 percent (1 with Shift), Home and End go to the limits, and Enter collapses a pane to its rail.
- `Pages` draws a Publish's `navigation` as tabs or a rail, with the current page in the URL fragment, or its `layout` as whole surfaces in the panes of a split. A conversation layout's `banner` draws as one line of plain text at the very top of the page and again at its foot; a screen reader reads it once, at the top, as a note.
- `CommandPalette` offers the title bars' actions and the menus' items on Ctrl or Cmd and K.

## Follow-ups, thumbs and a lit path

- **Follow-ups.** A `Chat` whose `suggestions` is a binding draws the rows the agent writes there (`{text, label, line}` or a string). A chip with a `line` draws only while that line is the newest line of the thread, so it hides when the person sends a line and the next answer brings its own; a row with no `line` always draws. At most 8 chips draw, and a tap sends the row's whole `text`, whatever the chip shows.
- **Thumbs.** The `feedback` control is a thumbs up "Helpful" and a thumbs down "Not helpful", each with `aria-pressed`. The chat keeps the choice per line while the page is open, and sends `chat.feedback` again only when the person changes it.
- **A lit path.** Rows with `lit: true` light a path: in `Graph` exactly the lit edges (and those a person hovers or focuses), in `GraphView` the lit nodes as selected and the lit edges in the accent. A lit row's accessible text adds ", on the path".
- **A row button's words.** A `DataTable` row button reads `rowActionLabel` and is named with the row's first column.
- **Text into an action.** A basic `TextField` bound to a path and a `Button` whose action context reads the same path send what the person typed with the press, so a page needs no form for a one-field box.

## Actions and agent functions

- **Actions.** `Surfaces` hands every action a person takes to `onAction`, in A2UI 1.0's shape. The host posts it back to the agent that draws the surface.
- **Agent functions.** An action may call one of the drawing agent's functions: 1.0's `{"functionCall": {"@call": name, "args": {...}}}`, with a name the catalogs do not run and no `catalogId`.
  - On a press, the renderer resolves the arguments against the data model. It hands 1.0's `callAgentFunction` (`{version, callAgentFunction: {surfaceId, functionCallId, callFunction}}`) to `onFunctionCall`, and the host sends it.
  - The agent's `agentFunctionResponse` arrives among the envelopes. web_core matches it to the call by its `functionCallId`. An answer to no call of this page settles nothing.
  - `onFunctionResult` hears what came of each call: `{surfaceId, functionCallId, function, value}`, or `error` with a `code` and a `message`.
  - A call with no answer within `functionTimeoutMs` (`AGENT_FUNCTION_TIMEOUT_MS`, 30 s) ends with the code `TIMEOUT`, and `onProblem` reports it.
  - A call the host does not send ends at once with `SEND_FAILED`: the host returns `false` or rejects, or the page has no `onFunctionCall`.
  - A component calls a function itself with `ctx.call(fn, args)`, which resolves with the answer. A host may take only a function some component action of the surface names as a `functionCall`, so the agent says which of its functions a page may call. A call to any other is refused before it reaches the agent, and the component sees `SEND_FAILED`. So a surface whose custom component calls `tideAt` also draws an action that names `tideAt`, such as a button.
  - The renderer keeps its processor through React's StrictMode, which runs each effect's cleanup and setup twice in a development build. Calls still waiting when `Surfaces` unmounts end with `CANCELLED`.
- **Why a call becomes an event inside the renderer.** web_core runs a `functionCall` itself and knows only the catalogs' functions. So `withAgentCalls` rewrites such an action, as its envelope arrives, into an event whose name only this renderer makes. web_core then resolves the event's context on the press as it does for any action.

## Hiding a map's layer chips

A `GeoMap` with a `legendToggle` option draws a button that shows or hides the legend's layer chips, each layer's swatch, name and count, so a map of many layers keeps its foot clear.

- **The option.** `legendToggle: {label, hidden}`, both optional. `label` is the button's words, 1 to 24 characters, default "Layers". `hidden: true` starts the chips hidden.
- **Where it draws.** In a GeoLayout, as the last item of the bar's menu, its label under the chart icon. Elsewhere, as the legend's first item.
- **What a person gets.** A toggle button, pressed while the chips show, that names the chips it controls. The choice is kept per page in the browser, and wins over `hidden` on the next visit. While the chips are hidden, the button says how many layers are turned off.
- **What stays.** The Picked group, Home, Table and the legend's notes. A chip still hides or shows its own layer, and the layer menu still agrees with it.

## Drawing an area on a map

A `GeoMap` with a `draw` option shows a draw control over the map. The renderer adds only the drawing; what an area means is the agent's.

- **The option.** `draw: {action, shapes, label, maxVertices}`. Only `action` is required. `shapes` defaults to circle and polygon, `label` (the button's words) to "Draw an area", and `maxVertices` (3 to 200) to 100.
- **A circle.** Press at the centre and drag, or click a second point. The radius shows in m or km while drawing.
- **A polygon.** Click each corner. A double-click, Enter, Finish, or a click on the first corner closes it. Backspace removes the last corner.
- **From the keyboard.** With the map focused, D opens the shapes on "Circle at the map's centre", which asks for the radius in a field.
- **The name.** A drawn shape asks for a name: required, 1 to 80 characters after trimming, plain text. Save sends it; Escape or Cancel at any point sends nothing.
- **What the action carries.** `{shape, name, geometry, center?, radiusMeters?}`.
  - `geometry` is a GeoJSON `Polygon` with one closed, counter-clockwise ring, every coordinate rounded to 6 decimals.
  - A circle travels as a 64-vertex ring plus its `center` and `radiusMeters`.
- **While drawing,** the map does not pan, and the shape shows as an overlay. After Save the overlay clears; the feature the agent publishes is what stays.
- **Text, never markup.** A name with `<b>` in it is shown as the characters `<b>`.
- **Where the map cannot draw** (no WebGL), there is no control.
- **The agent still checks.** Everything a browser sends is untrusted, so the agent validates every field of the action (types, sizes, ranges) before it keeps an area.

The pure parts (`drawSpec`, `drawStep`, `drawContext`, `circleRing`, `polygonRing`) are exported, so a host's or an agent's tests can build the same context without a map.

## What a bound path holds

Visualize, GraphView and the geo components read their rows or features from a path of the data model, and draw one of four states from what the path holds:

- **A list or a table:** the data, or the empty state when it holds none.
- **Nothing at all:** loading, said in words ("Loading the features…") and marked `aria-busy`. The renderer cannot tell data that has not arrived from data that never will.
- **Any other value:** an error that names the path ("Unavailable: the features at /ships do not read as a list.").

So a host writes a list for every bound path, an empty one when there is nothing yet, as soon as it knows. A path the host never writes, such as a misspelt one, stays loading for as long as the page is open.

## View state

Split sizes, collapsed panes, the open menu and the current page stay in the browser. Split sizes are kept in `localStorage` under `agentspaces-split:<surface>/<persist>`. Nothing of the view reaches the fabric.

## The checks

- `tools/generate.mjs --check`: the generated files match the catalogs, and every drawn component has its implementation.
- `tools/import-check.mjs`: no file imports a platform module.
- `npm test`: the conformance of every golden surface, the keyboard tests of the split, the menu, the title bar, the palette and the pages, agent function calls and their answers, and the quick start.
- `npm run axe`: axe-core over the gallery in light and dark mode, as drawn and with every menu open, with no finding of any impact allowed.
- `npm run perf`: the frame-rate probe in Chrome (GEO-Q-20 and GEO-G-03): a GeoMap of 10,000 points and 500 polygons, and a GraphView of 2,000 nodes and 5,000 edges, each panned for several seconds in a 2560 × 1440 window. It needs 30 frames shown per second, and a graph layout under 2 s.

## The build

`dist/index.js` leaves React, web_core, markdown-it, zod, MapLibre and deck.gl to the page, and loads the map adapter as a chunk of its own, and GraphView's WebGL drawing (past 500 nodes) as another. `dist/elements.js` holds the custom elements alone. `dist/gallery.html` is the gallery page.

A page that bundles this package without MapLibre and deck.gl marks them external and keeps code splitting on (`--splitting --external:maplibre-gl --external:@deck.gl/*` in esbuild), so only the map's chunk and the graph's name them. Without splitting, a bundler hoists the map's imports into the page's own bundle, and the page fails to load.
