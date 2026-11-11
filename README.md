# @agentspaces/a2ui-react

**The open React renderer of the AgentSpaces A2UI catalogs**, from Bad Monkey AI. It draws [A2UI](https://a2ui.org) v0.9.1 surfaces over the basic catalog and the two open catalogs of [agentspaces-a2ui](https://github.com/badmonkeyai/agentspaces-a2ui), `agentspaces-viz` and `agentspaces-widgets`: charts, tables, maps, a chat, a file tree, and the frame of a page (a title bar, menus, and panel splits). It also ships the split and the tree as custom elements for a page without React. It is for web developers who draw the surfaces their agents write.

## Quick start: draw a title bar over a split

A page hands `Surfaces` the envelopes an agent wrote, in order, and receives each action a person takes. The page here draws a refund desk: a title bar with a Refresh button over two panes. The test `test/quickstart.test.mjs` draws the same envelopes and presses the button.

**1. Add the package** beside React and its peers, in an empty folder:

```bash
npm init -y
npm install @agentspaces/a2ui-react@0.6.0 react react-dom @a2ui/react@0.15.0 @a2ui/web_core@0.15.0 markdown-it@14 zod@3 esbuild
```

**2. Write the page** as `page.js`:

```js
import { createElement as h, Fragment } from 'react';
import { createRoot } from 'react-dom/client';
import { Surfaces, CommandPalette } from '@agentspaces/a2ui-react';
import '@agentspaces/a2ui-react/style.css';

const envelopes = [
  { version: 'v0.9.1', createSurface: { surfaceId: 'desk', catalogId: 'agentspaces-viz' } },
  { version: 'v0.9.1', updateComponents: { surfaceId: 'desk', components: [
    { id: 'root', component: 'Column', children: ['bar', 'main'] },
    { id: 'bar', component: 'TitleBar', title: 'Refund desk', status: { from: '/working' },
      actions: [{ id: 'refresh', label: 'Refresh', action: { name: 'refresh' } }] },
    { id: 'main', component: 'Split', persist: 'desk', panes: [
      { id: 'left', child: 'open', size: 0.4, label: 'Open' }, { id: 'right', child: 'note', size: 0.6, collapsible: true, label: 'Note' }] },
    { id: 'open', component: 'Stat', label: 'Open refunds', value: '/open' },
    { id: 'note', component: 'Prose', text: '/note' },
  ] } },
  { version: 'v0.9.1', updateDataModel: { surfaceId: 'desk', path: '/', value: { open: 3, note: 'Three refunds **wait** for you.', working: [] } } },
];
const onAction = a => console.log('action', a.name, 'from', a.sourceComponentId);
createRoot(document.getElementById('app')).render(h(Fragment, null,
  h(Surfaces, { envelopes, onAction }),
  h(CommandPalette)));
```

**3. Write `index.html`** beside it:

```html
<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><title>Refund desk</title><link rel="stylesheet" href="out/page.css"></head>
<body><div id="app"></div><script type="module" src="out/page.js"></script></body>
</html>
```

**4. Bundle and serve it.** The map's libraries are optional peers, so the bundle leaves them out:

```bash
npx esbuild page.js --bundle --format=esm --splitting --outdir=out --external:maplibre-gl '--external:@deck.gl/*' --servedir=. --serve=127.0.0.1:8000
```

**5. See it** at `http://127.0.0.1:8000`. The page shows "Refund desk" with the status "Ready", and "Open refunds 3" beside the note. A press on Refresh, or Ctrl+K then Enter on "Refresh", prints `action refresh from bar` in the browser console. A person drags the separator, or moves it with the arrow keys, and the browser keeps the sizes under `desk`.

## What it is

- `Surfaces`: the renderer of a list of envelopes over the A2UI basic catalog, `agentspaces-viz`, and `agentspaces-widgets`; `registerComponents` and `registerAlias` let a host add its own catalogs.
- The frame of a page: `TitleBar`, `Menu` and `Split` (the WAI-ARIA Menu Button, Menu and Window Splitter patterns), `Pages` for a Publish's `navigation` and `layout`, and `CommandPalette` on Ctrl or Cmd and K.
- The application components: `Chat` (progress, safe Markdown answers, attachment and citation chips, retry, stop, feedback), `FileTree` (the WAI-ARIA Tree View keyboard, badges, upload, a context menu) and `FilePreview` (text, Markdown, CSV, PNG, JPEG, and PDF in a sandboxed frame).
- `<agentspaces-split>` and `<agentspaces-tree>` in `./elements`, the look and feel as CSS variables, and `Gallery`, every golden surface with its code.

## Add it to your build

```bash
npm install @agentspaces/a2ui-react@0.6.0
```

The peers are React 18 or 19, `@a2ui/react` and `@a2ui/web_core` 0.15.0, `markdown-it` 14, and `zod` 3. A page with a `Map` adds `maplibre-gl` 6 and the four `@deck.gl` 9 packages; a page without one marks them external, as the quick start does. [About the renderer](docs/about.md) lists what it draws and what it leaves to a host, and [Building](docs/building.md) builds from a clone.

## Where to read next

1. **[The A2UI guide](https://www.badmonkey.ai/agentspaces/a2ui-guide.html)**: how an agent draws a page for people through its group, and where this renderer fits.
2. **[agentspaces-a2ui](https://github.com/badmonkeyai/agentspaces-a2ui)**: the Java records and pen, the two open catalogs this package draws, and the golden surfaces and vectors its tests check.
3. **[The A2UI specification](https://a2ui.org)**: the envelopes and the basic catalog.
4. **[The documents](docs/README.md)**: everything this README leaves out, one topic per document.

## License

Apache License 2.0, Copyright 2026 Bad Monkey, Inc. See [LICENSE](LICENSE) and [NOTICE](NOTICE). Contributions are welcome under the Developer Certificate of Origin; see [CONTRIBUTING.md](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md). Report a vulnerability privately, as [SECURITY.md](SECURITY.md) describes. [Releasing](docs/releasing.md) has the release steps, and [CHANGELOG.md](CHANGELOG.md) what each release changed.
