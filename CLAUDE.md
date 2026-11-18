# Chat Tower Defense

A browser tower defense game where the streamer defends and Twitch chat attacks. Every chat word or emote becomes a monster generated from the text.

## Start here

- **What to work on:** `docs/ROADMAP.md`. Work is split into packages sized for one chat. Do the package the user names, or the first `todo` package whose dependencies are `done`.
- **Why things are the way they are:** `docs/DESIGN.md` (game) and `docs/MONSTER_GENERATION.md` (the generator, the core of the game). Settled choices are under **Decisions** in the roadmap. Do not reopen them without a reason.
- **Roles:** Claude is the game director and lead developer. The user gives direction, playtests, and handles accounts and keys. Make design calls yourself and record them in the docs.

## Commands

```
npm run dev         # local game at http://localhost:5173
npm test            # vitest
npm run typecheck
npm run build       # typecheck + production build to dist/
npm run balance     # headless bot plays full runs; prints win rates
npm run playtest    # puppeteer screenshots; needs `npx vite preview --port 4173` running
npm run lexicon     # rebuild src/genome/data/lexicon.json from WordNet + data/lexicon/seeds.tsv
```

URL options for testing: `?mode=offline|blended|chat-only&channel=<twitch>&autostart=1&debug=1&names=1`. With `debug=1`, `window.__ctd.say("word")` sends test chat.

## Layout and rules

- `src/genome`: the monster generator. Pure and deterministic. No Phaser, no DOM, no `Math.random`.
- `src/chat`: platform adapters. Each emits `ChatEvent`.
- `src/sim`: game rules. No rendering, so it runs headless in tests and the balance bot.
- `src/game`: Phaser rendering and input only. It reads the sim; it never decides rules.
- `tools/`: balance bot, playtest, lexicon builder. Never shipped.
- Tunable numbers live in `src/sim/balance.ts`.

## Conventions

- Strict TypeScript. Tests for every generator rule and sim behavior.
- The same token must always make the same species. Use the seeded RNG from `src/genome/hash.ts`.
- Wilds monsters must never look like chat sent them: invented names, muted glitch look, own portal.
- Blocked words spawn nothing.
- Commit per package on the milestone branch and push. Keep the milestone PR description current.
