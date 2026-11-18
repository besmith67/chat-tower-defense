# Lexicon data

`npm run lexicon` builds `src/genome/data/lexicon.json` from:

- **seeds.tsv**: hand-scored meanings for the words chat types most. Edit this file to change what a word means.
- **WordNet 3.1** (`wordnet-db`, dev only): parts of speech, families, synonyms, and the links that spread seed meanings to neighbors. WordNet is © Princeton University, used under the WordNet License.
- **SUBTLEX-US** word counts (`subtlex-word-frequencies`, dev only): how common a word is, which decides rarity. ISC license.

The generated JSON is committed, so the game builds without running the tool. Rebuild and commit it whenever `seeds.tsv` or the builder changes. Rebuilding changes species, so treat seed edits as balance changes.
