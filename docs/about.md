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
- `Pages` draws a Publish's `navigation` as tabs or a rail, with the current page in the URL fragment, or its `layout` as whole surfaces in the panes of a split.
- `CommandPalette` offers the title bars' actions and the menus' items on Ctrl or Cmd and K.

## View state

Split sizes, collapsed panes, the open menu and the current page stay in the browser. Split sizes are kept in `localStorage` under `agentspaces-split:<surface>/<persist>`. Nothing of the view reaches the fabric.

## The checks

- `tools/generate.mjs --check`: the generated files match the catalogs, and every drawn component has its implementation.
- `tools/import-check.mjs`: no file imports a platform module.
- `npm test`: the conformance of every golden surface, the keyboard tests of the split, the menu, the title bar, the palette and the pages, and the quick start.
- `npm run axe`: axe-core over the gallery in light and dark mode, with no serious or critical finding allowed.

## The build

`dist/index.js` leaves React, web_core, markdown-it, zod, MapLibre and deck.gl to the page, and loads the map adapter as a chunk of its own. `dist/elements.js` holds the custom elements alone. `dist/gallery.html` is the gallery page.

A page that bundles this package without MapLibre and deck.gl marks them external and keeps code splitting on (`--splitting --external:maplibre-gl --external:@deck.gl/*` in esbuild), so only the map's chunk names them. Without splitting, a bundler hoists the map's imports into the page's own bundle, and the page fails to load.
