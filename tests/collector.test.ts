import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../src/genome';
import { extractTokens, SpawnCollector } from '../src/sim/collector';
import type { ChatMessage } from '../src/chat/types';

let n = 0;
function msg(text: string, user = `u${++n}`, extra: Partial<ChatMessage> = {}): ChatMessage {
  return { id: `m${++n}`, platform: 'local', userId: user, userName: user, text, emotes: [], at: n, ...extra };
}

describe('extractTokens', () => {
  it('accepts one word, even repeated', () => {
    expect(extractTokens(msg('KEKW KEKW KEKW')).map((t) => t.text)).toEqual(['KEKW']);
  });

  it('ignores sentences but keeps emotes inside them', () => {
    expect(extractTokens(msg('that was so good'))).toEqual([]);
    expect(extractTokens(msg('that was so good KEKW')).map((t) => t.text)).toEqual(['KEKW']);
    const withTwitchEmote = msg('hello Kappa', 'x', { emotes: [{ provider: 'twitch', id: '25', name: 'Kappa', url: 'u' }] });
    expect(extractTokens(withTwitchEmote)[0].emote?.id).toBe('25');
  });
});

describe('SpawnCollector', () => {
  it('merges duplicate words from different viewers', () => {
    const c = new SpawnCollector();
    for (let i = 0; i < 5; i++) c.addMessage(msg('snail'));
    expect(c.pending).toHaveLength(1);
    expect(c.pending[0].contributions).toHaveLength(5);
  });

  it('caps each viewer per window', () => {
    const c = new SpawnCollector(2);
    expect(c.addMessage(msg('snail', 'spammer'))).toBe(1);
    expect(c.addMessage(msg('rocket', 'spammer'))).toBe(1);
    expect(c.addMessage(msg('ghost', 'spammer'))).toBe(0);
  });

  it('removes deleted messages and purged users', () => {
    const c = new SpawnCollector();
    const a = msg('snail', 'alice');
    c.addMessage(a);
    c.addMessage(msg('rocket', 'bob'));
    c.handle({ type: 'delete', messageId: a.id });
    expect(c.pending.map((p) => p.genome.root)).toEqual(['rocket']);
    c.handle({ type: 'purge', userId: 'bob' });
    expect(c.pending).toHaveLength(0);
  });

  it('never spends more than the budget', () => {
    const c = new SpawnCollector();
    for (let i = 0; i < 200; i++) c.addMessage(msg(`word${String.fromCharCode(97 + (i % 26))}${i}`));
    const plan = c.takeWave(100, 'chat-only', mulberry32(1));
    const spent = plan.orders.reduce((s, o) => s + o.cost, 0);
    expect(spent).toBeLessThanOrEqual(100.0001);
    expect(plan.wildThreat).toBe(0);
  });

  it('fills unspent budget with the Wilds in blended mode only', () => {
    const blended = new SpawnCollector();
    blended.addMessage(msg('snail'));
    const plan = blended.takeWave(100, 'blended', mulberry32(1));
    expect(plan.chatThreat).toBeGreaterThan(0);
    expect(plan.wildThreat).toBeGreaterThan(50);
    expect(plan.orders.some((o) => o.genome.source === 'wilds')).toBe(true);

    const chatOnly = new SpawnCollector();
    chatOnly.addMessage(msg('snail'));
    expect(chatOnly.takeWave(100, 'chat-only', mulberry32(1)).wildThreat).toBe(0);
  });

  it('ignores chat in offline mode', () => {
    const c = new SpawnCollector();
    c.addMessage(msg('snail'));
    const plan = c.takeWave(100, 'offline', mulberry32(1));
    expect(plan.chatThreat).toBe(0);
    expect(plan.orders.every((o) => o.genome.source === 'wilds')).toBe(true);
  });

  it('turns many copies into one titan, and repeated chunks into a swarm', () => {
    const c = new SpawnCollector();
    for (let i = 0; i < 8; i++) c.addMessage(msg('snail'));
    c.addMessage(msg('hahaha'));
    const plan = c.takeWave(1000, 'chat-only', mulberry32(1));
    const snails = plan.orders.filter((o) => o.genome.root === 'snail');
    expect(snails).toHaveLength(1);
    expect(snails[0].scale).toBeGreaterThan(1.5);
    expect(snails[0].copies).toBe(8);
    expect(plan.orders.filter((o) => o.genome.token === 'hahaha')).toHaveLength(3);
  });

  it('resets viewer caps and removes spawned species after a wave', () => {
    const c = new SpawnCollector(1);
    c.addMessage(msg('snail', 'alice'));
    c.takeWave(100, 'chat-only', mulberry32(1));
    expect(c.pending).toHaveLength(0);
    expect(c.addMessage(msg('rocket', 'alice'))).toBe(1);
  });

  it('spends the most popular species first and carries the rest to the next wave', () => {
    const c = new SpawnCollector();
    c.addMessage(msg('early'));
    for (let i = 0; i < 6; i++) c.addMessage(msg('snail'));
    for (let i = 0; i < 12; i++) c.addMessage(msg(`word${String.fromCharCode(97 + i)}`));
    expect(c.pending[0].genome.root).toBe('snail');
    const plan = c.takeWave(60, 'chat-only', mulberry32(1));
    expect(plan.orders[0].genome.root).toBe('snail');
    expect(c.pending.length).toBeGreaterThan(5);
    const next = c.takeWave(1000, 'chat-only', mulberry32(1));
    expect(next.orders.length).toBeGreaterThan(5);
  });

  it('previews which species fit the next wave', () => {
    const c = new SpawnCollector();
    for (let i = 0; i < 10; i++) c.addMessage(msg(`word${String.fromCharCode(97 + i)}`));
    expect(c.preview(30).size).toBe(3);
  });
});
