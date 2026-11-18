import { describe, expect, it } from 'vitest';
import { kickToChatEvent } from '../src/chat/kick';

// Shape captured from a live Kick chatroom on 2026-11-18, trimmed.
const live = {
  id: 'd0c0faa2-cd0f-414e-be59-7af2df6ca5e3',
  chatroom_id: 669512,
  content: '[emote:37226:KEKW] lol [emote:5747889:collectiblesKEKWait]',
  type: 'message',
  created_at: '2026-11-18T05:43:01+00:00',
  sender: { id: 81759817, username: 'michael090102', slug: 'michael090102', identity: { color: '#72ACED', badges: [] } },
};

describe('Kick chat', () => {
  it('turns inline emotes into names plus an emote list', () => {
    const event = kickToChatEvent('App\\Events\\ChatMessageEvent', live);
    expect(event?.type).toBe('message');
    if (event?.type !== 'message') return;
    expect(event.message.text).toBe('KEKW lol collectiblesKEKWait');
    expect(event.message.userId).toBe('81759817');
    expect(event.message.userName).toBe('michael090102');
    expect(event.message.platform).toBe('kick');
    expect(event.message.emotes).toEqual([
      { provider: 'kick', id: '37226', name: 'KEKW', url: 'https://files.kick.com/emotes/37226/fullsize' },
      { provider: 'kick', id: '5747889', name: 'collectiblesKEKWait', url: 'https://files.kick.com/emotes/5747889/fullsize' },
    ]);
  });

  it('maps moderation to deletes and purges', () => {
    expect(kickToChatEvent('App\\Events\\MessageDeletedEvent', { message: { id: 'abc' } })).toEqual({ type: 'delete', messageId: 'abc' });
    expect(kickToChatEvent('App\\Events\\UserBannedEvent', { user: { id: 7 } })).toEqual({ type: 'purge', userId: '7' });
    expect(kickToChatEvent('App\\Events\\ChatroomClearEvent', {})).toEqual({ type: 'purge', userId: null });
  });

  it('ignores everything else', () => {
    expect(kickToChatEvent('App\\Events\\PinnedMessageCreatedEvent', {})).toBeNull();
    expect(kickToChatEvent('App\\Events\\ChatMessageEvent', { id: 'x' })).toBeNull();
  });
});
