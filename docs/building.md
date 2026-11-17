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
npm run perf                    # the frame-rate probe: a large map and graph panned in Chrome
node tools/docs-lint.mjs .      # the README's shape and this folder's index
npm pack --dry-run              # the files the package ships
```

Node 22 or newer. `npm run axe` and `npm run perf` need Google Chrome; set `CHROME` to its path when it is not at the macOS default, and the script skips with a note when it finds none.

## What the build runs

1. `node tools/generate.mjs --check` regenerates `src/generated/` in memory from `../agentspaces-a2ui` and fails when a file differs, when a drawn component has no implementation, or when a folder holds a component its catalog does not name.
2. `node tools/import-check.mjs` fails when a file of `src/` imports a closed module.
3. `tsc` writes the type declarations to `dist/types/`.
4. `build.mjs` writes `dist/index.js`, `dist/elements.js`, `dist/a2ui-react.css`, `dist/gallery.html` and `dist/size.json`.

## The frame-rate probe

`npm run perf` runs `tools/perf-probe.mjs`. It bundles a probe page from `src/`, opens it in Chrome in a 2560 × 1440 window, and measures three scenes:

- a GeoMap of 10,000 point features and 500 polygons, on the plain basemap;
- a GraphView of 2,000 nodes and 5,000 edges drawn with WebGL, panned, then zoomed in until the labels show and panned again;
- the same graph drawn as SVG, panned the same two ways, for comparison only.

The mouse is real input from the DevTools protocol, held and swept for six seconds. A move is sent about every 8 ms without waiting for each one, so the page gets a new place to draw on every frame and the input never limits the rate.

What it counts:

- **Content frames:** frames in which the drawing drew something new. A canvas frame counts when the page made a WebGL draw call in it; an SVG frame counts when the drawing's elements changed. A frame the page only ticked through does not count.
- **Frames shown:** the content frames, less the share the compositor dropped. The probe traces the compositor's record of each frame (presented, presented in part, dropped) while it pans.
- **Pointer moves:** the moves that reached the page, a second.

It prints these, the gap between content frames (95th percentile and worst), the graph's layout time and the WebGL renderer, and writes `dist/perf.json`. It exits 1 when a target is missed. The targets, while panning, are 30 frames shown a second, at least 30 pointer moves a second reaching the page, and a picture that moved. The graph's layout must take under 2 s.

After the WebGL graph's pans, the probe takes the graph's WebGL context away, as a browser does when a page holds too many, and checks that the view draws SVG.

- **Options:** `--seconds=N` sets the pan time, `--dpr=2` sets a Retina pixel ratio, and `--only=map,graph` picks the scenes.
- **Headless or not:** Chrome runs headless with Metal through ANGLE (`--use-angle=metal --enable-gpu --ignore-gpu-blocklist`). When the renderer it prints is SwiftShader, the numbers measure the CPU, not the GPU. `--headful` opens a real window off the screen instead.
- **Cleanup:** the probe stops its own Chrome by process id and removes its profile and its page directory, whatever step fails. It runs from any directory.

The reference machine for GEO-Q-20 is an Apple M-series laptop running Chrome.

## What the tests pin

- `conformance.test.mjs` draws every golden surface of `agentspaces-a2ui` and checks the text a person must find.
- `split`, `menu`, `tree`, `frame`, `pages` and `chat` test the WAI-ARIA keyboard patterns, view state, and the chat's progress, retry and safe Markdown.
- `preview.test.mjs` checks that HTML and SVG draw as text and that a PDF draws in a frame with no permission.
- `quickstart.test.mjs` draws the README's envelopes and presses its button.
- `graph-webgl.test.mjs` checks GraphView's switch to WebGL past 500 nodes, the canvas's name and keys, a press that finds its node by position, and the fallback to SVG. happy-dom has no WebGL, so the probe draws the real thing.

## When the catalogs change

Run `npm run generate` after a change in `agentspaces-a2ui`'s catalogs, golden surfaces, or look-and-feel schema, and commit `src/generated/` with the change. CI checks out `agentspaces-a2ui`'s `main` beside this repository, so a catalog change there fails this build until the generated files follow it.

## Source files

The TypeScript sources, the tools, `build.mjs`, and the workflows carry the Apache 2.0 header, and the generated files say which tool wrote them. The tests and the stylesheet carry no header yet; `LICENSE` covers every file.
