#!/usr/bin/env node
/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// The open renderer's import check, a guard against drift: no file of src/ imports a platform module
// (@badmonkey/*, or a bma- package), so the open package never depends on a closed one.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const problems = [];
const walk = dir => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(ts|tsx|js|mjs)$/.test(f)) check(p); } };
const check = p => {
  const text = readFileSync(p, 'utf8');
  for (const m of text.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)['"]([^'"]+)['"]/g)) {
    if (/^@badmonkey\//.test(m[1]) || /(^|\/)bma-/.test(m[1])) problems.push(`${p}: imports ${m[1]}, a platform module`);
  }
};
walk(new URL('../src', import.meta.url).pathname);
if (problems.length) { console.error(problems.join('\n')); process.exit(1); }
console.log('import-check: no platform import in src/');
