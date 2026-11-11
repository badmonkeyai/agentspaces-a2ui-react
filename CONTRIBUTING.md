# Contributing to @agentspaces/a2ui-react

Thank you for your interest in contributing. `@agentspaces/a2ui-react` is an
Apache 2.0 project from Bad Monkey, Inc., and everything in this repository
stays Apache 2.0.

This repository holds the open React renderer of the AgentSpaces A2UI catalogs
`agentspaces-viz` and `agentspaces-widgets`, the custom elements it wraps
(`<agentspaces-split>` and `<agentspaces-tree>`), the look and feel as CSS
variables, and the gallery. The catalogs themselves, their golden surfaces, and
the records an agent writes live in
[agentspaces-a2ui](https://github.com/badmonkeyai/agentspaces-a2ui).

## Before you start

- **Questions and ideas** are welcome as [GitHub issues](https://github.com/badmonkeyai/agentspaces-a2ui-react/issues).
- **A change to a catalog** (a new component or property) starts in
  agentspaces-a2ui, since this package draws what that catalog declares.
- **Security issues** must not be filed as public issues. See
  [SECURITY.md](SECURITY.md) for private reporting.
- **Code of conduct:** by participating you agree to the
  [code of conduct](CODE_OF_CONDUCT.md).

## Install, build, and test

Clone this repository beside agentspaces-a2ui, because the generator reads
that repository's catalogs from `../agentspaces-a2ui`:

```bash
git clone https://github.com/badmonkeyai/agentspaces-a2ui.git
git clone https://github.com/badmonkeyai/agentspaces-a2ui-react.git
cd agentspaces-a2ui-react
npm ci
npm test                        # the generator check, the import check, the types, the bundles, and the tests
npm run axe                     # axe-core over the gallery in headless Chrome, light and dark
node tools/docs-lint.mjs .      # the README's shape and the docs index
```

Node 22 or newer. `npm run axe` needs Google Chrome. Set `CHROME` to its path
when it is not at the macOS default; without Chrome the script says so and
stops.

## The catalog generation

`tools/generate.mjs` reads four files of agentspaces-a2ui: the
`agentspaces-viz` and `agentspaces-widgets` catalogs, the look-and-feel schema,
and the golden surfaces. It writes `src/generated/`: the catalog ids and
component names, one TypeScript interface per component, the registry of
implementations, the golden surfaces, the look-and-feel type, and
`SOURCE.json` with the digest of every input and output.

- Run `npm run generate` after a catalog changes, and commit `src/generated/`
  with your change. Do not edit those files by hand.
- `npm run build` runs the generator with `--check`, so it fails when a
  generated file is stale, when a drawn component has no implementation, or
  when `src/components/viz` or `src/components/widgets` holds a file its
  catalog does not name.
- `HOSTED` in `tools/generate.mjs` lists the components a host still draws
  (`ApprovalCard` and `TimelineStrip`).

## How to add a component

1. Add the component to its catalog in agentspaces-a2ui, with its golden
   surfaces in four states (full, empty, loading, and error), and merge it
   there first.
2. Run `npm run generate` here. The check now fails until the component has its
   implementation.
3. Write `src/components/viz/<Name>.tsx` or `src/components/widgets/<Name>.tsx`
   with `define<Props>('<Name>', ...)`, reading its props from
   `src/generated/props.ts`. Draw untrusted text as text, and follow the rules
   below.
4. Add its styles to `src/a2ui-react.css` with the existing CSS variables, so
   it follows the look in light and dark mode.
5. Add a test under `test/` that draws its golden surfaces and drives its
   keyboard pattern, then run `npm test` and `npm run axe`.

## The rules a change must keep

- **Nothing a surface carries executes.** Text draws as text. Markdown goes
  through markdown-it with HTML off and builds React elements from its tokens,
  never through `innerHTML`. A link opens only for `http`, `https`, or
  `mailto`. A file preview draws HTML and SVG as their text.
- **The open side stays open.** No file of `src/` imports a closed module;
  `tools/import-check.mjs` fails the build if one does. Custom elements start
  with `agentspaces-`.
- **Keyboard and screen reader first.** Each interactive component follows its
  WAI-ARIA pattern, and the axe run allows no serious or critical finding.
- **View state stays in the browser.** Split sizes, open menus and the current
  page live in the page and `localStorage`, and never reach an agent's space.
- **Peers stay peers.** React, `@a2ui/react`, `@a2ui/web_core`, markdown-it,
  zod, MapLibre and deck.gl stay out of `dist/index.js`, and the map's code
  loads as a chunk of its own.

## Pull requests

Open an issue first for anything beyond a fix. Keep the change small, add the
test that fails without it, and sign off your commits (DCO). CI runs the docs
lint, the build and tests, the axe run, a dry run of the package, and a
dependency scan on every push and pull request.
