# Monster Generation

The generator is the heart of the game. It turns any chat token into a monster. A token can be a word, a Twitch emote, a third-party emote, an emoji, or a short phrase.

## Goals

1. **Deterministic.** The same token always produces the same base species. Chat can learn, share, and theorycraft. Community wikis become possible.
2. **Meaningful.** A monster behaves like what it says. `snail` is slow. `rocket` is fast. `ghost` phases through things.
3. **Readable.** The streamer can judge a threat in about a second from shape, color, and tags.
4. **Fair.** No token is strictly the best. Genes decide how a fixed stat budget is spent. Matchups decide value.
5. **Deep.** Chat should keep discovering combos and secrets for weeks.
6. **Safe.** Hateful text never spawns anything.

## Pipeline

```
chat message
  -> normalize and tokenize
  -> classify each token: channel emote, global emote, emoji, word, username, number
  -> run gene layers 1 to 8
  -> genome
  -> allocate the stat budget
  -> assemble the body
  -> spawn
```

| Layer | Reads | Decides |
|---|---|---|
| 1. Identity | Hash of the normalized token | Seed, cosmetic variation, species name |
| 2. Form | Letters, sounds, casing, punctuation | Shape, size, segments, spikes, quirks |
| 3. Meaning | What the word means | Stat allocation and element |
| 4. Category | What kind of thing the word is | Body plan and family |
| 5. Role | Part of speech | Abilities and auras |
| 6. Emote | Emote image, name, and tier | Element, rarity, signature ability |
| 7. Crowd | What the rest of chat is doing | Merging, fusion, combos, sabotage |
| 8. History | Past waves and past streams | Evolution, adaptation, discovery credit |

Every layer is optional. A token with no meaning, such as a made-up word, still gets a full monster from layers 1 and 2. A known word gets layers 1 to 5. A channel emote gets everything.

---

## Layer 1: Identity

- **Normalization.** Lowercase for lookup. Collapse elongation, so `noooooo` becomes `no` and remembers the stretch count. Undo leetspeak, so `h4x0r` becomes `haxor` and gains a cyber tag. Strip punctuation but keep it as a modifier.
- **Seed.** A stable hash of the normalized token. The seed fills in everything the other layers leave open: exact hue, eye placement, small stat jitter, idle animation.
- **Global words, local emotes.** A plain word produces the same species on every channel, so knowledge carries across streams. A channel emote is unique to that channel.

## Layer 2: Form

How the word looks and sounds. This layer alone must produce an interesting monster, because it is the fallback for unknown tokens.

- **Sound symbolism.** People everywhere link sharp sounds to spiky shapes and soft sounds to round ones. This is known as the bouba/kiki effect, and it gives us readable shapes for free.
  - Sharp sounds such as k, t, p, z, x, and short i give an angular, spiky body. These monsters are fast and fragile and deal piercing contact damage.
  - Round sounds such as b, m, l, o, and u give a blobby, bouncy body. These monsters are slow with high health.
  - Spiky monsters are weak to blunt towers. Round monsters are weak to piercing towers.
- **Syllables** set the number of body segments, like a caterpillar.
- **Vowels** set the number of eyes. Consonant clusters such as `str` or `ckt` add spikes or horns.
- **Length** sets body size and its share of health.
- **Scrabble letter values** set power density. Words full of Q, Z, X, and J are elite but cost more of the wave budget.
- **Repeated letters** such as `HHHHHH` produce a swarm of small copies.
- **Elongation** such as `nooooo` produces a stretched monster with more health and less speed.
- **Casing.**
  - ALL CAPS: enraged. It speeds up as it takes damage.
  - aLtErNaTiNg CaSe: mocking. It taunts towers and pulls their fire, acting as a decoy.
  - Title Case: checked against usernames and proper nouns.
- **Punctuation.** A trailing `!` gives a charge attack. A `?` makes the monster confused, so it switches lanes at random. A `...` makes it drowsy and slow but harder to spot.
- **Palindromes** such as `racecar` or `kayak` become mirror monsters that reflect some projectiles.
- **Meme numbers** such as `69`, `420`, and `1337` are curated specials. Other numbers multiply the count of the next monster and split its budget.
- **Text emoticons** such as `:)` and `D:` set the monster's mood.

## Layer 3: Meaning

What the word means drives what the monster does. This is the layer that makes chat feel clever.

### Semantic axes

Each word is scored on a set of axes from -3 to +3. Each axis is defined by anchor words at both ends.

| Axis | Low end | High end | Effect |
|---|---|---|---|
| Speed | slow, sluggish, crawl | fast, quick, rocket | Movement speed |
| Mass | tiny, speck, crumb | huge, giant, mountain | Size and health |
| Hardness | soft, squishy, jelly | hard, steel, stone | Armor |
| Heat | cold, frozen, ice | hot, burning, lava | Fire vs ice element lean |
| Life | dead, undead, bone | alive, living, growing | Undead vs regenerating |
| Mood | friendly, kind, hug | hostile, angry, rage | Support vs aggressive |
| Order | calm, orderly, still | chaotic, wild, random | Predictable vs erratic pathing |
| Presence | quiet, hidden, shadow | loud, bright, boom | Stealth vs visible |

A word lands wherever its meaning puts it. `snail` scores slow, small, and soft-shelled. `avalanche` scores fast, huge, cold, and chaotic.

### Element

One of six elements, or neutral: fire, frost, storm, venom, stone, and spirit. Ten elements were too many to read at a glance on stream. Element sets the body color: fire is red, frost is cyan, storm is yellow, venom is green, stone is a dull brown, and spirit is purple.

### How meaning changes the monster (shipped)

- **Stats.** Speed, mass, and hardness bend the speed, health, and armor weights. A full-strength axis moves a stat more than the sharpest spelling, so meaning outranks sound. The total budget never changes.
- **Size.** Mass scales the body by up to 27 percent either way.
- **Shape stays with sound.** Meaning never changes the spiky or round class, so the Needle and Hammer counter still reads from shape alone.
- **Quirks.** The two strongest axes can each add one behavior, up to three quirks in total. Quirks chat typed on purpose, from casing and punctuation, come first.

| Axis value | Quirk |
|---|---|
| Life +2 or more | Regen: heals over time |
| Life -2 or less | Undying: gets back up once at 35 percent health |
| Presence -2 or less | Stealth: towers see it at 80 percent range, drawn translucent |
| Presence +3 | Mocking: towers must shoot it first |
| Mood +3 | Enraged |
| Order +3 | Confused |

### Other meaning signals

- **Word rarity.** Obscure words such as `defenestrate` or `petrichor` become elites. A big vocabulary is a chat skill.
- **Typos.** A token within one or two edits of a known word, such as `fier`, spawns a mutant of that word with one random mutation from the seed. Typos are never wasted.
- **Prefixes and suffixes.**

| Affix | Effect |
|---|---|
| mega-, ultra-, giga- | Bigger, fewer |
| mini-, -let, -ling | Smaller, more numerous |
| un-, anti- | Flips the root word's strongest axis |
| -est | Superlative, so elite |
| re- | Revives once |
| -ify, -ize | Transforms partway down the path (not built yet) |

**Shipped.** Affixes and typos apply only to tokens the lexicon does not already know, so `return` stays a word and is never re- plus `turn`. Mega, ultra, and giga add 2 mass and make an elite. Mini, -ling, and -let make a pack of three. Un- and anti- flip the strongest axis, and flipping heat swaps fire and frost. -est makes an elite. Re- adds Undying. A typo is any token one edit away (swap, missing, extra, or wrong letter) from a common word of four or more letters; it takes that word's meaning plus one seeded mutation from enraged, charge, shielded, regen, hop, or splitter. Emote names never count as typos. -ify and -ize need a mid-path transformation with new art and are left for later.

### How the meaning data is built

This runs offline at build time (`npm run lexicon`), not during play. See `data/lexicon/README.md`.

1. The vocabulary is every single-word WordNet lemma that appears in SUBTLEX-US subtitle counts at least twice, plus hand-written seeds for slang WordNet lacks. About 34,000 words.
2. WordNet gives each word its parts of speech, ranked by how often each sense is used, and its family from the lexicographer file of its main noun sense.
3. Hand-scored seeds in `data/lexicon/seeds.tsv` give axis scores and elements for about 500 words chat is likely to type.
4. Seed meanings spread through WordNet: synonyms copy a seed, and hypernym, similar-to, derivation, and antonym links pass on a weakened or negated copy. Glosses add small nudges for anchor words like "fast" or "poison".
5. Subtitle counts give the rarity. Uncommon words of five letters or more become elites. Seeds are never rare.
6. The result ships as a grouped JSON file of about 390 KB. The game needs no model at runtime and works offline.

Embeddings were the original plan. WordNet plus seeds was chosen instead because it is small, explainable, and needs no model download. Embeddings can be added later if coverage feels thin.

Tokens outside the vocabulary skip this layer and rely on form, typos, and affixes.

## Layer 4: Category

The kind of thing a word names sets its family and body plan. Shipped: families come from the WordNet lexicographer file of a noun's main sense, or from the seed file. Only words used mainly as nouns get a family; verbs and adjectives are handled by Layer 5. Body plans add parts around the shape (legs, wheels, a halo) and never change the spiky or round outline.

Shipped traits are deliberately small: beast none, construct +armor and wheels, food heals neighbors 15 percent on death, person dodges 15 percent of Needle and Flame shots, body part floats and ignores Frost slows, place has 15 percent more health and 10 percent less speed, elemental squares its element multipliers and halves armor, spirit (abstract) takes 0.8x from Needle and Hammer, sound shouts every 5 seconds to stun towers within 75 px for half a second, and meme has a 30 percent chance to leave a smaller copy on death. Weather is renamed Elemental and Abstract shows as Spirit on screen.

| Family | Example words | Body plan | Signature trait |
|---|---|---|---|
| Beast | wolf, snail, cat | Critter on legs | Natural, no special resistances |
| Construct | truck, hammer, robot | Wheels, treads, plating | Armored, weak to storm and rust |
| Food | pizza, taco, cake | Blob | Leaves a snack on death that heals nearby monsters |
| Person | knight, wizard, mom | Biped | Gets a skill from its role |
| Body | eye, hand, tooth | Floating part | An eye reveals stealthed allies |
| Place | mountain, river, cave | Walking terrain | Matches the place: rivers flow fast, mountains lumber |
| Weather | storm, fog, fire | Elemental wisp | Pure element, low armor |
| Abstract | love, chaos, time | Spirit | Resists physical damage, weak to arcane |
| Sound | boom, zoom, bonk | Effect creature | Fires its sound as an instant ability |
| Meme | pog, sus, ratio, gg | Curated | Hand-designed abilities |

## Layer 5: Role

Part of speech decides what a token contributes.

- **Nouns are bodies.** A noun is the monster itself.
- **Verbs are abilities.** The monster does the verb. Every verb maps by meaning to the nearest ability in a catalog of about thirty implemented abilities. `sprint`, `dash`, `zoom`, and `hurry` all map to Sprint with different strength.

| Verb examples | Ability |
|---|---|
| jump, hop, leap | Hops over a blocker |
| dig, burrow, tunnel | Untargetable underground for a stretch |
| hide, sneak, lurk | Stealth until close to a tower |
| heal, mend, fix | Heals neighbors |
| split, divide, clone | Splits on death |
| steal, rob, yoink | Steals gold if it reaches the base |
| explode, pop, boom | Damages or stuns a tower on death |
| blink, teleport, warp | Skips ahead along the path |
| throw, toss, defenestrate | Hurls a nearby monster forward |

- **Adjectives are auras.** A lone adjective spawns a small herald that buffs the next few monsters. `angry` makes them enraged. `sleepy` slows them but makes them tougher.

**Shipped version of Layer 5.** About 120 verbs map to eight abilities, from seed verbs in `tools/lexicon/build.ts` plus their WordNet synonyms and close links. Each ability is a sim quirk:

| Ability | Seed verbs (examples) | Quirk |
|---|---|---|
| Sprint | run, dash, rush, flee, zoom | Charge: bursts of speed |
| Hop | jump, leap, bounce, yeet | Hop: leaps 45 px every 3 seconds |
| Burrow | dig, tunnel, drill | Burrow: untargetable 1.2 of every 5 seconds |
| Stealth | hide, sneak, lurk | Stealth: towers see it at 80 percent range |
| Heal | heal, mend, fix, repair | Healer: neighbors within 70 px heal 3 percent per second |
| Split | split, clone, multiply | Splitter: three minis on death |
| Steal | steal, rob, yoink, loot | Thief: takes gold when it leaks |
| Explode | explode, burst, blast | Stunburst: stuns the nearest tower on death |

A lone adjective becomes a herald with a 90 px aura instead of the "next few monsters" idea, because an aura is visible on stream. The aura passes on the adjective's meaning: speed changes neighbors' speed by 6 percent per point, hardness or mass cuts their damage taken by 6 percent per point, and life heals them 1 percent per point per second. Verbs and adjectives get small bodies. Grammar combos such as `angry snail dig` are still planned.
- **Grammar combos.** A message can hold up to one adjective, one noun, and one verb, such as `angry snail dig`. It costs more budget than a single word, so single words still matter. This turns chat into a crafting language.

## Layer 6: Emotes

Emotes are what chat will spam most, so they get the richest treatment.

### Sources

Twitch global emotes, Twitch channel emotes, 7TV, BTTV, FFZ, YouTube channel emoji, and Kick emotes.

### Reading the emote image

- **Palette.** The dominant colors pick the element. Red and orange lean fire, blue leans ice, green leans nature or poison, yellow leans storm, purple leans arcane, gray leans metal, and very dark images lean shadow.
- **Silhouette.** The transparency mask sets the hitbox and movement style. Wide shapes crawl, tall shapes walk, and round shapes roll.
- **Edge sharpness.** Jagged outlines push toward spiky form. Smooth outlines push toward round form.
- **Animation.** Animated emotes are phasing monsters. Frame count sets the rhythm of their ability. (Not built: a canvas only sees the first frame.)
- **Shipped.** The game reads each emote's image once at 32 by 32 pixels. Palette sets the element and the body color; a mostly gray image is Stone and a mostly dark one is Spirit. Outline roughness is averaged with the name's sound to set the form, but only when the emote has a transparent background. Wide silhouettes get more health and tall ones more speed. The inspect panel says what the image contributed.
- **The emote is the face.** The image is drawn onto the generated body, so every monster looks like the emote chat typed.

### Reading the emote name

Channel emotes are usually a channel prefix plus a meaningful suffix, as in `pokiHype` or `xqcL`. The generator splits the name and runs the suffix through the word pipeline. Common suffixes such as Hype, Love, Rage, Sad, Pog, W, L, Hi, Sleep, Clap, and GG are curated (shipped in `src/genome/emoteName.ts`). In an emote name, L means love and W means win. Third-party emotes often pair a creature with an action, as in `catWait` or `peepoHappy`; a noun prefix lends its body plan when the suffix is not a noun.

### Rarity from entitlement

Viewers can only type an emote they are entitled to, so the platform gates rarity for us.

| Emote source | Rarity |
|---|---|
| Third-party emotes from 7TV, BTTV, or FFZ | Common |
| Twitch global | Common, curated |
| Follower emote | Uncommon |
| Tier 1 sub emote | Rare |
| Tier 2 sub emote | Epic |
| Tier 3 sub emote | Legendary |
| Bits emote | Special |

Rarer monsters are stronger and cost more of the wave budget.

### Zero-width emotes

7TV zero-width emotes overlay the emote before them. They become modifier genes on that monster, such as a hat, rain, or flames. A layered emote is literally a layered monster. Shipped: the layered monster is a separate species, an elite, takes the overlay's element, and wears the overlay image.

### Curated archetypes

The most popular global and third-party emotes get hand-designed signatures. Some ideas:

| Emote | Signature |
|---|---|
| Kappa | Trickster. Disguised as a different monster until hit. |
| KEKW | Laughs on death and stuns the nearest tower briefly. |
| LUL | Splits into laughing minis. |
| PogChamp | Hype aura that speeds up neighbors. |
| monkaS | Panics and sprints when targeted. |
| Copium | Heals itself after big hits. |
| Sadge | Gloom aura that slows nearby towers' fire rate. |
| catJAM | Moves in bursts on a beat. |
| EZ | Ignores the first hit. |
| OMEGALUL | Huge rolling laugh orb. |

### Emote Studio

A setup screen for the streamer.

1. The game fetches the channel's emotes from Twitch and the third-party services.
2. It generates a species for each one automatically.
3. The streamer reviews them. They can rename a species, pick its signature ability from the catalog, add lore, disable it, or mark it as a boss candidate.
4. The channel's signature emote can become the channel's final boss.

Emoji follow the same path as words, so 🔥 reads as `fire`. Shipped: the lexicon build maps each emoji to one word from its emojilib keywords, preferring its one-word name, then a seeded word, with hand overrides for chat meanings (😂 is laugh, 💀 is skull, 🧢 is nocap). An emoji keeps its own species and is drawn as the monster's face. A run of the same emoji is a swarm of up to six.

## Layer 7: Crowd

What the rest of chat does in the same window changes the result.

- **Burst merging.** Copies of the same species within a few seconds merge. Swarm-type species form a horde. Others form a titan whose size grows with the count.
- **Synonym fusion.** Different words with close meanings fuse. `big`, `huge`, and `giant` together make a colossus that carries all three names.
- **Antonym clash.** Opposites in the same window, such as `hot` and `cold`, annihilate each other or fuse into an unstable hybrid. Part of chat can sabotage the rest of chat.
- **Rhyme chains.** Rhyming words spawned back to back link into a conga line that shares a shield.
- **Alliteration.** Words with the same first sound move as a linked pack.
- **Copypasta.** A long identical message repeated by many viewers becomes a boss candidate.
- **Tower sabotage.** Words close in meaning to a tower or its weakness spawn saboteurs that go after that tower type. `rust` targets metal cannons. `ground` targets lightning towers. `mirror` targets lasers. Chat watches the build and types the counter. This is the most direct chat-versus-streamer counterplay.
- **Mentions.** An `@user` mention puts that viewer's name on the monster, if the streamer allows it. Typing the streamer's name spawns a rare doppelganger.

## Layer 8: History

- **Bestiary.** Each channel keeps a bestiary. The first viewer to spawn a species discovers it and is credited forever.
- **Evolution.** A species that reaches the base gains experience and evolves during the run, so `KEKW` can become `KEKW Prime`.
- **Tower adaptation.** Towers gain bonus damage against species they have killed many times. Spamming one word gets weaker over a run, so chat has to keep inventing. This is the core loop of both sides adapting to each other.

---

## Stat budget

Every monster gets threat points from the wave. Genes decide how those points are split across health, speed, armor, and ability strength. Genes never add points. Rarity multiplies a monster's points and also multiplies its cost against the wave budget. That keeps every word viable and makes matchups the deciding factor.

## Readability

- The nameplate shows the token as typed and, if enabled, the viewer who sent it.
- Up to three tag icons show element, family, and form.
- Shape shows form, color shows element, and size shows mass.
- An inspect panel and the bestiary show the full genome.
- An optional weakness board shows chat which tags the current defense handles worst, which drives engagement.

## Worked examples

| Token | Read as | Result |
|---|---|---|
| `snail` | Beast noun. Slow, small, hard shell. Round sounds. | Slow round crawler with high health and shell armor. Weak to piercing. |
| `rocket` | Construct noun. Very fast and hot. | Fast armored dart with a fire lean. Weak to storm. |
| `dig` | Verb with no noun. | Small burrower that goes untargetable for stretches. |
| `fier` | Typo of `fire`. | Mutant fire wisp with one random mutation. |
| `zzzzz` | Repeated letters. High-value Z. Means sleep. | Drowsy swarm. Slow, tough, and hard to spot. |
| `KEKW` | Curated emote. | Laughing orb that stuns the nearest tower when it dies. |
| `pokiHype` | Tier 3 channel emote. Pink palette. Suffix Hype. | Legendary arcane elite with an aura that speeds neighbors. |
| `angry snail dig` | Adjective, noun, verb. | Enraged burrowing snail. |
| `rust` | Means corrosion of metal. | Saboteur that targets metal towers. |
| `racecar` | Palindrome. Fast construct. | Mirror racer that reflects some projectiles. |
| `defenestrate` | Rare verb. | Elite that hurls nearby monsters past a tower. |

## Safety

- Blocked words produce nothing at all, not even a generic monster, so there is no reward for typing them.
- The meaning data is curated and never gives slurs a meaning.
- Messages deleted by moderators despawn their monsters.
- Showing usernames is opt-in for the streamer.

## Build order

The full system is too much for one step. Ship it in phases.

| Phase | Contents | Status |
|---|---|---|
| 1 | Identity, form, curated emotes, burst merging, emote images as faces | Done |
| 2 | The meaning data, categories, and verbs as abilities | Done |
| 3 | Emote image analysis, the Emote Studio, and grammar combos | Next |
| 4 | Rhymes, antonyms, sabotage, evolution, and the bestiary | Planned |

The implementation lives in `src/genome`. Tower adaptation from Layer 8 shipped early because it is cheap and central to the loop.

## Open questions

- Slang changes fast. The meaning data needs a way to update, possibly with community suggestions.
- Hidden genes are good for discovery, but the top-level tags must stay simple.
- Rebalancing changes species. The meaning data should be versioned so a species changes only on purpose.
- Reading pixels from emote images requires the image hosts to allow cross-origin access. This needs checking for each host.
