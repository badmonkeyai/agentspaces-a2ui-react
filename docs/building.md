# Building

Written for: contributors who build this repository.

Clone this repository beside [agentspaces-a2ui](https://github.com/badmonkeyai/agentspaces-a2ui), since the generator reads that repository's catalogs:

```bash
git clone https://github.com/badmonkeyai/agentspaces-a2ui.git
git clone https://github.com/badmonkeyai/agentspaces-a2ui-react.git
cd agentspaces-a2ui-react
npm ci
npm test                        # the build, then 90 tests
npm run axe                     # axe-core over the gallery in headless Chrome, light and dark
node tools/docs-lint.mjs .      # the README's shape and this folder's index
npm pack --dry-run              # the files the package ships
```

Node 22 or newer. `npm run axe` needs Google Chrome; set `CHROME` to its path when it is not at the macOS default, and the script skips with a note when it finds none.

## What the build runs

1. `node tools/generate.mjs --check` regenerates `src/generated/` in memory from `../agentspaces-a2ui` and fails when a file differs, when a drawn component has no implementation, or when a folder holds a component its catalog does not name.
2. `node tools/import-check.mjs` fails when a file of `src/` imports a closed module.
3. `tsc` writes the type declarations to `dist/types/`.
4. `build.mjs` writes `dist/index.js`, `dist/elements.js`, `dist/a2ui-react.css`, `dist/gallery.html` and `dist/size.json`.

## What the tests pin

- `conformance.test.mjs` draws every golden surface of `agentspaces-a2ui` and checks the text a person must find.
- `split`, `menu`, `tree`, `frame`, `pages` and `chat` test the WAI-ARIA keyboard patterns, view state, and the chat's progress, retry and safe Markdown.
- `preview.test.mjs` checks that HTML and SVG draw as text and that a PDF draws in a frame with no permission.
- `quickstart.test.mjs` draws the README's envelopes and presses its button.

## When the catalogs change

Run `npm run generate` after a change in `agentspaces-a2ui`'s catalogs, golden surfaces, or look-and-feel schema, and commit `src/generated/` with the change. CI checks out `agentspaces-a2ui`'s `main` beside this repository, so a catalog change there fails this build until the generated files follow it.

## Source files

The TypeScript sources, the tools, `build.mjs`, and the workflows carry the Apache 2.0 header, and the generated files say which tool wrote them. The tests and the stylesheet carry no header yet; `LICENSE` covers every file.
