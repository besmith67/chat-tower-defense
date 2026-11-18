# Chat Tower Defense

A tower defense game where the streamer defends and the chat attacks.

Viewers on Twitch spam words and emotes. Every word becomes a monster shaped by the word itself: what it means, how it sounds, how it is typed, and which emote it is. The streamer builds towers that counter those monsters, so both sides keep adapting to each other. Streams with a quiet chat, or no chat at all, get monsters from the Wilds, which are visibly generated and never pretend to be chat.

**Play it:** https://besmith67.github.io/chat-tower-defense/

## How to play

1. Pick who sends monsters. **Blended** mixes chat and the Wilds. **Chat only** is for busy chats. **Offline practice** uses only the Wilds.
2. Enter your Twitch channel name. Reading chat needs no login.
3. Optional: open the **Emote Studio** to see what each of your channel's emotes becomes. Rename them, disable ones you don't want, give them a signature ability, or mark boss candidates. Choices are saved in your browser.
4. During each build phase, chat types single words or emotes. They appear in the panel on the right.
5. Build towers that counter what is coming, then start the wave.

| Tower | Damage | Strong against | Weak against |
|---|---|---|---|
| Needle | Fast piercing shots, ignores half of armor | Round monsters, Storm | Spiky monsters, Stone |
| Hammer | Slow blunt splash | Spiky monsters and swarms | Round monsters, Venom, Spirit |
| Frost | Slowing cold pulse on everything in range | Fire, fast monsters | Frost |
| Flame | Short-range fire that leaves targets burning | Frost, Venom | Fire |
| Tesla | Lightning that chains to three more monsters | Stone, Spirit, crowds | Storm |

A monster's color shows its element: red fire, cyan frost, yellow storm, green venom, brown stone, purple spirit. Hover a monster to see exactly what it is weak to.

Towers also get stronger against species they have killed many times, so chat has to keep changing what it sends.

Chat can also sabotage. Counter words jam a tower type as they walk past it: water, rain, or flood jam Flame; melt, heat, or sun jam Frost; ground, mud, or rubber jam Tesla; armor or shield jam Needle; pillow, jelly, or foam jam Hammer. Spreading tower types out keeps one word from shutting the defense down.

The bestiary (B) remembers every species your chat has sent and credits the viewer who discovered it. A species that gets through three times in one run evolves into its Prime form.

Every fifth wave is a boss wave. Chat votes with `!vote 1`, `!vote 2`, or `!vote 3` on which of its favorite monsters becomes the boss.

### Controls

| Key | Action |
|---|---|
| 1 to 5 | Pick a tower to build |
| Click | Build, or select a tower |
| Esc or right click | Cancel |
| U | Upgrade the selected tower (two levels; level 3 adds a perk) |
| S | Sell the selected tower |
| Space | Start the wave early |
| F | Cycle game speed |
| B | Open the bestiary |
| M | Mute or unmute |
| \` | Open the test chat box to type as if you were chat |

### URL options

Skip the setup screen by adding options to the URL. This is handy for an OBS browser source.

```
?channel=yourname&mode=blended&names=1&autostart=1
```

`mode` is `blended`, `chat-only`, or `offline`. `names=0` hides viewer names.

## How chat words become monsters

Read [docs/MONSTER_GENERATION.md](docs/MONSTER_GENERATION.md) for the full design. In the current build:

- **Meaning drives behavior.** About 34,000 English words and Twitch slang carry meaning. `snail` is slow and armored, `rocket` is a fast fire construct, `ghost` is a stealthy spirit that gets back up once, and rare words like `quixotic` are elites. Meaning also sets the element.
- **What kind of thing it is sets the body.** Beasts walk on legs, constructs roll on armored wheels, food leaves a healing snack, sound words shout and stun towers, and memes wear shades and go viral.
- **Verbs do things, adjectives buff.** `dig` burrows underground, `heal` heals its neighbors, `steal` takes gold if it gets through, and `jump` hops ahead. A lone adjective like `angry` or `fast` becomes a herald whose aura passes that meaning on.
- **Typos and affixes count.** `fier` is a mutant fire, `megasnail` is a giant elite snail, `minisnail` is a pack, `unfire` is frost, and `resnail` gets back up.
- **Sound shapes the body.** Sharp sounds like k, t, and z make spiky, fast monsters. Soft sounds like b, m, and o make round, tanky ones.
- **Letters add detail.** Syllables become tail segments, vowels become eyes, and consonant clusters become horns. High Scrabble-value words become elites.
- **Typing style adds quirks.** ALL CAPS enrages. aLtErNaTiNg case taunts towers. A trailing `!`, `?`, or `...` adds a charge, confusion, or drowsiness. Palindromes reflect hits, and l33tspeak adds armor.
- **Repeats and spam matter.** "hahaha" becomes a swarm. Many viewers sending the same word merge it into a titan.
- **Emotes wear their own image.** Twitch, 7TV, and FFZ emotes become the monster's face. Popular emotes like KEKW, LUL, and Sadge have hand-designed abilities.

## Development

Requires Node 20.19 or newer.

```
npm install
npm run dev        # local dev server
npm test           # unit tests
npm run build      # production build into dist/
npm run balance    # headless bot plays full runs and reports difficulty
npm run playtest   # scripted visual playtest in headless Chrome (needs `npx vite preview` running)
```

Add `?debug=1` to the URL to expose test hooks on `window.__ctd`.

| Folder | Contents |
|---|---|
| `src/genome` | The monster generator. Pure functions with no game engine code. |
| `src/chat` | Twitch chat, third-party emotes, and the local test chat. All emit the same events. |
| `src/sim` | Game rules: waves, budget, towers, combat. No rendering. |
| `src/game` | Phaser rendering, HUD, and input. |
| `tools` | The balance bot and the scripted playtest. |
| `docs` | Design, monster generation, and roadmap. |

Pushing to `main` deploys to GitHub Pages.
