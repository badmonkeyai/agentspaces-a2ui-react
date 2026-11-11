/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// Builds the package: the library (dist/index.js, React, web_core, markdown-it, zod, MapLibre and deck.gl the page's,
// the map adapter a chunk of its own loaded on first use), the elements alone for a page without React
// (dist/elements.js), the stylesheet (dist/a2ui-react.css), and the gallery page (dist/gallery.html, self-contained).
import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

mkdirSync('dist', { recursive: true });
const version = JSON.parse(readFileSync('package.json', 'utf8')).version;
const banner = { js: `/* @agentspaces/a2ui-react ${version}, Apache-2.0; built by build.mjs. */` };
const common = { bundle: true, format: 'esm', target: 'es2022', platform: 'browser', jsx: 'automatic', logLevel: 'warning', banner, legalComments: 'none',
  define: { 'process.env.NODE_ENV': '"production"' }, minify: true, sourcemap: false };
const peers = ['react', 'react-dom', 'react/jsx-runtime', 'react-dom/client', '@a2ui/react', '@a2ui/react/*', '@a2ui/web_core', '@a2ui/web_core/*', 'markdown-it', 'markdown-it/*', 'zod', 'maplibre-gl', '@deck.gl/*'];
await build({ ...common, entryPoints: ['src/index.ts'], outdir: 'dist', splitting: true, chunkNames: 'chunks/[name]-[hash]', external: peers });
await build({ ...common, entryPoints: { elements: 'src/elements/index.ts' }, outdir: 'dist' });
await build({ ...common, entryPoints: { gallery: 'src/gallery/main.tsx' }, outdir: 'dist', splitting: true, chunkNames: 'chunks/[name]-[hash]', external: [] });
copyFileSync('src/a2ui-react.css', 'dist/a2ui-react.css');
copyFileSync('gallery.html', 'dist/gallery.html');
const gz = f => gzipSync(readFileSync('dist/' + f)).length;
const report = { version, library: { bytes: readFileSync('dist/index.js').length, gzip: gz('index.js') }, elements: { gzip: gz('elements.js') }, css: { gzip: gz('a2ui-react.css') } };
writeFileSync('dist/size.json', JSON.stringify(report, null, 2) + '\n');
console.log(`built dist/index.js (${report.library.gzip} B gzipped), dist/elements.js, dist/a2ui-react.css, dist/gallery.html`);
