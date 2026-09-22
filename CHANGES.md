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
