# Chat Tower Defense: Design Doc

Status: milestones 1 and 2 are playable. Words now carry meaning. See [ROADMAP.md](ROADMAP.md).

## Pitch

The streamer plays a tower defense game. Chat is the enemy spawner. Each emote, word, or vote turns into a monster whose traits come from the text itself. Towers are strong or weak against kinds of monsters, so the streamer reads chat to plan defenses and chat learns what beats the streamer's build.

## Core loop

1. **Build phase.** The streamer spends gold on towers. Chat sees the defense on stream.
2. **Spawn window.** For a short window, chat messages are collected and converted into monsters.
3. **Wave.** Monsters walk the path. Towers fire. Leaks cost lives.
4. **Payout.** The streamer earns gold based on the threat that was sent, not only what was killed.
5. Every few waves, chat votes on a **boss**.

## Monster generation

This is the most unique part of the game and has its own document: [MONSTER_GENERATION.md](MONSTER_GENERATION.md).

In short, each token passes through eight gene layers: identity, form, meaning, category, role, emote, crowd, and history. A monster's look, stats, and abilities come from what the word means, how it sounds, what kind of thing it names, and its part of speech. Channel emotes add their image colors, shape, name, and subscriber tier. What the rest of chat is doing at the same moment can merge, fuse, or cancel monsters.

## Towers and counters

Towers counter monster tags, and tags come from the generator.

- **Element:** fire, frost, storm, venom, stone, spirit.
- **Family:** beast, construct, food, person, body, place, elemental, abstract, sound, meme.
- **Form:** spiky monsters are weak to blunt damage. Round monsters are weak to piercing damage.
- **Special:** stealth monsters need detector towers. Fliers ignore ground blockers.

Each tower hits one or two tags hard and is weak against one. Towers also gain bonus damage against species they have killed many times, so chat must keep changing what it sends.

### Towers (shipped)

| Tower | Hotkey | Cost | Damage kind | Role |
|---|---|---|---|---|
| Needle | 1 | 50 | pierce | Fast single target, half armor. Strong vs round, weak vs spiky. |
| Hammer | 2 | 75 | blunt | Slow splash. Strong vs spiky and swarms, weak vs round. |
| Frost | 3 | 65 | cold | Pulse that slows everything in range and ignores armor. |
| Flame | 4 | 70 | fire | Short range. Sets targets burning; burn ignores armor. |
| Tesla | 5 | 85 | shock | Lightning that chains to three more monsters. |

### Element matchups (shipped)

Each element resists one damage kind (0.7x) and is weak to one (1.4x). These multiply with the shape counter.

| Element | Weak to | Resists |
|---|---|---|
| Fire | Frost | Flame |
| Frost | Flame | Frost (and half the slow) |
| Storm | Needle | Tesla |
| Venom | Flame | Hammer |
| Stone | Tesla | Needle |
| Spirit | Tesla | Hammer |

About 60 percent of Wilds monsters carry a random element, in a muted color, so offline play still teaches the counters.

## Scaling and balance

A 20,000-viewer chat cannot be allowed to send 20,000 times the monsters of a 20-viewer chat.

- **Threat budget per wave.** The level sets a fixed budget. Chat decides how to spend it, not how big it is.
- **Fixed stat budget per monster.** Genes decide how a monster's points are split, never how many it gets. Rarer monsters get more points but cost more of the wave budget.
- **Message merging.** Duplicate messages stack into a horde or a titan. Popularity buys power within the budget.
- **Popular first, nothing lost.** The most-sent species spend the budget first. Species that do not fit wait for the next wave instead of vanishing, and the panel shows which ones are waiting.
- **Per-user cap.** Each viewer contributes at most one or two monsters per spawn window.
- **Gold follows threat.** The streamer's income scales with the threat chat spent. Chat monsters pay 50 percent more bounty than the Wilds, because chat sends cleverer monsters.
- **Titans are slow.** A merged titan's speed divides by its size, so a big spam titan is a slow tank rather than a fast leak.
- **Chat size normalization.** Sample messages so big and small chats feel equally dangerous at the same level.

## The Wilds: simulated monsters

When chat is quiet or absent, the game fills the gap with monsters from the Wilds. Wild monsters must never look like they came from chat.

- **No fake chat.** No invented usernames and no fake chat lines anywhere.
- **Invented names.** Wild species get made-up names from a syllable generator, such as Vorlag or Quibbit. They never use real words or emotes.
- **Distinct look.** Wild monsters have their own visual treatment, such as a muted palette or a glitch outline, and a WILD tag on the nameplate.
- **Separate spawn point.** They enter from their own portal on the map.
- **Visible split.** The HUD shows how much of each wave came from chat and how much from the Wilds.
- **Same rules.** Invented names still pass through the identity and form layers, so wild monsters are varied and follow the same counters.

Three modes use this:

- **Blended.** If real chat fills less of the threat budget than a threshold, the Wilds fill the rest.
- **Offline.** All monsters come from the Wilds. Good for practice and for players who do not stream.
- **Chat only.** No Wilds at all, for streamers with busy chats.

## Chat interactions

- **Spam to spawn.** Emotes, single words, and short adjective-noun-verb combos during the spawn window.
- **Boss votes.** Chat picks from three generated boss candidates. Use the platform's native polls where available, or `!vote 1` as a fallback.
- **Named monsters.** Monsters can carry the name of the viewer who spawned them.
- **Bestiary credit.** The first viewer to spawn a species on a channel is credited with discovering it.
- **Channel points and other currencies.** Redemptions can help or hurt.
  - Hurt: spawn an elite, speed up the wave, fog the map, disable a tower briefly.
  - Help: heal the base, drop gold, freeze the wave, buff a tower.
  - Bits, Super Chats, and subs could map to bigger events. These must be opt-in by the streamer.

## Safety and moderation

Monster names and chat words appear on stream, so this matters for platform terms of service.

- Blocked words produce nothing at all, so there is no reward for typing them.
- Honor the platform's own moderation. Messages deleted by mods, and messages from timed-out or banned users, should despawn or never spawn.
- Give the streamer a blocklist and a toggle for showing usernames.

## Tech stack

**Decision: TypeScript, Vite, and Phaser.**

- **Easy chat integration.** Twitch chat and Twitch EventSub, which carries channel point redemptions, both run over WebSockets straight from the browser. The YouTube Live Chat API is plain HTTPS.
- **Easy publishing.** One web build runs on itch.io, on GitHub Pages, and as an OBS browser source.
- **Desktop later.** The same build can be wrapped with Tauri or Electron for Steam.
- **Testable core.** The monster generator is plain TypeScript with no engine code, tested with Vitest.

Suggested layout:

```
src/genome/    monster generator, pure functions, no Phaser
src/chat/      one adapter per platform plus the Wilds, all emitting the same events
src/game/      Phaser scenes, towers, pathing, UI
tools/lexicon/ offline scripts that build the meaning data
```

| Platform | Chat | Points or votes | Notes to verify |
|---|---|---|---|
| Twitch | IRC over WebSocket with the anonymous login. Built. | EventSub channel point redemptions, Polls API | Channel points require Affiliate or Partner and a Twitch app. |
| YouTube | Live Chat API | No channel points | API quota limits how often chat can be polled. |
| Kick | Public API and webhooks | Check current support | Webhooks may need a small relay server. |

## Art direction

Not decided yet. The style must tolerate heavy procedural variation and must show emote images well.

1. **Sticker style (recommended).** Monsters are layered vector parts with a thick white outline, and the emote is a sticker face. Emotes already look like stickers, generated parts combine cleanly, and it is cheap to produce.
2. **Modular pixel art.** Emotes are downscaled into pixel faces on pixel bodies. Nostalgic, but generated combinations are harder to make look good.
3. **Neon vector.** Glowing geometric shapes. Very readable spiky and round forms, but emote images clash with the style.

## Session length

Short runs of about 20 minutes suit streams better than an endless mode.

## Milestones

The first milestone is done: a playable game with Twitch chat, third-party emotes, the Wilds, three towers, and the first two generator layers. The full plan is in [ROADMAP.md](ROADMAP.md).

Third-party emotes from 7TV, BTTV, and FFZ are recognized in chat. 7TV, FFZ, and Twitch emote images become monster faces. BTTV images cannot be used in WebGL because their server does not allow cross-origin access.
