# Roadmap

## Milestone 1: Playable core (done)

- TypeScript, Vite, Phaser 4, and Vitest project with GitHub Pages deploys.
- Monster generator layers 1 and 2: identity and form. Sound symbolism, syllables, vowels, clusters, Scrabble rarity, swarms, stretching, casing, punctuation, palindromes, and leetspeak.
- Curated archetypes for ten popular emotes and three meme numbers.
- Twitch chat with no login, including moderator deletes, timeouts, and bans.
- 7TV, BTTV, and FFZ emotes, global and per channel. Emote images become monster faces.
- Threat budget per wave, merging into titans and swarms, per-viewer caps, and carry-over for words that did not fit.
- The Wilds: invented, visibly generated monsters from their own portal.
- Three towers, sixteen quirks, tower adaptation, a fifteen-wave run, and a balance bot.
- Inspect panel that explains how a word shaped its monster.

## Milestone 2: Meaning (next)

The generator's biggest gap. Today "snail" and "rocket" differ only by how they sound.

- Build the offline lexicon pipeline: embeddings projected onto the eight semantic axes, plus category, part of speech, and frequency.
- Layer 3: meaning drives stats and element.
- Layer 4: word families set body plans.
- Layer 5: verbs become abilities and adjectives become auras.
- Elements, plus at least two elemental towers to counter them.
- Typo mutants and prefix and suffix effects.

## Milestone 3: Emotes go deep

- Emote image analysis: palette sets element, silhouette sets shape, animation sets rhythm.
- Emote name splitting, so the suffix of `pokiHype` feeds the word pipeline.
- Twitch sub tiers as rarity. Needs a Twitch app and OAuth.
- 7TV zero-width emotes as modifier genes.
- The Emote Studio setup screen.

## Milestone 4: Chat as a force

- Boss votes with Twitch polls or `!vote`.
- Channel point redemptions through EventSub. Needs a Twitch app and OAuth.
- Crowd layer: synonym fusion, antonym clash, rhyme chains, and tower sabotage.
- Bestiary with discovery credit, and evolution during a run.

## Milestone 5: Polish and reach

- Art pass on the sticker style, sound, and music.
- Tower upgrades and more maps.
- YouTube and Kick chat.
- Desktop build for Steam.

## Known limits

- BTTV's image server does not allow cross-origin use, so BTTV emotes are recognized and named but get a generated face instead of their image.
- Twitch IRC does not report sub tiers, so all emotes are common rarity for now.
