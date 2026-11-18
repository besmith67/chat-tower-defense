import { describe, expect, it } from 'vitest';
import { Match } from '../src/sim/match';

describe('Match', () => {
  it('runs build, wave, and the next build phase in offline mode', () => {
    const match = new Match({ mode: 'offline', seed: 7 });
    expect(match.phase).toBe('build');
    match.placeTower('needle', 3, 3);
    match.placeTower('needle', 5, 5);
    match.startWave();
    expect(match.phase).toBe('wave');
    expect(match.lastPlan!.wildThreat).toBeGreaterThan(0);
    for (let i = 0; i < 60 * 180 && match.phase === 'wave'; i++) match.update(1 / 60);
    expect(match.phase).toBe('build');
    expect(match.wave).toBe(2);
  });

  it('ends a chat-only wave at once when chat sent nothing', () => {
    const match = new Match({ mode: 'chat-only', seed: 1 });
    match.startWave();
    expect(match.phase).toBe('build');
    expect(match.wave).toBe(2);
  });

  it('is lost when lives run out', () => {
    const match = new Match({ mode: 'offline', seed: 3 });
    match.world.lives = 1;
    match.startWave();
    for (let i = 0; i < 60 * 180 && match.phase === 'wave'; i++) match.update(1 / 60);
    expect(match.phase).toBe('lost');
  });
});
