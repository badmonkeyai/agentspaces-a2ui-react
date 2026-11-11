/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Report: a document of sections; text is Markdown (no HTML), a chart, table, graph, or map section carries the
// component it draws as `component` (drawn by that implementation through the same surface); exported as Markdown (a
// download) or printed to PDF (the browser's print, the tools hidden).
import { define } from '../../renderer/implementation';
import type { ReportProps } from '../../generated/props';
import { Markdown } from '../../viz/Markdown';

export const Report = define<ReportProps>('Report', ({ props, ctx }) => {
  const sections = props.sections ?? [];
  const exports = props.export ?? ['markdown', 'pdf'];
  const markdown = () => `# ${props.title}\n\n` + sections.map(s => `## ${s.heading ?? ''}\n\n${s.kind === 'text' ? String(s.text ?? '') : `_(${s.kind})_`}\n`).join('\n');
  const download = () => {
    if (typeof document === 'undefined' || typeof URL === 'undefined' || !('createObjectURL' in URL)) return;
    const url = URL.createObjectURL(new Blob([markdown()], { type: 'text/markdown' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: `${String(props.title ?? 'report').replace(/[^\w-]+/g, '-')}.md` });
    a.click();
    URL.revokeObjectURL(url);
    ctx.dispatch('export', { format: 'markdown' });
  };
  return (
    <article className="bma-report" data-component="Report">
      <div className="bma-report-tools">
        {exports.includes('markdown') ? <button type="button" className="bma-btn" onClick={download}>Export Markdown</button> : null}
        {exports.includes('pdf') ? <button type="button" className="bma-btn" onClick={() => { if (typeof window !== 'undefined' && typeof window.print === 'function') window.print(); ctx.dispatch('export', { format: 'pdf' }); }}>Print to PDF</button> : null}
      </div>
      <h1>{String(props.title ?? '')}</h1>
      {sections.map((s, i) => (
        <section key={i} data-kind={s.kind}>
          {s.heading ? <h2>{String(s.heading)}</h2> : null}
          {s.kind === 'text' ? <Markdown markdown={String(s.text ?? '')} /> : s.component && typeof s.component === 'object' && 'id' in s.component ? ctx.child(String((s.component as { id: unknown }).id)) : <p className="bma-muted bma-small">({s.kind} section: names a component by id)</p>}
        </section>
      ))}
    </article>
  );
});
