# Game ideas for later

Ranked by value for effort. Each one fits the single-file architecture: no backend,
no images, Bob reacting through `bobSetStage` / `bobMoment`, and registration through
`CATALOG.push({ key, launch, metaText, progressText })`.

| # | Idea | Why it's worth it | Effort |
|---|------|-------------------|--------|
| 1 | **Brain Bites topic packs**: let players pick one category ("only space") for a round. | The bank and the per-topic breakdown already exist, so this is a filter plus one screen. It gives players a reason to come back to the topics they're weakest in. | XS |
| 2 | **Daily streak calendar** shared across Daily Bites and a daily Memory Matrix seed. | Daily habits are the strongest retention loop for this kind of product. The date-seeded RNG (`ngRng`) is already written. | S |
| 3 | **Brain Twins: party mode for 3–6 players**, scoring every pair and naming the most in-sync duo. | Same prompts and reveal UI, but it suits classrooms and team meetings, which are exactly where a free game spreads. | S |
| 4 | **Odd One Out sprint**: 60 seconds of four emoji/words with one intruder, rules escalating (colour, then category, then hidden property). | Fast, very replayable and language-light. Trains flexible categorisation, and the content is cheap to make. | S |
| 5 | **Estimation Duel**: "How many keys does a piano have?" answered on a slider, scored by how close you are, with a "why" card. | Unlike multiple choice, near misses feel rewarding. It reuses the Brain Bites explanation pattern and makes a good second trivia format. | M |
| 6 | **Pattern Composer**: the player builds a sequence for a friend to solve, and it's shared as a short URL-hash code. | User-made puzzles mean free content, and every shared link brings a new visitor. Needs no server, because the puzzle lives in the hash. | M |
| 7 | **Dual N-Back (gentle)**: a position and a letter-free sound stream, with adaptive N. | The most studied working-memory task. A credible PLUS feature that suits the brand, and the Web Audio code is already in place. | M |
| 8 | **Bob's Mystery Box**: logic grid puzzles ("the owl doesn't sit next to the cat") with draggable tokens. | Deduction is a skill the existing games barely touch. Bob can give graded hints. Puzzles can be generated with a small solver. | L |
| 9 | **Two-player Reaction Split-Screen**: each player holds one half of the phone and taps when their side changes colour. | Physical and loud, and it makes a good companion to Brain Twins at parties. It's harder to make fair and accessible, hence the lower rank. | M |
