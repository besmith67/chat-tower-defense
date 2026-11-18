/** Every tuning number in one place. Change these during playtests, not scattered constants. */

export const BALANCE = {
  totalWaves: 15,
  startingGold: 140,
  startingLives: 20,

  /** Seconds of build time before each wave. Chat collects monsters during this window. */
  buildSeconds: 25,
  firstBuildSeconds: 35,

  /** Threat points chat (and the Wilds) can spend on a wave. */
  waveBudget(wave: number): number {
    return Math.round(90 * Math.pow(1.15, wave - 1) + 10 * (wave - 1));
  },
  /** Monster strength multiplier per wave. */
  wavePower(wave: number): number {
    return Math.pow(1.26, wave - 1);
  },

  /** Threat cost of one ordinary monster. */
  unitCost: 10,
  eliteMultiplier: 1.8,
  /** Merging n copies of a species is worth n^this units. Below 1, so spam has diminishing returns. */
  mergeExponent: 0.85,
  /** Total power bonus for swarms, which are split across fragile members. */
  swarmBonus: 1.2,
  maxSwarmMembers: 12,
  maxTitanScale: 2.2,
  /** Titans are slower the bigger they get: speed divides by scale to this power. */
  titanSlowExponent: 1,
  /** Towers see stealthy monsters at this fraction of their range. */
  stealthRange: 0.8,

  /** Each viewer can add this many monsters per spawn window. */
  perViewerCap: 2,
  /** Chat species that did not fit a wave wait for the next one. Oldest, least popular drop past this. */
  maxBacklogSpecies: 40,

  /** Base monster stats before genes. */
  hpPerPower: 26,
  baseSpeed: 34,
  speedRange: 92,
  maxArmor: 0.55,

  /** Gold per threat point when a monster dies, and the share of total threat paid at wave end. */
  bountyPerThreat: 0.4,
  /** Chat monsters are cleverer than the Wilds, so they pay more. */
  chatBountyMultiplier: 1.5,
  waveClearBonus: 0.2,
  /** Selling refunds this share of what was paid. */
  sellRefund: 0.7,

  /** Towers gain this much damage per kill of a species, up to the cap. */
  adaptationPerKill: 0.03,
  adaptationCap: 0.45,

  /** Spawn spacing in seconds between monsters in a wave. */
  spawnInterval: 0.75,
} as const;
