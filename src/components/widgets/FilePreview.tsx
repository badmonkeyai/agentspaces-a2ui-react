/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-widgets/FilePreview: one file drawn by its media type. The file
// is a literal SharedFile id or a path of the data model where a FileTree or a chat chip puts the person's choice; its
// row comes from `files`. Text and Markdown draw through Prose's safe Markdown (no raw HTML), CSV as a table of its
// first `csvRows` rows, PNG and JPEG as an image, PDF in a frame sandboxed with no permission, and HTML and SVG as their
// text, so the preview never runs a file's code. Above `maxBytes` (2 MiB unless the design says less, 16 MiB at most)
// it says the file is too large to preview and offers Download. The bytes come from the page's file source (the feed's
// file route, which serves them with the record's type and nosniff).
import { useEffect, useState } from 'react';
import { define, useData, type Ctx } from '../../renderer/implementation';
import type { FilePreviewProps } from '../../generated/props';
import { Markdown } from '../../viz/Markdown';
import { parseCsv, sizeText, type FileRow } from '../../files/files';

const KINDS = ['text/plain', 'text/markdown', 'text/csv', 'image/png', 'image/jpeg', 'application/pdf'];
const MAX = 16 * 1024 * 1024;
/** Types a browser would run or render as a document: always drawn as their text. */
const AS_TEXT = new Set(['text/html', 'application/xhtml+xml', 'image/svg+xml', 'text/xml', 'application/xml', 'text/javascript', 'application/javascript']);

const bare = (t: unknown) => String(t ?? '').split(';')[0].trim().toLowerCase();

/** How a file of this type draws: text, Markdown, a table, an image, a frame, its text as plain text, or no preview. */
export function previewKind(mediaType: unknown, kinds: readonly string[] = KINDS): 'text' | 'markdown' | 'csv' | 'image' | 'pdf' | 'source' | 'none' {
  const t = bare(mediaType);
  if (AS_TEXT.has(t) || t.endsWith('+xml')) return 'source';
  if (!kinds.includes(t)) return t.startsWith('text/') ? 'source' : 'none';
  if (t === 'text/markdown') return 'markdown';
  if (t === 'text/csv') return 'csv';
  if (t === 'image/png' || t === 'image/jpeg') return 'image';
  if (t === 'application/pdf') return 'pdf';
  return 'text';
}

function Body({ file, kind, ctx, csvRows }: { file: FileRow; kind: ReturnType<typeof previewKind>; ctx: Ctx; csvRows: number }) {
  const [text, setText] = useState<string | undefined>(undefined);
  const [failed, setFailed] = useState('');
  const textual = kind === 'text' || kind === 'markdown' || kind === 'csv' || kind === 'source';
  useEffect(() => {
    if (!textual) return;
    let gone = false;
    setText(undefined); setFailed('');
    ctx.fileText(file).then(t => { if (!gone) setText(t); }, e => { if (!gone) setFailed(String((e as Error)?.message ?? e)); });
    return () => { gone = true; };
  }, [file.id, file.root, kind]);
  if (kind === 'image' || kind === 'pdf') {
    const url = ctx.fileUrl(file, true);
    if (!url) return <p className="bma-empty">Preview unavailable: this page reads no file.</p>;
    return kind === 'image' ? <img className="as-preview-image" src={url} alt={String(file.name ?? 'image')} />
      : <iframe className="as-preview-pdf" sandbox="" src={url} title={String(file.name ?? 'PDF')} />;
  }
  if (kind === 'none') return <p className="bma-empty">No preview for {bare(file.mediaType) || 'this type'}; download it to open it.</p>;
  if (failed) return <p className="bma-empty" role="note">Preview unavailable: {failed}.</p>;
  if (text === undefined) return <p className="bma-empty" aria-busy="true">Loading the preview…</p>;
  if (kind === 'markdown') return <div className="bma-prose"><Markdown markdown={text} copy /></div>;
  if (kind === 'csv') {
    const { header, rows, more } = parseCsv(text, csvRows);
    return (
      <div className="bma-table-wrap as-preview-csv">
        <table className="bma-table">
          <thead><tr>{header.map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead>
          <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, k) => <td key={k}>{c}</td>)}</tr>)}</tbody>
        </table>
        <p className="bma-muted bma-small">{rows.length} {rows.length === 1 ? 'row' : 'rows'}{more ? `; the first ${csvRows} drawn` : ''}</p>
      </div>
    );
  }
  return <pre className="as-preview-text">{text}</pre>;
}

export const FilePreview = define<FilePreviewProps>('FilePreview', ({ props, ctx }) => {
  const literal = typeof props.file === 'string' ? props.file : undefined;
  const path = props.file && typeof props.file === 'object' ? (props.file as { path?: string }).path : undefined;
  const bound = useData<unknown>(ctx, path);
  const id = literal ?? (bound === undefined || bound === null ? '' : String(bound));
  const raw = useData<unknown>(ctx, typeof props.files === 'string' ? props.files : '/files');
  const max = Math.min(MAX, typeof props.maxBytes === 'number' && props.maxBytes > 0 ? props.maxBytes : 2 * 1024 * 1024);
  const csvRows = typeof props.csvRows === 'number' && props.csvRows > 0 ? Math.min(5000, props.csvRows) : 500;
  const kinds = Array.isArray(props.kinds) && props.kinds.length ? props.kinds.map(String) : KINDS;
  const file = Array.isArray(raw) ? (raw as FileRow[]).find(f => String(f.id ?? '') === id) : undefined;
  let body;
  if (!id) body = <p className="bma-empty">Pick a file to preview.</p>;
  else if (raw === undefined) body = <p className="bma-empty" aria-busy="true">Loading…</p>;
  else if (!file) body = <p className="bma-empty" role="note">Unavailable: no shared file has the id {id}.</p>;
  const download = file ? ctx.fileUrl(file, false) : '';
  return (
    <div className="as-preview" data-component="FilePreview" role="group" aria-label={file ? 'Preview of ' + file.name : 'Preview'}>
      {file ? (
        <div className="as-preview-head">
          <b className="as-preview-name">{String(file.name ?? id)}</b>
          <span className="bma-muted bma-small">{bare(file.mediaType)}</span>
          <span className="bma-muted bma-small">{sizeText(Number(file.bytes) || 0)}</span>
          {download ? <a className="bma-btn" href={download} download={String(file.name ?? '')} rel="noopener noreferrer">Download</a> : <span className="bma-btn" aria-disabled="true">Download</span>}
        </div>
      ) : null}
      {body ?? (file && (Number(file.bytes) || 0) > max
        ? <p className="bma-empty" role="note">Too large to preview ({sizeText(Number(file.bytes))}; the preview draws up to {sizeText(max)}). Download it to open it.</p>
        : file ? <Body file={file} kind={previewKind(file.mediaType, kinds)} ctx={ctx} csvRows={csvRows} /> : null)}
    </div>
  );
});
