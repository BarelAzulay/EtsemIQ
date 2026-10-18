# Etsem.IQ — question audit

Audit of every scored item in the product: the Free Test (30 slots, 61
parallel forms, rebuilt October 2026) and the 31-item Hardcore bank. The
machine-readable half of the Free Test table lives in `index.html` as
`FREE_TEST_AUDIT`, one row per form of `FT_BANK()`. A boot-time check
(`auditSelfCheck()`) warns in the console if the two ever drift apart.
`docs/qa/qa-free-test.mjs` re-verifies every key (§5).

Audited: 2026-09 (first pass), 2026-10 (Free Test rebuild: research in §7,
items in §3, checks in §5, shuffle and score in §8). Auditor: engineering.

---

## 1. Standards applied

Each item was checked against ten questions:

1. What cognitive ability does it actually test?
2. Is it a legitimate reasoning task rather than a puzzle with no principle?
3. Is the difficulty band appropriate?
4. Is the wording clear and unambiguous?
5. Is there exactly one defensible answer?
6. Is the answer key correct?
7. Does it measure reasoning rather than trivia or general knowledge?
8. Does it carry cultural or language bias that would distort a result?
9. Is it fair to describe as an IQ-style / reasoning item?
10. Is there a reputable construct behind the item type?

For the Free Test these questions are backed by machine checks in every one
of the five site languages (**Section 5**): structure and translations,
option distinctness down to the pixel, a solver for every item type that can
be solved in code, a deliberate search for a second rule that would justify
a distractor, the I-RAVEN answer-set shortcut, the shuffle and the scoring.
For Hardcore, the two original checks still apply: unique option signatures
and markup, and well-formed keys, prompts and matrices.

---

## 2. Sources

These are **descriptions of constructs**, not test material. No item in this
product is copied, traced, paraphrased or adapted from any published test, and
no proprietary artwork, option set or answer key is reproduced.

| Key | Source |
|---|---|
| `CJS90` | Carpenter, P. A., Just, M. A., & Shell, P. (1990). *What one intelligence test measures: a theoretical account of the processing in the Raven Progressive Matrices Test.* **Psychological Review, 97**(3), 404–431. <https://doi.org/10.1037/0033-295X.97.3.404> — sets out the rule types matrix items are built from: constant in a row, quantitative pairwise progression, figure addition or subtraction, distribution of three values, distribution of two values. |
| `SM71` | Shepard, R. N., & Metzler, J. (1971). *Mental rotation of three-dimensional objects.* **Science, 171**(3972), 701–703. <https://doi.org/10.1126/science.171.3972.701> |
| `St77` | Sternberg, R. J. (1977). *Component processes in analogical reasoning.* **Psychological Review, 84**(4), 353–378. <https://doi.org/10.1037/0033-295X.84.4.353> |
| `SK63` | Simon, H. A., & Kotovsky, K. (1963). *Human acquisition of concepts for sequential patterns.* **Psychological Review, 70**(6), 534–546. <https://doi.org/10.1037/h0043901> |
| `Bad03` | Baddeley, A. (2003). *Working memory: looking back and looking forward.* **Nature Reviews Neuroscience, 4**, 829–839. <https://doi.org/10.1038/nrn1201> |
| `series` | Standard number-series induction, in group reasoning tests since Thurstone, L. L. (1938). *Primary Mental Abilities.* University of Chicago Press. |
| `logic` | Categorical and conditional reasoning. The errors the items target are affirming the consequent and over-reading a quantifier. |
| `WAIS` | Wechsler, D. (2008). *WAIS-IV Technical and Interpretive Manual*; Pearson (2024), *WAIS-5 overview*, <https://www.pearsonassessments.com/content/dam/school/global/clinical/us/assets/wais-5/wais-5-overview-brochure.pdf>. Published descriptions of Figure Weights, Visual Puzzles, Arithmetic and Similarities. No Wechsler item is used. |
| design | Option sets are built against the answer-set bias described by Hu et al. (2021), *Stratified Rule-Aware Network for Abstract Visual Reasoning*, AAAI, <https://arxiv.org/abs/2002.06838>. Related recall lures follow Roediger & McDermott (1995), *J. Exp. Psychology: LMC* 21(4), 803–814. Full research notes are in §7. |
| Pearson | Raven's Progressive Matrices / Advanced Progressive Matrices product page, Pearson. <https://www.pearsonassessments.com/store/usassessments/en/Store/Professional-Assessments/Cognition-%26-Neuro/Ravens-Progressive-Matrices/p/100000200> — Pearson describes the instrument as measuring high-level observation, clear thinking and non-verbal abstract reasoning / fluid intelligence. That description is why this construct is the right target for a hardest mode. **The instrument itself is not used here, and Hardcore is not a Raven's assessment.** |

### Copyright position

Reading a published description of what a test measures, and then writing
original items that target the same construct, is normal practice and is not
reproduction. What would be reproduction — and is not done anywhere in this
product — is copying an actual item, its figures, its option set or its key.
Every figure in this product is drawn from the primitives in `index.html`:
`GLYPHS`, `dotsSVG` and `figSVG`, plus `wtSVG`/`balanceSVG` (weights and
scales) and `pzSVG`/`pzsSVG`/`pzBoardSVG` (puzzle pieces), added in October
2026. None is traced from anything.

---

## 3. Free Test — item bank (October 2026 rebuild)

The free test has **30 slots**, and every slot holds **parallel forms**: two
per slot, three for the delayed-recall slot, 61 items in all. Forms in a
slot share the construct, the number of rule tokens, the difficulty band and
the option count, and differ only on the surface. Each sitting draws one form
per slot and never repeats the form the same browser drew last time, so a
retake is a different test of the same abilities (`ftNewPlan()`).

| Band | Slots | Weight each | Options |
|---|---|---|---|
| Easy | 1–7 | 1 | 4 |
| Medium | 8–15 | 1.6 | 5, except the syllogism verdict (3) |
| Hard | 16–23 | 2.3 | 5; the matrix and rotation items 6; the conditional verdict 3; delayed recall 4 |
| Extreme | 24–30 | 3.2 | 6, except the truth-teller (4: three names + "no consistent answer") |

Six slots per report category, with weight totals of 11.4–12.9 per category.
The categories are pattern (S01 S06 S08 S18 S24 S28), numerical (S02 S07 S09
S16 S21 S27), spatial (S03 S10 S15 S19 S25 S30), logic (S05 S11 S13 S17 S22
S26) and verbal (S04 S12 S14 S20 S23 S29). The two timed-digit items and the
delayed-recall item are reported under Verbal, because the report has five
fixed categories; digit span sat in the WAIS-III Verbal scale for the same
reason.

What each subtest borrows (constructs only, see §7):

| Subtest | Slots | Construct |
|---|---|---|
| Matrix reasoning | 1, 8, 18, 24, 28 | CJS90 rule types: one rule (easy) up to three tokens at once (extreme) |
| Number series | 2, 9, 16, 27 | constant difference → ratio → second difference → two interleaved strands |
| Figure series | 3, 6, 30 | constant rotation; alternation + progression; two independent rules |
| Figure weights | 5, 13, 22 | balance scales, one to three of them; an original SVG design |
| Rotation vs reflection | 10, 19 | chiral glyphs, quarter turns then 45° steps |
| Visual puzzles | 15, 25 | complete a square; assemble a chiral shape from three pieces (solver-checked) |
| Verbal | 4, 12, 23 | antonym analogy; Similarities as odd-one-out; relational pair analogy |
| Quantitative | 7, 21 | multiply-then-add; combined work rate |
| Logic | 11, 17, 26 | undetermined syllogism; affirming the consequent; truth-tellers |
| Working memory | 14, 20, 29 | 4 and 6 digits backward (shown, then hidden); delayed recognition |

### 3.1 Item table

Generated from `FREE_TEST_AUDIT` in `index.html` (one row per form). "Opts" is
the number of options. Every key was checked by the QA script (§5): by a
solver where the item can be solved in code, and otherwise by recomputation
or by hand, as listed in §5.2.

| ID | Slot · form | Category | Construct | Diff | Opts | Key | Status | Src | Why the distractors fail |
|---|---|---|---|---|---|---|---|---|---|
| S01A | 01 · A | Pattern | matrix: constant in a row (shape) + pairwise progression (count +1) | Easy | 4 | triangle, 3 dots | Approved | CJS90 | triangle·2 stops the count; circle·3 takes the shape from the row above; circle·2 fails both. Shape and count each split 2/2 across the options. |
| S01B | 01 · B | Pattern | matrix: constant in a row (shape) + pairwise progression (count +1) | Easy | 4 | square, 4 bars | Approved | CJS90 | square·3 stops the count; diamond·4 takes the shape from the row above; diamond·3 fails both. Shape and count each split 2/2. |
| S02A | 02 · A | Numerical | arithmetic series, constant difference (+4) | Easy | 4 | 19 | Approved | series | 18 and 20 step by 3 or 5; 23 skips a term (15+8). |
| S02B | 02 · B | Numerical | arithmetic series, constant difference (+6) | Easy | 4 | 28 | Approved | series | 27 and 29 step by 5 or 7; 34 skips a term (22+12). |
| S03A | 03 · A | Spatial | constant angular progression (+90°) | Easy | 4 | flag 270° | Approved | SM71 | 270° mirrored has the right turn and the wrong handedness; 180° repeats the last figure; 0° mirrored goes back to the start, flipped. |
| S03B | 03 · B | Spatial | constant angular progression (+90°) | Easy | 4 | ell 0° | Approved | SM71 | 0° mirrored has the right turn and the wrong handedness; 270° repeats the last figure; 90° mirrored goes back to the start, flipped. |
| S04A | 04 · A | Verbal | antonym analogy | Easy | 4 | Night | Approved | St77 | Sun and Light go with day but are not its opposite; Morning is part of the day. One opposite in each of the five languages. |
| S04B | 04 · B | Verbal | antonym analogy | Easy | 4 | Closed | Approved | St77 | Door and Window are things that open; Wide is close to open in meaning. One opposite in each of the five languages. |
| S05A | 05 · A | Logic | figure weights: one scale, scale up | Easy | 4 | 6 circles | Approved | WAIS | 3 counts one circle per square; 5 adds (2+3) instead of multiplying; 4 is two squares' worth, not three. |
| S05B | 05 · B | Logic | figure weights: one scale, scale up | Easy | 4 | 6 circles | Approved | WAIS | 2 counts one circle per triangle; 5 adds (3+2) instead of multiplying; 3 is one triangle's worth, not two. |
| S06A | 06 · A | Pattern | figure series: alternation (period 2) + progression (+1) | Easy | 4 | square, 5 dots | Approved | SK63 | circle·5 breaks the alternation; square·4 stops the count; circle·4 repeats the last figure. |
| S06B | 06 · B | Pattern | figure series: alternation (period 2) + progression (+1) | Easy | 4 | hexagon, 5 bars | Approved | SK63 | diamond·5 breaks the alternation; hexagon·4 stops the count; diamond·4 repeats the last figure. |
| S07A | 07 · A | Numerical | arithmetic word problem: multiply, then add | Easy | 4 | 26 | Approved | WAIS | 24 forgets the loose pencils; 12 adds every number (6+4+2); 36 multiplies 6×(4+2). |
| S07B | 07 · B | Numerical | arithmetic word problem: multiply, then add | Easy | 4 | 38 | Approved | WAIS | 35 forgets the loose apples; 15 adds every number (5+7+3); 50 multiplies 5×(7+3). |
| S08A | 08 · A | Pattern | matrix: mark constant in a row + count +1 across and down | Medium | 5 | square, 5 dots | Approved | CJS90 | dots·4 copies the left neighbour; bars·5 takes the mark from the row above; bars·4 and bars·6 fail on both. Bars outnumber dots, so the most common mark is a wrong one. Marks were chosen to stay countable at 5 and 6. |
| S08B | 08 · B | Pattern | matrix: mark constant in a row + count +1 across and down | Medium | 5 | circle, 5 bars | Approved | CJS90 | bars·4 copies the left neighbour; dots·5 takes the mark from the row above; dots·4 and dots·6 fail on both. |
| S09A | 09 · A | Numerical | geometric series (×2) | Medium | 5 | 48 | Approved | series | 36 repeats the last difference (+12); 30 adds the first difference (+6); 72 uses ×3; 96 skips a term. |
| S09B | 09 · B | Numerical | geometric series (×3) | Medium | 5 | 162 | Approved | series | 90 repeats the last difference (+36); 58 adds the first difference (+4); 108 uses ×2; 486 skips a term. |
| S10A | 10 · A | Spatial | rotation vs reflection, quarter turns | Medium | 5 | flag 90° | Approved | SM71 | Every distractor is the mirror image at some angle, one of them at the key's own angle. The flag is chiral, so no mirror image can be turned into it. |
| S10B | 10 · B | Spatial | rotation vs reflection, quarter turns | Medium | 5 | ell 270° | Approved | SM71 | Every distractor is the mirror image at some angle, one of them at the key's own angle. The ell is chiral. |
| S11A | 11 · A | Logic | quantified syllogism, undetermined conclusion | Medium | 3 | may be true or false | Approved | logic | "Must be true" over-reads "some": the small blue things need not be squares. "Must be false" claims what the facts never deny. Neutral content, so belief cannot decide it. |
| S11B | 11 · B | Logic | quantified syllogism, undetermined conclusion | Medium | 3 | may be true or false | Approved | logic | "Must be true" over-reads "some": the white smooth things need not be stones. "Must be false" claims what the facts never deny. |
| S12A | 12 · A | Verbal | similarities as odd-one-out: abstract category (instruments that measure) | Medium | 5 | Hammer | Approved | WAIS | Thermometer, ruler, clock and scale each measure a quantity (temperature, length, time, weight); a hammer does not. Checked for a second basis in all five languages: no other option is singled out by a stronger shared property. Hebrew uses מאזניים, not משקל, which can also mean "weight" (a quantity, not an object). |
| S12B | 12 · B | Verbal | similarities as odd-one-out: abstract category (appliances that heat) | Medium | 5 | Fridge | Approved | WAIS | Grill, oven, toaster and microwave heat food; the fridge cools it. All five are kitchen appliances that act on food (a kettle was dropped: "the only one for water" would be a second basis), so nothing else singles one out. |
| S13A | 13 · A | Logic | figure weights: two scales, substitution | Medium | 5 | 3 circles | Approved | WAIS | 2 circles replaces the square and drops the circle; 2 squares (4) treats the triangle as two squares; 4 circles and square+square+circle (5) substitute wrongly. Square+circle, the scale-2 pan itself, is left out on purpose. |
| S13B | 13 · B | Logic | figure weights: two scales, substitution | Medium | 5 | 4 circles | Approved | WAIS | 3 circles drops the extra circle; 2 triangles is 6; 5 circles is one too many; 2 triangles + circle is 7. |
| S14A | 14 · A | Verbal | working memory: digit span backward (4 digits, 4 s, hidden before the options show) | Medium | 5 | 4 9 2 7 | Approved | Bad03 | Forward order; middle pair swapped; first pair swapped; one digit changed (2→5). Reported under Verbal, as digit span was in the WAIS-III Verbal scale. |
| S14B | 14 · B | Verbal | working memory: digit span backward (4 digits, 4 s, hidden before the options show) | Medium | 5 | 6 1 8 3 | Approved | Bad03 | Forward order; middle pair swapped; first pair swapped; one digit changed (8→7). |
| S15A | 15 · A | Spatial | visual puzzle: complete the square (turn, no flip) | Medium | 5 | the L-shaped piece, turned | Approved | WAIS | The mirror-image piece fits only if flipped, which the rules forbid; S, Z and T have the right area and the wrong shape. The two chiral pairs (L/J-type and S/Z) make the key no more frequent than any other shape. |
| S15B | 15 · B | Spatial | visual puzzle: complete the square (turn, no flip) | Medium | 5 | the S-shaped piece, turned | Approved | WAIS | The Z piece fits only if flipped; L, J and T have the right area and the wrong shape. |
| S16A | 16 · A | Numerical | second-difference series (gaps 3, 5, 7, 9) | Hard | 5 | 37 | Approved | series | 35 repeats the last gap; 43 adds the last two terms; 50 skips a term; 52 doubles. n²+1 gives the same 37. |
| S16B | 16 · B | Numerical | second-difference series (gaps 1, 3, 5, 7) | Hard | 5 | 28 | Approved | series | 26 repeats the last gap; 31 adds the last two terms; 39 skips a term; 38 doubles. (n−1)²+3 gives the same 28. |
| S17A | 17 · A | Logic | conditional reasoning: affirming the consequent | Hard | 3 | No — something else could have wet it | Approved (kept) | logic | Both "yes" options add a premise the stem never gives (rain is the only cause; the ground was dry before). |
| S17B | 17 · B | Logic | conditional reasoning: affirming the consequent | Hard | 3 | No — something else could have warmed it | Approved | logic | Both "yes" options add a premise the stem never gives (the oven is the only cause; the kitchen was cold before). |
| S18A | 18 · A | Pattern | matrix: distribution of three on shape and on count | Hard | 6 | diamond, 1 ring | Approved | CJS90 | diamond·3 repeats a count in the row; hexagon·1 repeats a shape; hexagon·3 copies the left neighbour; circle·3 and hexagon·2 fail on both. The most common shape and count among the options are both wrong. |
| S18B | 18 · B | Pattern | matrix: distribution of three on shape and on count | Hard | 6 | square, 4 dots | Approved | CJS90 | square·3 repeats a count; diamond·4 repeats a shape; diamond·2 copies the left neighbour; circle·2 and diamond·3 fail on both. |
| S19A | 19 · A | Spatial | rotation vs reflection at 45° steps | Hard | 6 | barb 135° | Approved | SM71 | All five distractors are mirror images, one at the key's angle and one at the target's. The single barb makes the arrow chiral. |
| S19B | 19 · B | Spatial | rotation vs reflection at 45° steps | Hard | 6 | flag 180° | Approved | SM71 | All five distractors are mirror images, one at the key's angle and one at the target's. |
| S20A | 20 · A | Verbal | delayed recognition of a word shown before item 1, related lures | Hard | 4 | LANTERN | Approved | Bad03 | Lures are other light sources (candle, lamp, match), so the gist "something that gives light" is not enough; only the exact word is. No word is shared with another form or used anywhere else in the test. |
| S20B | 20 · B | Verbal | delayed recognition of a word shown before item 1, related lures | Hard | 4 | MIRROR | Approved | Bad03 | Lures are related to the target (glass, frame, lens), so only the exact word counts. No word is shared with another form or used elsewhere in the test. |
| S20C | 20 · C | Verbal | delayed recognition of a word shown before item 1, related lures | Hard | 4 | PILLOW | Approved | Bad03 | Lures are other bedding (blanket, mattress, sheet), so only the exact word counts. No word is shared with another form or used elsewhere in the test. |
| S21A | 21 · A | Numerical | arithmetic word problem: combined work rate | Hard | 5 | 2 | Approved | WAIS | 4½ averages the two times; 9 adds them; 3 is the faster tap alone; 1½ halves the faster time, as if both taps were fast. |
| S21B | 21 · B | Numerical | arithmetic word problem: combined work rate | Hard | 5 | 4 | Approved | WAIS | 9 averages the two times; 18 adds them; 6 is the faster machine alone; 3 halves the faster time. |
| S22A | 22 · A | Logic | figure weights: three scales, substitute then subtract | Hard | 5 | square + diamond | Approved | WAIS | square+square (6) forgets to take the circle off; diamond+diamond and square+circle (4) take off too much; square+square+circle (7) adds the circle instead. |
| S22B | 22 · B | Logic | figure weights: three scales, substitute then subtract | Hard | 5 | diamond + triangle | Approved | WAIS | diamond+diamond (6) forgets to take the circle off; triangle+triangle and diamond+circle (4) take off too much; diamond+diamond+circle (7) adds it instead. |
| S23A | 23 · A | Verbal | relational analogy: early stage → mature form | Hard | 5 | Caterpillar : Butterfly | Approved | St77 | Butterfly : Caterpillar has the relation backwards; Branch : Tree is part to whole; Forest : Tree is group to member; Nest : Bird is home to inhabitant. Pairs use ":", not an arrow, so they read correctly in RTL. |
| S23B | 23 · B | Verbal | relational analogy: early stage → mature form | Hard | 5 | Child : Adult | Approved | St77 | Adult : Child is backwards; Petal : Flower is part to whole; Garden : Flower is place to thing; Bee : Flower is visitor to thing. |
| S24A | 24 · A | Pattern | matrix: shape by column + figure addition (count) + distribution of three (outline) | Extreme | 6 | hexagon, 5 dots, dashed | Approved | CJS90 | hexagon·1·dashed subtracts (3−2) instead of adding; hexagon·5·solid repeats an outline in the row; circle·5·dashed takes the middle column's shape; circle·1·solid and circle·5·thick fail twice. |
| S24B | 24 · B | Pattern | matrix: shape by column + figure addition (count) + distribution of three (outline) | Extreme | 6 | circle, 5 bars, thick | Approved | CJS90 | circle·1·thick subtracts instead of adding; circle·5·dashed repeats an outline in the row; square·5·thick takes the middle column's shape; square·1·dashed and square·5·solid fail twice. |
| S25A | 25 · A | Spatial | visual puzzle: assemble a chiral shape from three pieces (turn, no flip) | Extreme | 6 | bent 3 + J + S | Approved | WAIS | Solver-checked: only the key tiles the shape. Sets with an L or a Z need a piece flipped; no set with the straight 3 can tile it at all. Each piece type is in exactly three of the six sets. |
| S25B | 25 · B | Spatial | visual puzzle: assemble a chiral shape from three pieces (turn, no flip) | Extreme | 6 | straight 3 + L + S | Approved | WAIS | Solver-checked: only the key tiles the shape. Sets with a J or a Z need a piece flipped; no set with the bent 3 can tile it at all. Each piece type is in exactly three sets. |
| S26A | 26 · A | Logic | truth-teller constraint satisfaction | Extreme | 4 | Ben | Approved (kept) | logic | Brute force over the three cases: Ana or Cara as the truth-teller each give a contradiction, so "no consistent answer" is wrong too. |
| S26B | 26 · B | Logic | truth-teller constraint satisfaction | Extreme | 4 | Tom | Approved | logic | If Leo is truthful, so is Mia (two truth-tellers). If Mia is, Leo's statement comes true (a contradiction). Only Tom works. |
| S27A | 27 · A | Numerical | two interleaved series (×2 and −3) | Extreme | 6 | 11 | Approved | SK63 | 48 continues the other strand; 21 applies −3 to the last term; 28 applies ×2 to the wrong strand; 10 and 8 mis-step the −3 strand. |
| S27B | 27 · B | Numerical | two interleaved series (×3 and −5) | Extreme | 6 | 15 | Approved | SK63 | 162 continues the other strand; 49 applies −5 to the last term; 60 applies ×3 to the wrong strand; 14 and 10 mis-step the −5 strand. |
| S28A | 28 · A | Pattern | matrix: two angular rules (+45° across, +90° down) + handedness constant in a column | Extreme | 6 | flag 270° | Approved | CJS90 | 270° mirrored: only the middle column is mirrored; 315° adds 90° to the left neighbour; 225° copies the left neighbour unmirrored; 180° does not turn; 315° mirrored keeps the neighbour's mirror. |
| S28B | 28 · B | Pattern | matrix: two angular rules (+90° across, +45° down) + handedness constant in a row | Extreme | 6 | ell 270° | Approved | CJS90 | 270° mirrored: only the middle row is mirrored; 315° adds 90° to the cell above; 225° copies the cell above unmirrored; 180° repeats the left neighbour; 225° mirrored copies the cell above. |
| S29A | 29 · A | Verbal | working memory: digit span backward (6 digits, 6 s, hidden before the options show) | Extreme | 6 | 6 9 3 8 1 5 | Approved | Bad03 | Forward order; middle pair swapped; last pair swapped; first pair swapped; one digit changed (8→7). |
| S29B | 29 · B | Verbal | working memory: digit span backward (6 digits, 6 s, hidden before the options show) | Extreme | 6 | 8 1 9 2 7 4 | Approved | Bad03 | Forward order; middle pair swapped; last pair swapped; first pair swapped; one digit changed (2→3). |
| S30A | 30 · A | Spatial | two independent series rules (turn +135°; handedness alternates) | Extreme | 6 | barb 180° | Approved | SK63 | 180° mirrored breaks the alternation; 45° steps once from the last unmirrored figure instead of twice; 315° steps once too far; 270° repeats the last unmirrored figure; 45° mirrored repeats the last figure. |
| S30B | 30 · B | Spatial | two independent series rules (turn +135°; handedness alternates) | Extreme | 6 | ell 270° | Approved | SK63 | 270° mirrored breaks the alternation; 135° steps once from the last unmirrored figure; 45° steps once too far; 0° repeats the last unmirrored figure; 135° mirrored repeats the last figure. |

### 3.2 What the adversarial pass found, and what changed

For every form I tried to build a second defensible answer: another rule, a
second reading of the wording, a translation that adds a synonym, or a
rendering that makes two options look alike. These are the hits, and each
was fixed before release.

1. **Countability (S06B, S08A, S08B).** Five or six rings or crosses on the
   fixed lattice touch each other and merge into one blob, so the count stops
   being readable. Every mark that has to be counted at 5–6 is now a dot or a
   bar.
2. **S12 was too easy for its band.** The draft function analogy
   (pencil : write :: knife : ?) is an easy item. It became a
   Similarities-style odd-one-out (find the abstract category). Two
   second-basis risks turned up in review and were removed. In Hebrew,
   "משקל" (scale) also means "weight", a quantity, which would make a second
   odd one out, so the item uses "מאזניים". A kettle could be argued to be odd
   as "the only one for water", so it was replaced by a grill.
3. **Delayed recall was too easy for the hard band.** With unrelated
   distractors, the gist of the word is enough. The lures are now
   semantically related (lantern / candle / lamp / match), so only the exact
   word works. This is the related-lure method of Roediger & McDermott (1995),
   *J. Exp. Psychology: LMC* 21(4), 803–814. No recall word appears in another
   form or anywhere else in the test.
4. **Median keys (S16A, S16B).** The key sat in the middle of the sorted
   options, which test-wise people bet on. The distractors were rebalanced
   and still fail for nameable reasons. One form, S09A, still has its key at
   the median; across the six odd-option numeric forms that is 1 in 6, which
   is chance.
5. **S15A key and mirror swapped in the draft.** The solver found that the
   piece marked as the key fitted only when flipped.
6. **RTL: "4½" rendered as "½4"** in Hebrew and Arabic, because "½" has no
   direction of its own. Mixed numbers are now wrapped in an LTR isolate.
7. **The shuffle's redraw rule was biased** (see §8.1).
8. **S17B (ru):** the pronoun referred to a noun that is not in the sentence.
   It now names the kitchen.
9. **QA blind spot.** A mutation test (§5.3) showed that the matrix rule
   library had no "third = first + k" rule, which a solver might reach for. It
   was added, and every matrix was re-checked against it.

Checked and found clean: in no number series does any rule the solver tries
land on a distractor. It tries constant difference and ratio, second and
third differences, differences in ratio, sum of the previous two (± a
constant), ×p+q, alternating operations and interleaved strands. Where two
rules fit, they agree on the key. No distractor in any matrix
or figure series can be explained by the rule library on every attribute,
under either way of reading a mirrored glyph's angle. Each balance has a
single weight solution and exactly one option matching it. Each assembly has
exactly one set that tiles the shape by turning. Each truth-teller item has
exactly one consistent speaker. No pixel-level near-duplicates exist among
options (highest overlap 0.925; identical = 1).

### 3.3 Items retired from the 2026-09 bank

| Old | Why | Now |
|---|---|---|
| Q03 colour alternation | the only rule carried by colour | retired; no rule anywhere is carried by colour |
| Q07, Q15 odd-one-out with three identical options | the key is the only option that looks different, so it can be answered at a glance | retired |
| Q12 book : library :: painting : museum | the most culture-loaded item | S12 similarities |
| Q30 antonym of "ephemeral" | vocabulary (crystallised), not reasoning | the extreme verbal slot is now working memory (S29) |
| Q10, Q17, Q22, Q26 | sound | constructs kept as S11, S17, S26 (Q17 and Q26 verbatim as forms A); the Ferio syllogism was dropped to make room for figure weights |
| Q20 delayed recall | sound but too easy | S20 with related lures (LANTERN kept as form A) |
| Q27 two-rule series | sound | S30 with a 135° step and six options |
| Q05 antonym analogy | sound | construct kept as S04, new word pairs |
| all other items (series, matrices, rotations, analogies) | sound | constructs carried into the new slots with new numbers and figures; none is reused as-is |

### 3.4 Conventions worth knowing

* **Reading direction.** In Hebrew and Arabic, rows of figures, number
  series and digit boxes run right to left (CSS flex follows `dir`).
  Multi-digit numbers stay left to right. The stimulus and its options always
  share one direction, and "reverse order" is the same in either direction.
  Matrices mirror their columns too, and every matrix rule is read in reading
  order, so a rule holds in both directions. Figures inside an SVG are never
  mirrored.
* **Mirrored glyphs.** `svgFor` draws a mirrored glyph as a reflection of the
  turned glyph, so its apparent angle runs the other way. Every item that
  mixes mirrored and plain glyphs (S03, S28, S30) is built so that its key is
  determined by the plain figures alone. The QA script re-solves each of them
  under the other convention as well, and no distractor fits under either
  convention.
* **Timed digits.** Before the digits have been shown and withdrawn, the
  options are hidden. The exposure is 1 s per digit. The reveal time is kept
  per form, so re-rendering the question (for example, switching language)
  restores the current state instead of starting a new look.

---

## 4. Hardcore — item table

31 original items; 10 are drawn at random per run. IDs match the `id` field in
`HARDCORE_BANK()`. Every item carries an `ex` field — the reasoning principle,
in all five languages — which is shown to the player in the post-run review.

| ID | Category | Construct | Src |
|---|---|---|---|
| HC01 | Pattern | Distribution of three values (shape × count) | CJS90 |
| HC02 | Pattern | Three simultaneous rules (mark / count / outline) | CJS90 |
| HC03 | Numerical | Figure addition + distribution of three | CJS90 |
| HC04 | Pattern | Distribution of two values, shifting position | CJS90 |
| HC05 | Spatial | Latin-square distribution + orientation progression | CJS90 |
| HC06 | Logic | Exclusive-or of a feature + distribution of three | CJS90 |
| HC07 | Numerical | Figure subtraction | CJS90 |
| HC08 | Pattern | Quantitative progression on two axes | CJS90 |
| HC09 | Numerical | Two-step arithmetic rule across a row | series |
| HC10 | Numerical | Chained rule within a row | series |
| HC11 | Spatial | Compound transformation analogy (turn + reflect) | St77 |
| HC12 | Pattern | Two-attribute analogy | St77 |
| HC13 | Pattern | Inverse-quantity analogy | St77 |
| HC14 | Pattern | Role-exchange analogy (outer ↔ inner) | St77 |
| HC15 | Spatial | Half-turn plus reflection analogy | SM71 |
| HC16 | Spatial | Second-order angular progression | SK63 |
| HC17 | Spatial | Alternating signed rotation | SK63 |
| HC18 | Spatial | Two independent series rules | SK63 |
| HC19 | Numerical | Alternating operations | series |
| HC20 | Numerical | Recursive two-term rule | series |
| HC21 | Numerical | Two interleaved series | SK63 |
| HC22 | Numerical | Polynomial term rule | series |
| HC23 | Numerical | Linear recurrence | series |
| HC24 | Numerical | Second-difference progression | series |
| HC25 | Logic | Linear ordering under constraints | logic |
| HC26 | Logic | Chained modus tollens | logic |
| HC27 | Logic | Quantified syllogism | logic |
| HC28 | Logic | Sequence manipulation in working memory | Bad03 |
| HC29 | Numerical | Mental transformation with a cancellation | Bad03 |
| HC30 | Verbal | Antonym-relation analogy | St77 |
| HC31 | Verbal | Relational odd-one-out | St77 |

Design rules the bank is held to:

* Difficulty comes from **rule density** — two or three rules running at once —
  never from ambiguity or from figures that are hard to see.
* Every item has exactly one defensible answer, and every distractor fails the
  rule in a specific, nameable way.
* No rule is carried by colour alone, so the whole bank is solvable with any
  colour vision.
* Counts are capped at six and laid out on a fixed lattice, so counting is never
  the difficulty.

---

## 5. Reproducing the checks

### 5.1 The QA script

`docs/qa/qa-free-test.mjs` loads `index.html` in Chromium and checks every
item, in every language, in every parallel form. It exits non-zero on any
failure.

```sh
# Playwright must be resolvable: NODE_PATH, PLAYWRIGHT_PATH, or a local install.
# Chromium: CHROMIUM_PATH, else /opt/pw-browsers/chromium, else Playwright's own.
node docs/qa/qa-free-test.mjs                    # structure, solvers, shuffle, scoring
node docs/qa/qa-free-test.mjs --e2e              # + full UI run, 5 languages, 375px
node docs/qa/qa-free-test.mjs --e2e --shots out/ # + screenshots of each item type
```

| # | Check | What fails it |
|---|---|---|
| 1 | Structure, all five languages | not 30 slots; a slot with fewer than 2 forms; forms not parallel (category, band, option count); key out of range; a prompt, sub-prompt or localized option missing in any language; a matrix that is not 3×3 with exactly one blank, in the last cell |
| 2 | Distinctness | two options with the same signature, the same markup, or rasterised overlap > 0.97 |
| 3 | Machine-checked keys | a solver disagrees with the key, **or a second rule lands on a distractor** (see 5.2) |
| 4 | Rotation vs reflection | the key fails to match, pixel for pixel, a copy of the target turned in 15° steps, or a distractor matches one (IoU > 0.9) |
| 5 | Answer-set bias | the key is the unique "most common attribute values" option (the I-RAVEN shortcut). Handedness is left out, because reading it off a turned figure is the mental rotation the item measures, so it is not a free cue |
| 6 | Shuffle | a shuffled item is not a permutation of its form, or its key no longer points at the same option; key positions not uniform (χ², p = .001) over 4 000 sittings; a slot repeats the previous sitting's form |
| 7 | Scoring | random guessing outside IQ 80–90; any always-the-same-letter strategy above 90; all-correct not 148 |
| 8 | End to end (`--e2e`) | in en/he/es/ru/ar at 375×812: a console error or warning; horizontal overflow on any item; a row in he/ar that does not read right to left; the timed digits showing the options early, failing to hide, or being re-shown by a re-render; the recall item not offering the word that was memorised; not reaching the results gate |

### 5.2 How each item type is solved

| Type | Forms | Machine check |
|---|---|---|
| Number series | S02 S09 S16 S27 | every simple family that fits the given terms: constant difference and ratio, 2nd and 3rd differences, differences in ratio, sum of the previous two (± c), ×p+q, two alternating operations, two interleaved strands. The key must be predicted, and no family may predict a distractor |
| Matrices | S01 S08 S18 S24 S28 | each attribute (shape, mark, count, outline, angle, handedness) of the completed grid is tested against a rule library: constant (all, row, column), distribution of three (rows, columns, wrapped diagonals), linear 2-D progression, per-row/column arithmetic, third = first ± second, \|first − second\|, first × second, third = first + k, third = second + k. The key must be explained on every attribute, and no distractor may be, under either way of reading a mirrored glyph's angle |
| Figure series | S03 S06 S30 | the same idea for sequences: constant, constant step (mod 360 for angles), period 2, cycle of 3 |
| Rotation vs reflection | S10 S19 | handedness check plus the raster comparison (check 4) |
| Balances | S05 S13 S22 | brute force over integer weights 1–12: exactly one weight ratio fits all the scales, and exactly one option weighs the same as the "?" pan |
| Piece completion | S15 | the piece must fit the gap by rotation alone; it reports which distractors would fit if flipped |
| Assembly | S25 | exact-cover solver: exactly one option tiles the target by rotation alone; it reports the counts with flipping |
| Digit span | S14 S29 | the key is the exact reverse, the reverse appears only once, a forward-order distractor exists, all lengths match |
| Truth-teller | S26 | enumeration of the three cases: exactly one consistent speaker, and it is the key |
| Word problems | S07 S21 | recomputed (6·4+2, 5·7+3, 1/(1/6+1/3), 1/(1/12+1/6)); exactly one option equals the result |
| Delayed recall | S20 | the words are distinct across all forms, and the e2e run checks that the recall options contain the memorised word |
| By hand | S04 S11 S12 S17 S23 | verbal and syllogism items: one correct option per language, checked by reading every translation for synonyms, polysemy and a second basis (§3.2) |

### 5.3 Testing the tester

`QA_PAGE=<copy of index.html>` points the script at a mutated copy. Each
mutation below was applied on its own, and the script failed every one. The
no-op control passed, as it must.

| Mutation | Caught by |
|---|---|
| series key moved to a distractor | "no simple rule predicts the key" |
| series rewritten so a different rule holds | same |
| matrix key swapped with a distractor | "key is not explained by the rule library" |
| matrix where a distractor follows "third = first + k" | "distractor is also fully explained" |
| balance with a second option of equal weight | "options balancing the scale: 0,1" |
| piece set with a rotated copy of the key | "pieces that fit by turning: 0,1" |
| assembly set that also tiles the shape | "sets that tile the shape by turning: 0,1" |
| digit key not the exact reverse | "is not the reverse of" |
| truth-teller key on the wrong name | "solver says Ben, key is Ana" |
| a mirror-image distractor replaced by a turned copy | raster: "a distractor matches a turned copy of the target" |
| option set rebuilt so the key is the attribute mode | "unique most-common-attributes option" |
| one translation blanked | "option 0 missing in ru" |
| figure series made period-2 in the count | "key not explained" / "distractor also fits" |
| shuffle that does not move the key | "shuffled items lost their key" |
| no-op (control) | not caught, correctly |

### 5.4 Result of the October 2026 run

All checks pass: 0 failures, 0 warnings. 61 forms × 5 languages are
structurally clean. 51 forms have a machine check and the other 10 were
checked by hand. The four rotation items match their target at IoU 1.0, while their
best mirror-image distractor reaches 0.44–0.61. The end-to-end run completes
in all five languages at 375px with zero console errors, zero overflow and
correct RTL order, and both timed-digit items pass in every language.

The console snippet that used to be here only covered the old 30 items, and
the QA script supersedes it. `auditSelfCheck()` still runs at boot, and it
warns if a form has no audit row, a row has no form, or a slot's forms are
not parallel.

---

## 6. What this product does not claim

Etsem.IQ is designed for self-insight and training. It is **not** a clinical or
diagnostic assessment: it is not administered by a psychologist, it is not
normed on a representative population, and no score it produces is a diagnosis.
The footer disclaimer says so on every screen, Bob says so when asked, and no
copy anywhere describes it as clinically validated. Hardcore is inspired by the
published description of what advanced matrix tests measure; it is not a
Raven's assessment and is not presented as one.

---

## 7. Research basis for the October 2026 Free Test rebuild

Read in October 2026, before any item in the new bank was written. Everything
below describes how established instruments are built. No item, figure, option
set or key from any of them was copied, paraphrased or traced; ICAR's public
sample items were not used even as templates.

### 7.1 How established tests structure their items

| Instrument | Structure that matters for us | Source |
|---|---|---|
| **Raven's SPM / APM** | SPM: 60 items in five sets (A–E) of 12, each set rising in difficulty. Answer choices: six in the early sets, eight in the later ones. APM: Set I (12 items) and Set II (36), aimed at above-average adults, eight choices. | Raven, Raven & Court, *Manual for Raven's Progressive Matrices and Vocabulary Scales* (2000/2003), Section 3; summary at <https://en.wikipedia.org/wiki/Raven%27s_Progressive_Matrices> |
| **Matrix rules** | Carpenter, Just & Shell found that nearly every APM item can be built from five rule types: *constant in a row*, *quantitative pairwise progression*, *figure addition or subtraction*, *distribution of three values* and *distribution of two values*. Difficulty rises with the **number of rule tokens** held at once, and the high scorers are the ones who manage that goal load in working memory. | Carpenter, Just & Shell (1990), *Psychological Review* 97(3), 404–431, <https://doi.org/10.1037/0033-295X.97.3.404>; Lovett et al. (2010), <https://qrg.northwestern.edu/papers/Files/QRG_Dist_Files/QRG_2010/Lovett_CogSci10_Ravens_Final.pdf> |
| **WAIS-IV / WAIS-5** | Five primary indexes. WAIS-5: *Verbal Comprehension* (Similarities, Vocabulary), *Visual Spatial* (Block Design, **Visual Puzzles**), *Fluid Reasoning* (**Matrix Reasoning**, **Figure Weights**; Set Relations is new), *Working Memory* (Digit Sequencing, Running Digits) and *Processing Speed* (Coding, **Symbol Search**). Arithmetic, Digits Backward and Letter–Number Sequencing are secondary. Visual Puzzles asks which three pieces rebuild a figure, Figure Weights asks what balances a scale, and both have item time limits. The seven-subtest FSIQ takes about 45 minutes. | Pearson, *WAIS-5 overview brochure* (2024), <https://www.pearsonassessments.com/content/dam/school/global/clinical/us/assets/wais-5/wais-5-overview-brochure.pdf>; Pearson, *WAIS-IV telepractice guidance*, <https://pearsonclinical.com.au/content/dam/school/global/clinical/uk-clinical/files/wais-iv-telepractice-table-1.pdf> |
| **ICAR** (public domain) | Four item types: letter-and-number series (9), 3×3 matrix reasoning (11), verbal reasoning (16; logic, vocabulary, general knowledge) and 3-D cube rotation (24). Series and matrix items have **six** choices. Items were **untimed** online. The 16-item sample test reached α = .81 and the 60-item set α = .93. Mean proportion correct ran from .19 (rotation) to .64 (verbal), so rotation was by far the hardest type. | Condon & Revelle (2014), *Intelligence* 43, 52–64, <https://personality-project.org/revelle/publications/condon.icar.14.pdf>; project page <https://www.psychometrics.cam.ac.uk/research/the-international-cognitive-ability-resource-icar> |
| **Cattell Culture Fair (CFIT)** | Four short, strictly timed non-verbal subtests: Series, Classification, Matrices and Conditions (topology). It is highly speeded. | Cattell (1940), *J. Educational Psychology* 31, 161–179; SAGE *Encyclopedia of Measurement and Statistics*, <https://methods.sagepub.com/ency/edvol/embed/encyclopedia-of-measurement-and-statistics/chpt/culture-fair-intelligence-test> |
| **Mensa online practice test** (Norway) | 35 matrix items with a 25-minute limit, in rising difficulty, and expressly *not* an admission test. | <https://test.mensa.no>; description at <https://practicetestgeeks.com/mensa/mensa-norway-iq-test> |

### 7.2 Design questions and what the evidence says

* **Ordering.** Every instrument above orders items easy to hard. Hard items
  early cause frustration; hard items late meet fatigue, but the easy-to-hard
  convention is the safer default (Hambleton & Traub, 1974, *J. Experimental
  Education* 43, 40–46, <https://doi.org/10.1080/00220973.1974.10806302>;
  review: Leary & Dorans, ETS 1982,
  <https://www.ets.org/research/policy_research_reports/publications/report/1982/hwcw.html>).
  → We keep four bands in order (7 easy, 8 medium, 8 hard, 7 extreme). Within
  a band, the rule count rises.
* **Answer position.** Item writers tend to hide the key in the middle
  positions, and test-takers tend to guess there too (Attali & Bar-Hillel,
  2003, *J. Educational Measurement* 40(2), 109–128,
  <https://doi.org/10.1111/j.1745-3984.2003.tb01099.x>). The standard rule is
  to "vary the location of the right answer according to the number of
  choices" (Haladyna, Downing & Rodriguez, 2002, *Applied Measurement in
  Education* 15(3), 309–334, <https://doi.org/10.1207/S15324818AME1503_5>).
  → Options are shuffled uniformly per item at test start. A sitting where
  one letter would carry a lopsided share of keys is redrawn (see §8).
* **Number of options.** For verbal and numeric items, three to four
  functioning options are as good as more (Rodriguez, 2005, *EM:IP* 24(2), 3–13,
  <https://doi.org/10.1111/j.1745-3992.2005.00006.x>). Figural matrices are
  different: few options make **response elimination** easy, which means
  rejecting distractors on surface features without solving the item.
  Formats that block it measure g better (Arendasy & Sommer, 2013,
  *Intelligence* 41, 234–243; Becker et al., 2016, *J. Intelligence* 4(1), 2,
  <https://doi.org/10.3390/jintelligence4010002>). → Free-test items carry four
  options when easy and five when medium or hard. Hard figural items and
  every extreme item get six. The exceptions are the two items whose answer
  is a verdict on a conclusion, which keep three; the truth-teller puzzle,
  which has four (three names plus "no consistent answer"); and delayed
  recall, which has four.
* **Distractor construction.** If every distractor is the key with one
  attribute changed, the key is the per-attribute *mode* of the options, and
  it can be picked without looking at the matrix. This is the "answer-set
  bias" that I-RAVEN removed by building option sets as a balanced bisection
  tree (Hu et al., 2021, AAAI, <https://arxiv.org/abs/2002.06838>). → Each
  attribute of a figural item splits the option set as evenly as it can, and
  the QA script fails any item whose key is the unique top scorer under the
  mode heuristic. Every distractor must also fail the rule in a way we can
  name, and that reason is recorded per item.
* **Time limits.** Practice varies: ICAR is untimed, CFIT is strictly speeded,
  Raven's is usually given untimed or with a generous overall limit, and
  Mensa's practice test runs 35 items in 25 minutes. A single generous overall
  limit keeps the free test a *power* test rather than a speed test.
  → Keep 30 items and 22 minutes (about 44 s per item). That is in line with
  Mensa's practice pace and leaves the two timed memory exposures, 4 s and 6 s,
  negligible.
* **Scoring to an IQ-style scale.** A real deviation IQ (mean 100, SD 15)
  needs a norm sample. We have none, so any mapping is a transparent linear
  transform of the weighted proportion correct, anchored at chance and at the
  ceiling. The classical standard error of measurement is
  SEM = SD·√(1 − r). For a 30-item test with α around .80–.85 that gives
  roughly 6–7 points, which is why the displayed range is ±6. Correcting for
  guessing (formula scoring) is the classic alternative (Frary, 1988, *EM:IP*
  7(2), 33–38, NCME ITEMS module 4,
  <https://ncme.org/wp-content/uploads/2025/10/Module-4-Formula-Scoring-of-Multiple-choice-Tests-1.pdf>). We
  check instead that pure guessing lands at IQ 80–90 (see §8).
* **Cultural and language bias.** Bias can sit in the construct, the method or
  the single item (van de Vijver & Tanzer, 2004, *European Review of Applied
  Psychology* 54(2), 119–135,
  <https://research.tilburguniversity.edu/en/publications/bias-and-equivalence-in-cross-cultural-assessment-an-overview-2/>).
  Translated items need checking for equivalence, not just wording (ITC
  *Guidelines for Translating and Adapting Tests*, 2nd ed., 2017/2018,
  *Int. J. Testing* 18(2), 101–134,
  <https://doi.org/10.1080/15305058.2017.1398166>). Even Raven's scores
  move with schooling across countries and decades (Brouwers, Van de Vijver &
  Van Hemert, 2009, *Learning and Individual Differences* 19(3), 330–338;
  Flynn, 1987, *Psychological Bulletin* 101(2), 171–191). → The bank leans
  non-verbal: 21 of 30 slots need no reading beyond a shared instruction. We
  use no letter series at all, because alphabets differ and Hebrew and Arabic
  run right to left. Verbal items use only everyday, near-universal concepts
  (day/night, eye/see, seed/tree) and were checked to have exactly one correct
  option *in each language*. Syllogisms use neutral content (boxes, stones)
  so prior belief cannot carry the answer (belief bias: Evans, Barston &
  Pollard, 1983, *Memory & Cognition* 11(3), 295–306). No rule is carried by
  colour.
* **Spatial and working-memory items.** Mental-rotation items must use chiral
  figures, so that a mirror image can never equal a rotation (Shepard &
  Metzler, 1971; Vandenberg & Kuse, 1978, *Perceptual and Motor Skills* 47,
  599–604). Working memory is tested the way span tasks do it: present, hide,
  then respond (Baddeley, 2003). Showing digits *next to* the options would
  turn a memory item into a matching item. → The digit items hide the options
  until the digits have been shown and withdrawn.

---

## 8. Option shuffling and the score

### 8.1 Shuffling

In the 2026-09 bank the key was B on 14 of 30 items, so answering B every
time scored IQ 104. Now every form is authored with its key first, and
`ftBuildTest()` gives each item an independent Fisher–Yates shuffle when the
sitting is built. The key travels with its option. Pure shuffling is
unbiased, but an occasional sitting is lopsided: under pure shuffling, the
most keys on any one letter A–D in a sitting has a median of 9, a 99th
percentile of 13 and a maximum of 18 of 30. So a sitting is redrawn, up to
60 times, until its keys are within 2 of their fair share.

That redraw rule needs care. A first version measured every letter against
its fair share across all items at once. That **biased the key away from D**
(24.35 % instead of 25 % on 4-option items, χ² = 407 over 200 000 simulated
sittings), because D, E and F exist on only some of the items. The rule
that shipped measures the gap *inside each group of items with the same
option count*. That measure treats every position of a group alike, so
relabelling a group's positions maps a sitting to one with the same score.
As a result, each item's key stays exactly uniform.

| Policy (200 000 simulated sittings) | Max keys on one letter A–D: median / p99 / max | Marginal χ², 4 / 5 / 6 options | always-A SD |
|---|---|---|---|
| pure Fisher–Yates | 9 / 13 / 18 | 3.1 / 7.9 / 3.4 | 6.2 |
| redraw by letter, all items (rejected) | 8 / 9 / 9 | **407 / 358 / 345** | 4.6 |
| redraw within option-count groups (shipped) | 8 / 11 / 13 | 1.0 / 5.6 / 2.2 | 5.3 |

In the page (QA run, 4 000 sittings), key positions are A 24.8 · B 25.2 ·
C 24.8 · D 25.2 % on 4-option items, A–E 19.9–20.2 % on 5-option items and
A–F 16.4–17.0 % on 6-option items. All pass χ² at p = .001.

### 8.2 The score

`buildResults()` keeps the difficulty-weighted formula. Each item is worth
its band weight (easy 1, medium 1.6, hard 2.3, extreme 3.2; 60.6 in all):

    IQ = 68 + 80 × (weight earned ÷ total weight)

So all wrong = 68 and all correct = 148, the top of the scale. Category scores
are the weighted percentage correct inside each category, floored at 15 as
before. The displayed range is the IQ ± 6, which is about one standard error
of measurement for a 30-item test with α ≈ .80–.85 (SEM = 15·√(1 − α) ≈ 6–7).

Simulated in the page, with the real shuffle (`docs/qa/qa-free-test.mjs`, §7):

| Strategy | Mean IQ | SD | 5th–95th percentile |
|---|---|---|---|
| random guessing (10 000 sittings) | 84.4 | 6.3 | 75–95 |
| always A | 84.5 | 5.2 | 76–93 |
| always B | 84.3 | 5.1 | 76–93 |
| always C | 84.4 | 5.3 | 76–94 |
| always D | 84.6 | 5.2 | 76–93 |
| always E (last option when an item has fewer) | 84.6 | 5.3 | 76–94 |
| always F (likewise) | 84.5 | 5.3 | 76–94 |
| easy + medium correct, the rest guessed | 104.4 | 5.6 | 97–115 |
| all correct | 148 | — | — |
| all wrong | 68 | — | — |

Analytically, guessing earns Σ(wᵢ/kᵢ) ÷ Σwᵢ = 0.206 of the weight, which
gives IQ ≈ 84.5. This agrees with the simulation, and it sits inside the
intended 80–90 band for chance performance.

**What this is not.** The mapping is a transparent linear transform of a
weighted proportion. It is not a deviation IQ: there is no norm sample, so
"100" is not the population mean. The bands are designed difficulty
estimates (from the number of rules, steps and options), not measured pass
rates. Real item statistics from live sittings would be the next step, and
item response theory calibration after that. Section 6 still applies.
