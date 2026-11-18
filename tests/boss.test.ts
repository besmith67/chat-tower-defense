import { describe, expect, it } from 'vitest';
import { makeGenome, mulberry32 } from '../src/genome';
import { BossVote, isBossWave, pickCandidates } from '../src/sim/boss';
import { Match } from '../src/sim/match';

const msg = (text: string, user: string) => ({
  type: 'message' as const,
  message: { id: `${user}-${text}`, platform: 'local' as const, userId: user, userName: user, text, emotes: [], at: 0 },
});

const candidate = (word: string, copies: number, flagged = false) => ({ genome: makeGenome(word)!, sentBy: 'v', copies, flagged });

describe('boss vote', () => {
  it('happens every fifth wave', () => {
    expect([1, 4, 5, 10, 15].map(isBossWave)).toEqual([false, false, true, true, true]);
  });

  it('picks Studio boss picks first, then the most sent, then the Wilds', () => {
    const picks = pickCandidates([candidate('snail', 3), candidate('ghost', 9), candidate('pizza', 1, true)], mulberry32(1));
    expect(picks.map((p) => p.genome.token)).toEqual(['pizza', 'ghost', 'snail']);
    const thin = pickCandidates([candidate('snail', 3)], mulberry32(1));
    expect(thin[1].genome.source).toBe('wilds');
  });

  it('counts one vote per viewer, latest wins, and accepts bare numbers', () => {
    const vote = new BossVote([candidate('a1', 1), candidate('b1', 1), candidate('c1', 1)].map((c) => c));
    expect(vote.handle(msg('!vote 2', 'amy').message)).toBe(true);
    expect(vote.handle(msg('3', 'bob').message)).toBe(true);
    expect(vote.handle(msg('!vote 3', 'amy').message)).toBe(true);
    expect(vote.handle(msg('snail', 'cat').message)).toBe(false);
    expect(vote.tally()).toEqual([0, 0, 2]);
    expect(vote.winner(mulberry32(1)).genome.token).toBe('c1');
  });

  it('runs a boss wave from chat history', () => {
    const match = new Match({ mode: 'blended', seed: 3 });
    match.world.gold = 0;
    for (let wave = 1; wave < 5; wave++) {
      for (let i = 0; i < 6; i++) match.handleChat(msg('ghost', `v${wave}-${i}`));
      match.startWave();
      for (let t = 0; t < 400 && match.phase === 'wave'; t += 1 / 30) match.update(1 / 30);
      match.world.lives = 20;
    }
    expect(match.wave).toBe(5);
    expect(match.bossVote).not.toBeNull();
    expect(match.bossVote!.candidates[0].genome.token).toBe('ghost');
    match.handleChat(msg('!vote 1', 'fan'));
    expect(match.collector.pending.some((p) => p.genome.token === '1')).toBe(false);
    match.startWave();
    expect(match.boss?.genome.token).toBe('ghost');
    expect(match.lastPlan!.orders.some((o) => o.boss)).toBe(true);
    expect(match.bossVote).toBeNull();
  });
});
