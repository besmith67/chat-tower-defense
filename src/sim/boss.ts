/**
 * Boss waves. Every fifth wave, chat votes on which monster becomes the boss. Candidates are the
 * species chat sent most during the run, with Emote Studio boss picks first. The Wilds fill in when
 * chat has not sent enough, and decide alone in offline mode.
 */
import type { ChatMessage } from '../chat/types';
import { makeWildGenome, type Genome, type Rng } from '../genome';

export const BOSS_EVERY = 5;
/** Share of a boss wave's threat budget spent on the boss itself. */
export const BOSS_SHARE = 0.3;

export function isBossWave(wave: number): boolean {
  return wave % BOSS_EVERY === 0;
}

export interface BossCandidate {
  genome: Genome;
  /** Viewer who first sent it, for the nameplate. Null for the Wilds. */
  sentBy: string | null;
  /** Copies chat sent during the run. */
  copies: number;
  /** Marked as a boss candidate in the Emote Studio. */
  flagged: boolean;
}

/** Picks three candidates: Studio boss picks, then the most-sent species, then the Wilds. */
export function pickCandidates(history: Iterable<BossCandidate>, rng: Rng): BossCandidate[] {
  const ranked = [...history].sort((a, b) => Number(b.flagged) - Number(a.flagged) || b.copies - a.copies);
  const picks = ranked.slice(0, 3);
  while (picks.length < 3) picks.push({ genome: makeWildGenome(rng), sentBy: null, copies: 0, flagged: false });
  return picks;
}

const VOTE = /^\s*(?:!vote\s*)?([123])\s*$/i;

export class BossVote {
  private votes = new Map<string, number>();

  constructor(readonly candidates: BossCandidate[]) {}

  /** Reads "!vote 2" or a bare "2". Returns true when the message was a vote, so it spawns nothing. */
  handle(message: ChatMessage): boolean {
    const m = VOTE.exec(message.text);
    if (!m) return false;
    this.votes.set(message.userId, Number(m[1]) - 1);
    return true;
  }

  /** Votes per candidate. A viewer's latest vote is the one that counts. */
  tally(): number[] {
    const counts = this.candidates.map(() => 0);
    for (const choice of this.votes.values()) counts[choice]++;
    return counts;
  }

  get total(): number {
    return this.votes.size;
  }

  /** Most votes wins, ties go to the earlier candidate. With no votes, the Wilds pick at random. */
  winner(rng: Rng): BossCandidate {
    const counts = this.tally();
    if (this.total === 0) return this.candidates[Math.floor(rng() * this.candidates.length)];
    return this.candidates[counts.indexOf(Math.max(...counts))];
  }
}
