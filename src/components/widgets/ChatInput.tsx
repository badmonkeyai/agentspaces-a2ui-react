/*
 * Copyright 2026 Bad Monkey, Inc.
 * SPDX-License-Identifier: Apache-2.0
 */
// agentspaces-widgets/ChatInput: an alias of Chat through 0.6.x, drawn by it over the
// rows at /conversations with the properties the alias always had (key, agent, placeholder, suggestions).
import { define } from '../../renderer/implementation';
import type { ChatInputProps } from '../../generated/props';
import { ChatView } from './Chat';

export const ChatInput = define<ChatInputProps>('ChatInput', ({ props, ctx }) => (
  <ChatView o={{ reads: '/conversations', key: props.key, agent: props.agent, placeholder: props.placeholder, suggestions: props.suggestions }} ctx={ctx} />
));
