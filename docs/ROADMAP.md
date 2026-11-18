# Roadmap

The work is split into **packages**. Each package is sized to fit in one chat session and can be picked up cold. Start a new chat with:

> Read CLAUDE.md and docs/ROADMAP.md, then do package M2.3.

Or just "do the next package", which means the first package below whose status is `todo` and whose dependencies are `done`.

## How a package is worked

1. Read `CLAUDE.md`, this file, and the docs the package lists.
2. Check out the milestone branch (for example `milestone-2-meaning`). Create it from the latest milestone branch if it does not exist yet.
3. Build it. Add or update tests in `tests/`.
4. Run the checks in **Definition of done** below.
5. Update this file: set the status to `done` and add a one-line result note. Record any new decisions under **Decisions**.
6. Commit, push, and keep the milestone PR description current.

### Definition of done

- `npm test`, `npm run typecheck`, and `npm run build` all pass.
- `npm run balance -- 20 smart` and `npm run balance -- 20 smart chat` still show the smart bot winning most runs, and the needles and lazy bots losing. Note the numbers in the package result.
- For anything visible: `npm run build && npx vite preview --port 4173` then `npm run playtest`, and look at the screenshots.
- Design docs match what shipped.

### Status key

`done` · `todo` · `blocked: <reason>` · `user` (needs the human: accounts, keys, playtesting)

---

## User actions (outside code)

| ID | Action | Status |
|---|---|---|
| U1 | Run `gh auth refresh -h github.com -s workflow`. Then any chat can run `git push -u origin ci-workflows` and open a PR for it. The local `ci-workflows` branch holds the CI and Pages deploy workflows. | user |
| U2 | Enable GitHub Pages: repo Settings, Pages, Source "GitHub Actions". | user |
| U3 | Review and merge PR #1 (milestone 1). Later milestone PRs stack on it. | user |
| U4 | Play a session with a real chat and report what felt good or bad. Best after M2.8. | user |
| U5 | Register a Twitch developer app and share its Client ID (not the secret). Needed by M3.6 and M4.6. | user |

---

## Milestone 1: Playable core (done)

Shipped in PR #1: the TypeScript, Vite, Phaser 4, and Vitest project; generator layers 1 and 2; ten curated emotes; Twitch chat with no login; 7TV, BTTV, and FFZ emotes as faces; the threat budget with titans, swarms, and carry-over; the Wilds; three towers; sixteen quirks; tower adaptation; a balance bot; and a headless playtest script.

---

## Milestone 2: Meaning

Goal: a monster behaves like what its word means. Today `snail` and `rocket` differ only by how they sound. Branch: `milestone-2-meaning`.

### M2.1 Lexicon build pipeline: done

- **Goal.** An offline tool turns WordNet plus a hand-curated seed file into a small lexicon the game ships. The game never needs a model at runtime.
- **Build.** `tools/lexicon/build.ts` (run with `npm run lexicon`). Reads `wordnet-db` (dev dependency) and `data/lexicon/seeds.tsv`. Writes `src/genome/data/lexicon.json`.
- **Each entry.** Part of speech, family (from WordNet hypernyms), element, eight axis scores, and a rarity score (from WordNet sense tag counts).
- **Runtime.** `src/genome/lexicon.ts` with `lookupWord(root)`.
- **Done when.** Common words resolve with sensible family and part of speech, the JSON stays under about 400 KB, and tests cover the lookup.
- **Result.** 34,445 words, 328 KB (142 KB gzipped). Families come from WordNet lexicographer files. Lookup handles plurals, -ing, -ed, and stretched letters. Irregular forms (wolves, ran) are not handled. Only 18 anchor seeds so far, so most words have neutral axes until M2.2.

### M2.2 Curated meaning seeds: done

- **Depends on.** M2.1.
- **Goal.** Hand-scored axes and elements for the words chat actually types: about 600 core nouns, verbs, and adjectives, plus Twitch slang (pog, sus, ratio, gg, based, cringe, bussin, and so on).
- **Build.** Extend `data/lexicon/seeds.tsv`. The format is in the file header. Synonyms in WordNet inherit seeded scores at build time, so seed the clearest word of each cluster.
- **Done when.** The worked examples in MONSTER_GENERATION.md read correctly (`snail` slow and hard, `rocket` fast and hot, `ghost` quiet and dead, `avalanche` fast, huge, cold, chaotic).
- **Result.** 509 seeds. 8,142 more words inherit through WordNet and 2,746 get gloss nudges. Seeded slang is never rare. Common irregular forms (wolves, mice, ran) are handled. Room to grow: more slang, emote suffixes for M3.1, and more verbs once M2.6 picks its ability list.

### M2.3 Layer 3: meaning drives stats and element: done

- **Depends on.** M2.1. Better after M2.2.
- **Goal.** Axis scores bend the stat weights (speed, mass to health and size, hardness to armor). The genome gains `element` and `meaning`. Rare words become elites.
- **Rules.** Meaning outranks form. Form still decides the tower counter (spiky vs round). The total stat budget never changes.
- **Visible.** Element tints the body hue. The inspect panel explains the meaning in plain words ("means slow, hard").
- **Done when.** Tests show `snail` slower than `rocket` regardless of sound, and the balance bot still holds.
- **Result.** Shipped with three new quirks (regen, undying, stealth). The balance bot gained a simulated busy chat (`npm run balance -- 20 smart chat`). It showed that busy chat was already unwinnable in milestone 1 because spam titans leaked. Fixed: titans slow down with size, stealth is 80 percent range, and chat monsters pay 1.3x bounty. Smart bot: offline 20/20 wins with 19 lives left; busy chat 15/20 with about 10 lives left. Needles-only loses both. The bundle grew to 558 KB gzipped because of the lexicon; lazy-loading it is an option if load time matters.

### M2.4 Elements and two elemental towers: todo

- **Depends on.** M2.3.
- **Goal.** Elements matter in combat. Add a Flame tower (fire damage, burn over time) and a Tesla tower (shock damage, chains to nearby monsters). The Frost tower's damage becomes `cold`.
- **Build.** A damage-kind vs element table in `src/sim/elements.ts`. Each element resists one kind and is weak to one. Hotkeys 4 and 5.
- **Done when.** The balance bot plays with five towers, and a strategy that ignores elements does measurably worse than one that reads them.

### M2.5 Layer 4: families and body plans: todo

- **Depends on.** M2.1.
- **Goal.** Each family gets a body plan in `monsterArt.ts` (legs, wheels, wisp, floating part, and so on) and one small signature trait in the sim (for example, food leaves a snack that heals neighbors; constructs are armored).
- **Done when.** Ten families are visually distinct in the playtest screenshots and each trait has a test.

### M2.6 Layer 5: verbs become abilities, adjectives become auras: todo

- **Depends on.** M2.1.
- **Goal.** A verb maps to the nearest ability in a catalog. Start with eight: sprint, hop, burrow, stealth, heal, split, steal, explode. A lone adjective spawns a herald that buffs the next few monsters.
- **Build.** Ability catalog in `src/sim/abilities.ts`, verb-to-ability mapping at lexicon build time.
- **Done when.** `dig` burrows, `heal` heals, `angry` makes a herald, and each ability has a test.

### M2.7 Typo mutants and affixes: todo

- **Depends on.** M2.3.
- **Goal.** A token within one or two edits of a known word becomes a mutant of that word with one seeded mutation. Affixes change the root: mega-, mini-, un-, -est, re-, -ify.
- **Done when.** `fier` is a fire mutant, `megasnail` is a bigger, rarer snail, and `unhappy` flips the mood axis.

### M2.8 Milestone 2 wrap-up: todo

- **Depends on.** M2.2 to M2.7.
- **Goal.** Balance sweep, playtest screenshots, docs updated, and the PR ready for review. Then hand U4 to the user.

---

## Milestone 3: Emotes go deep

Branch: `milestone-3-emotes`.

| ID | Package | Depends on | Status |
|---|---|---|---|
| M3.1 | Emote name splitting: `pokiHype` becomes prefix `poki` plus suffix `Hype`, and the suffix runs through the lexicon. Curated suffix table (Hype, Love, Rage, Sad, Pog, W, L, Hi, Sleep, Clap, GG). | M2.3 | todo |
| M3.2 | Emote image analysis in the browser: palette to element, transparency mask to silhouette, edge roughness to form. Cache results per emote. Decide whether BTTV images get a proxy or stay as generated faces. | M2.4 | todo |
| M3.3 | 7TV zero-width emotes as modifier genes on the previous monster (hat, rain, flames). | M3.2 | todo |
| M3.4 | Emoji: map to their Unicode names and run those through the word pipeline, so 🔥 reads as fire. | M2.3 | todo |
| M3.5 | Emote Studio: a setup screen listing the channel's emotes as species. The streamer can rename, disable, pick a signature ability, or mark boss candidates. Saved per channel in local storage. | M3.1 | todo |
| M3.6 | Twitch OAuth (implicit flow, Client ID from U5) and sub-tier rarity for emotes. | U5 | blocked: needs U5 |

## Milestone 4: Chat as a force

Branch: `milestone-4-crowd`.

| ID | Package | Depends on | Status |
|---|---|---|---|
| M4.1 | Boss waves every fifth wave. Chat votes with `!vote 1/2/3` among three candidates built from the run's most popular species. | M2.3 | todo |
| M4.2 | Synonym fusion and antonym clash in the spawn window, using lexicon axes. | M2.3 | todo |
| M4.3 | Rhyme chains and alliteration packs. | M2.3 | todo |
| M4.4 | Tower sabotage: words near a tower's weakness (`rust`, `ground`, `water`) spawn saboteurs that go after that tower type. | M2.4 | todo |
| M4.5 | Bestiary with first-discovery credit per channel, and evolution when a species leaks often. Local storage. | M2.3 | todo |
| M4.6 | Channel point redemptions through EventSub WebSocket: rewards that help or hurt the streamer. | M3.6 | blocked: needs U5 |

## Milestone 5: Polish and reach

| ID | Package | Depends on | Status |
|---|---|---|---|
| M5.1 | Sound: procedural Web Audio effects for shots, hits, deaths, leaks, and wave start. A simple music loop. A mute toggle. | none | todo |
| M5.2 | Tower upgrades: two levels per tower. | M2.4 | todo |
| M5.3 | More maps and a map picker. | none | todo |
| M5.4 | YouTube and Kick chat adapters. Research first: both need API keys or unofficial endpoints. | none | todo |
| M5.5 | Streamer quality of life: remembered settings, an on-screen "how chat plays" card, a colorblind-safe palette, and an OBS-friendly layout. | none | todo |
| M5.6 | Art pass on the sticker style. Needs the user's sign-off on direction. | M2.5 | todo |
| M5.7 | Desktop build for Steam (Tauri). Needs the user's Steam account. | M5.6 | todo |

---

## Decisions

Settled choices, so later chats do not reopen them.

- **Stack.** TypeScript, Vite, Phaser 4, Vitest. GitHub Pages hosting. No server.
- **Meaning data.** Built offline from WordNet plus hand-curated seeds, not from embeddings. WordNet gives part of speech, families from hypernyms, synonym sets, and frequency. Seeds give axis scores, and synonyms inherit them. Embeddings can be added later if coverage is thin.
- **Families.** The ten from MONSTER_GENERATION.md, except Weather is renamed Elemental and also covers substances (lava, water, mud). Plants count as Beasts.
- **Elements.** Six plus neutral: fire, frost, storm, venom, stone, spirit. Ten was too many to read at a glance on stream.
- **Damage kinds.** pierce (Needle), blunt (Hammer), cold (Frost), fire (Flame), shock (Tesla).
- **Form still sets the shape counter.** Meaning changes stats and element, never the spiky or round class. That keeps the counter readable from shape alone.
- **Wilds stay invented.** Wilds names never hit the lexicon, so they keep layers 1 and 2 only.

## Known limits

- BTTV's image server does not allow cross-origin use, so BTTV emotes are recognized and named but get a generated face instead of their image.
- Twitch IRC does not report sub tiers, so all emotes are common rarity until M3.6.
