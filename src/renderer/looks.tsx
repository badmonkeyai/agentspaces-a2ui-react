/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// One surface in several looks at once: the same envelopes drawn side by side, each in its own look and mode (a
// tenant's, a partner's, night), with no change to what the agent sends. Each look is a renderer of its own over the
// same messages; a person's action in any of them is the one action, sent once by the look it was taken in.
import type { ReactNode } from 'react';
import { Surfaces, type SurfacesProps } from './surfaces';
import type { LookAndFeel } from '../generated/look';

export interface SurfaceLook { label: string; look?: LookAndFeel; mode?: 'light' | 'dark' }

export interface SurfacesInLooksProps extends Omit<SurfacesProps, 'look' | 'mode'> {
  looks: readonly SurfaceLook[];
  /** What the group of looks is called, for a screen reader. */
  label?: string;
}

export function SurfacesInLooks({ looks, label = 'One surface in several looks', ...rest }: SurfacesInLooksProps): ReactNode {
  return (
    <div className="as-looks" role="group" aria-label={label}>
      {looks.map((l, i) => (
        <figure key={l.label + ':' + i} className="as-looks-one">
          <figcaption>{l.label}</figcaption>
          <Surfaces {...rest} look={l.look} mode={l.mode ?? 'light'} />
        </figure>
      ))}
    </div>
  );
}
