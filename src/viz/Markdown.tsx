/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// Markdown as the basic catalog's Text and a Report's section draw it: markdown-it with HTML off and links kept plain
// (nothing an agent writes executes). The rendered tree is built from markdown-it's tokens into React
// elements, never through innerHTML. A chat's answer draws its code blocks with a
// button that copies the code; a link opens only for http, https or mailto, with rel="noopener noreferrer", so a
// javascript: or data: link draws as its words.
import MarkdownIt from 'markdown-it';
import type Token from 'markdown-it/lib/token.mjs';
import { createElement, Fragment, useState, type ReactNode } from 'react';

const md = new MarkdownIt({ html: false, linkify: false, typographer: false });
const TAGS: Record<string, string> = {
  paragraph: 'p', heading: 'h', bullet_list: 'ul', ordered_list: 'ol', list_item: 'li', strong: 'strong', em: 'em', s: 's',
  blockquote: 'blockquote', code_inline: 'code', link: 'a', table: 'table', thead: 'thead', tbody: 'tbody', tr: 'tr', th: 'th', td: 'td', hr: 'hr',
};

/** Markdown text as React elements; with {@code copy}, each code block carries a button that copies its code. */
export function Markdown({ markdown, copy = false }: { markdown: string; copy?: boolean }) {
  return createElement(Fragment, null, ...render(md.parse(String(markdown ?? ''), {}), copy));
}

/** A code block with a Copy button; the button says Copied for two seconds. */
function CodeBlock({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const run = () => {
    const clip = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clip) return;
    void clip.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }, () => undefined);
  };
  return createElement('div', { className: 'as-code' },
    createElement('button', { type: 'button', className: 'bma-btn as-code-copy', onClick: run, 'aria-label': 'Copy the code' }, copied ? 'Copied' : 'Copy'),
    createElement('pre', null, createElement('code', null, code)));
}

function render(tokens: Token[], copy = false): ReactNode[] {
  const out: ReactNode[] = [];
  const stack: { tag: string; children: ReactNode[]; attrs: Record<string, string> }[] = [];
  const push = (node: ReactNode) => (stack.length ? stack[stack.length - 1].children : out).push(node);
  let key = 0;
  for (const t of tokens) {
    if (t.type === 'inline' && t.children) { for (const n of render(t.children)) push(n); continue; }
    if (t.type === 'text') { push(t.content); continue; }
    if (t.type === 'softbreak' || t.type === 'hardbreak') { push(createElement('br', { key: key++ })); continue; }
    if (t.type === 'code_block' || t.type === 'fence') { push(copy ? createElement(CodeBlock, { key: key++, code: t.content }) : createElement('pre', { key: key++ }, createElement('code', null, t.content))); continue; }
    if (t.type === 'image') { push(createElement('span', { key: key++, className: 'bma-md-image' }, t.content || '(image)')); continue; }
    if (t.nesting === 1) {
      const base = t.type.replace(/_open$/, '');
      const tag = base === 'heading' ? t.tag : (TAGS[base] ?? 'span');
      const attrs: Record<string, string> = {};
      if (base === 'link') { const href = t.attrGet('href') ?? ''; if (/^(https?:|mailto:)/i.test(href)) { attrs.href = href; attrs.rel = 'noopener noreferrer'; attrs.target = '_blank'; } }
      stack.push({ tag, children: [], attrs });
    } else if (t.nesting === -1) {
      const top = stack.pop();
      if (top) push(createElement(top.tag, { key: key++, ...top.attrs }, ...top.children));
    } else if (t.type === 'hr') {
      push(createElement('hr', { key: key++ }));
    }
  }
  while (stack.length) { const top = stack.pop()!; push(createElement(top.tag, { key: key++ }, ...top.children)); }
  return out;
}
