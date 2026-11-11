/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Prose: Markdown as safe HTML (the Report's renderer: no raw HTML, http links only), the text a
// literal or a path; named Prose because the A2UI React binding registers a Markdown element of its own.
import { define, useData } from '../../renderer/implementation';
import type { ProseProps } from '../../generated/props';
import { Markdown as Render } from '../../viz/Markdown';

const pointer = (v: unknown): string | undefined => (typeof v === 'string' && v.startsWith('/') ? v : undefined);

export const Prose = define<ProseProps>('Prose', ({ props, ctx }) => {
  const bound = useData<unknown>(ctx, pointer(props.text));
  const text = pointer(props.text) ? (bound === undefined ? '' : String(bound)) : String(props.text ?? '');
  return <div className="bma-prose" data-component="Prose">{text ? <Render markdown={text} /> : <span className="bma-empty">Nothing written yet.</span>}</div>;
});
