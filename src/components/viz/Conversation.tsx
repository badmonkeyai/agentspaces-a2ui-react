/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-viz/Conversation: an alias of the widgets catalog's Chat through 0.6.x, so a design that names the old component keeps working,
// drawn by it over the rows at `lines` with the alias's properties (key, agent, placeholder, writeAction). The visitor's
// secret rides only with the page's write action, never with a design's own writeAction.
import { define } from '../../renderer/implementation';
import type { ConversationProps } from '../../generated/props';
import { ChatView } from '../widgets/Chat';

export const Conversation = define<ConversationProps>('Conversation', ({ props, ctx }) => (
  <ChatView o={{ reads: props.lines, key: props.key, agent: props.agent, placeholder: props.placeholder, writeAction: props.writeAction }} ctx={ctx} />
));
