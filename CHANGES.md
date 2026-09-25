# Debug + UI pass — what changed

## How I found the bugs

Rather than reading the ~5,000 lines of engine code and guessing, I wrote
`tests/fuzz.js` — a headless duel simulator you can run yourself:

```
node tests/fuzz.js [games=200] [seedStart=1] [mode=mixed|ai|chaos]
```

It plays full duels with no browser (`ai` = your real AIController on both
sides, `chaos` = an agent that fires random, frequently *illegal* actions
at the engine to stress-test it, `mixed` = alternates). After every single
action it checks structural invariants — no card duplicated or lost, no
leaked stat modifiers on cards that left the field, no NaN ATK/DEF, no
stale equip/link references, well-formed response windows — and reports
the first few violations, exceptions, or stuck duels it finds. Final
state: 400+ fuzzed games (AI-vs-AI and chaos-mixed) run clean with zero
invariant violations or exceptions.

## Real bugs fixed

1. **Extra/Side Deck cards had the wrong `.location`** — `GameCard`'s
   constructor always stamps `location: "deck"` regardless of which zone
   it's actually placed in; `Player.js` never corrected this for Extra
   Deck / Side Deck cards. Fixed at Player construction time.

2. **Continuous "bind" Traps never honored their own card text.**
   Spellbinding Circle, Shadow Spell, Fiendish Chain, and Call of the
   Haunted all say "when [the linked card] leaves the field, [do X]" —
   none of that was enforced. A monster shackled by Shadow Spell that
   got destroyed would keep its -700 ATK/DEF and `cannotAttack` flag
   forever (even surviving a later Monster Reborn revival); the Trap
   itself would sit dead in the Spell/Trap Zone forever once its target
   was gone. Fixed with a proper bidirectional link system
   (`linkedRevert` + `cleanupOrphanedBinds`).

3. **Server crash: a Spell/Trap targeting itself.** Mystical Space
   Typhoon (and anything else with `needsTarget` that can legally hit
   an already-face-up card) targeting *itself* caused a double
   move-to-graveyard and crashed `Player.removeCard`. Guarded.

4. **Server crash: Enemy Controller missing its own restriction.**
   The card can only target the *opponent's* monster — that check was
   missing entirely, so a self-targeted activation could crash
   `transferCard` when the tribute step removed the same card the
   target reference pointed at. Restriction restored + defensive guard
   added to `temporaryControl` itself.

5. **Stat-boost leaks past end of turn.** Reinforcements/Shrink-style
   temporary ATK/DEF deltas revert at the End Phase unconditionally —
   if the boosted monster had already left the field earlier that turn
   (destroyed, tributed), the revert fired anyway and pushed its
   modifiers negative. Now guarded on the card still being on the
   field.

6. **A real AI infinite loop, not just a fuzzer artifact.** The AI's
   direct-attack logic didn't know Spear Dragon can't declare a direct
   attack. If it was the strongest (or only) attacker with the
   opponent's field empty, the AI would dispatch the same doomed attack
   forever — production code, only band-aided by the stagnation guard
   in `route/game.js`'s `advanceGame()`. Fixed at the source in
   `AIController.js`.

7. **Tokens piling up in the Graveyard.** Tokens cease to exist when
   they'd leave the field — they were instead being moved into the
   Graveyard array like a real card. Fixed at the single choke point
   (`Player.moveCard`).

8. **Union Monster Graveyard path bypassed cleanup entirely,** leaking
   whatever modifiers the Union Monster had picked up while it was
   still an independent field monster (before being equipped).

## UI changes

- **Every card now explains itself.** `Effects.getEffectInfo(cardName)`
  (exposed as `game.getEffectInfo(...)` for the view) looks across every
  effect table in the engine and returns a plain-English answer to
  "what does this card actually do, and how do I use it?" — Ignition,
  Flip, On-Summon trigger, Continuous/Quick-Play/Normal Spell or Trap
  (with its activation window spelled out), Dynamic stats, GY-trigger,
  Union, Fusion, Ritual, or an explicit "no programmed effect yet —
  plays as a plain stat stick" so it's never ambiguous whether a card
  was skipped or is just vanilla. This shows up two ways:
  - In the hover/tap preview panel for **every** card in the game —
    hand, field, Set, response windows, and the Graveyard viewer.
  - As a small always-on corner badge (`kind-tag`) on any face-up card
    on the field with a programmed effect, color-coded by type, so you
    can tell what's going on without hovering anything. This is
    separate from the existing FX/Union action badges (which only show
    when that action is currently usable) — the new badge is purely
    informational and always there.

- **Kaiba = red, Yugi (you) = blue**, permanently — not just while it's
  that player's turn. Applied to the avatar border/glow and the name
  text; the existing "active turn" glow still layers on top, just
  tinted to match instead of overriding to a generic cyan.

- Light GX Tag Force-style polish: an Orbitron display face for
  names/LP/phase text (Rajdhani for body text), a subtle red/blue wash
  behind each player's header panel, and a brighter LP gauge glow.
<<<<<<< HEAD
=======

## Field-event animations (Master Duel/Tag Force-style)

Every card actually landing on the field now gets a distinct, dramatic
animation and a centered callout banner — not just the plain fade-in
every card already got on re-render:

- **Normal Summon** — gold flash + scale pop, "NORMAL SUMMON!"
- **Tribute/Advance Summon** — same treatment, banner instead reads
  "TRIBUTE SUMMON!" (or "ADVANCE SUMMON!" for 2 tributes) with a
  sub-line listing what was tributed
- **Set** (monster, or Spell/Trap face-down) — blue flash + slam,
  "SET!" — deliberately shows **no card art or name**, even for your
  own cards, matching how Master Duel/Tag Force only ever show a plain
  card-back for a Set. This is enforced server-side (the identity is
  stripped out of the event data before it's ever sent to the
  browser), not just hidden in the UI, so it can't leak through
  dev tools either.
- **Ritual Summon** — the biggest treatment: a longer, multi-stage
  purple/blue burst, "RITUAL SUMMON!", with tributed materials listed
- **Spell/Trap activating** (from hand or flipping up a Set card,
  including mid-battle Traps like Mirror Force) — green flash for
  Spells, magenta for Traps, "SPELL/TRAP CARD ACTIVATE!"
- **Flip effect triggering** — a 3D flip-reveal animation with a cyan
  flash, "FLIP EFFECT!"

Implementation: `MainGame.recordFieldEvent(kind, gc, extra)` is called
at each of the relevant spots (`normalSummon`, `setMonster`,
`ritualSummon`, `setSpellTrap`, `activateSpellFromHand`,
`activateSetCard`, and `Effects.triggerFlip`) and stored as a one-shot
`lastFieldEvent`, threaded through `route/game.js` exactly like the
existing `lastBattleEvent`/`lastDrawEvent` pattern. `game.ejs` reads it,
redacts identity for Set-kind events, and a `playFieldEvent()` script
finds the exact card element by `data-instance-id` and animates it.

## AI behavior fix: Spear Dragon (and similar) sitting in Defense forever

Spear Dragon is forced into Defense Position immediately after it
attacks — but that's only a one-turn side effect, not a strategic
choice to wall up. On a later turn there's nothing stopping it from
freely switching back to Attack Position like any other monster (once
per turn, hasn't attacked/been Summoned yet that turn) — the AI just
never considered doing so. `AIController.actMainPhase` now proactively
switches any face-up Defense-Position monster with
`Effects.forcedDefenseAfterAttack(...)` back to Attack, once it's
legal to do so.

## A second real AI freeze, found while re-testing

While re-running the fuzzer after the above, ~1 in 250 AI-vs-AI games
hit a genuine (if rare) infinite loop: `AIController`'s tribute-count
math used the *raw* printed Level of the monster
(`game.getRequiredTributes(card.level)`), but the engine's actual
summon validation (`getRequiredTributesForSummon`) accounts for Cost
Down's "-2 Levels this turn" (and Soul Exchange's saved credits). With
Cost Down active, this mismatch meant the AI would compute "needs 2
Tributes" while the engine expected 1, submit the wrong tribute count,
have the summon silently rejected — and, since `AIController` never
checked whether its own dispatched action actually succeeded, loop
forever retrying the exact same doomed summon. Fixed by having
`AIController` use `getRequiredTributesForSummon` (the same
Cost-Down/Soul-Exchange-aware calculation the engine itself uses)
instead of the raw, unadjusted level.

## Round 2: animation glitch fix, terminology, extra deck/banish zones, playmat layout

**The rotation glitch** — a Set or face-up Defense Position monster is
supposed to render sideways (that's the real-rules visual for Defense
Position). The `cardAppear` fade-in that plays on *every* card on
*every* re-render, and every `fx-land-*` landing animation added
earlier, each set their own `transform` value in their keyframes —
and a CSS animation's `transform` completely replaces the element's
static `transform` for as long as it's running. Since none of those
keyframes included the sideways rotation, any Defense/Set monster
would flash upright for the length of whichever animation was
playing — on `cardAppear` specifically, that's on every single
re-render, matching "glitches during phases." Fixed by moving the
rotation into a `--rot` CSS custom property set by `.card.defense`,
and folding `rotate(var(--rot))` into the start of every keyframe's
`transform` instead of overwriting it.

**Terminology**: dropped "ADVANCE SUMMON!" — it's just Tribute Summon
regardless of how many monsters were tributed (1 or 2+), so the
banner always says "TRIBUTE SUMMON!" now.

**Set Spell/Trap no longer reveals which it is.** A face-down card in
the Spell/Trap Zone looks identical whether it's a Spell or a Trap —
neither player can tell until it's activated. The engine used to
compute and send `"spell-set"` vs `"trap-set"` as two different event
kinds; even though the client redacted the *name*, the kind itself
was a tell. Now the engine only ever emits one generic
`"set-spelltrap"` kind, so the distinction can't leak by accident, no
matter whose card it is.

**Activate → Graveyard animation.** Continuous/Equip/Field
Spells/Traps stay on the field and get the activation flash on the
actual card, same as before. A one-shot Spell/Trap (Normal/
Quick-Play/Counter Trap) is already moved to the Graveyard
server-side, in the same request, before the page ever re-renders —
so there's no element left on the board to animate away. Two cases,
handled separately: if the card element is still findable (Continuous/
Equip/Field), it gets the activation flash; if it already left the
field, the Graveyard icon itself gets a brief pulse as the "it landed
here" cue instead of trying to animate a card that no longer exists in
the DOM.

**Preview panel is artwork-only everywhere now.** Every card
preview site was already supposed to prefer the cropped/artwork-only
image over the full bordered card, but two spots — hand cards and one
of the response-window card lists — were missing the
`data-image-cropped` attribute entirely and silently fell back to the
full card. Fixed, and the Graveyard/Extra Deck/Banish viewers below
were all built to use the cropped artwork from the start.

**New: Extra Deck and Banished Cards zones.**
- Your own Extra Deck is viewable any time (real rule — you can look
  through your own Extra Deck whenever you like), via the same
  card-grid modal as the Graveyard. The opponent's Extra Deck shows a
  count only — no click handler, no card data ever sent to the
  browser for it.
- Banished cards (public/face-up in this engine) are viewable for
  both players, same modal.
- The Graveyard/Extra Deck/Banish viewers now share one generalized
  `openCardListModal()` function instead of three separate
  copy-pasted implementations.

**Playmat repositioned** to match the real card-game layout: Field
Spell Zone (top) and Extra Deck (bottom) on the left of the Monster/
Spell-Trap grid; Banished (top), Graveyard (middle), and Deck
(bottom) on the right — same arrangement for both players' rows. The
Field Spell Zone itself is a visual placeholder only (neither current
deck contains a Field Spell card, so there's no game logic to wire up
yet — worth a follow-up once one's actually in a deck).

**One more real crash found and fixed while re-testing all this:**
Change of Heart/Brain Control-style temporary control returns the
monster to its original owner at the End Phase — but if that owner's
Monster Zone filled up while their monster was on loan (they can
still Summon normally during that time), the auto-return crashed
trying to add it to a full zone. Now it falls back to leaving the
monster with the current controller and logs why, instead of
crashing.

>>>>>>> bac8aac (16th)
