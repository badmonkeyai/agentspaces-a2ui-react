/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-widgets/FileShare: an alias of FileTree through 0.6.x, drawn by it as a
// flat list of the rows at /files with an upload, keeping the alias's own properties (accept, maxBytes, multiple, its
// words on the drop, the notice over it, and the attestation a person ticks before a drop).
import { define } from '../../renderer/implementation';
import type { FileShareProps } from '../../generated/props';
import { FileTreeView } from './FileTree';

export const FileShare = define<FileShareProps>('FileShare', ({ props, ctx }) => (
  <FileTreeView ctx={ctx} o={{ reads: '/files', flat: true, upload: true, label: props.label || 'Drop files here, or choose them', accept: props.accept,
    maxBytes: props.maxBytes, multiple: props.multiple, notice: props.notice, attest: props.attest, actions: ['download'] }} />
));
