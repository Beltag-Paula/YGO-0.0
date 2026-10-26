# YGO Duel Simulator (DM / early GX era)

`npm install && npm start` → http://localhost:3000

* **Solo Duel** – pick your deck and the bot's deck. Duelist decks show their owner's portrait (Yugi, Kaiba, Joey, Mai, Jesse, Jaden).
* **Deck Builder** (`/builder`) – search all 2,838 cards (name / effect text / passcode, attribute, race, level, script status), click to add, right-click or Shift-click for the Side Deck, click a deck card to remove it. Fusion/Synchro cards route to the Extra Deck automatically; max 3 copies, 60/15/15 limits enforced by the server. Save, save as copy, delete, export `.ydk`. Duelist decks open as an editable copy.
* **Decks** – inventory, rename, delete, upload `.ydk`, edit.
* Decks are plain JSON in `deck_inventory/`; the optional `owner` field picks the portrait.

## Card scripts
`scripts/*.js` hand-written effects, plus `scripts/96_text_compiler.js`, a strict text→effect compiler (selectors, costs, targets, ~35 clause forms, trigger forms: Flip, Summon, Ignition, GY, Hand, Standby). Unknown clauses are never guessed: a card with an unknown tail is registered **partial** with a note. Workflow to add more cards cheaply:

    node tools/diagnose.js 40 spell     # which clause blocks the most stub cards?
    node tools/diagnose.js 40 monster
    # add one rule to ACTIONS in scripts/96_text_compiler.js, then
    npm test && node tools/coverage.js --write

## UI
* **Colour themes** – blue / red / yellow / purple (diamond swatches in the top bar, ◈ button in a duel). Everything is driven by one `--hue` variable in `public/css/md.css`; `python3 tools/themeify.py file.css` converts new blue colours to the variable.
* **Round avatars in icon frames** – `views/images/frames` (geometry in `public/js/frames.js`) around any picture from `views/images/avatar`. Pick yours on Solo Duel; decks can carry their own in the builder.
* Card backs come from `views/images/card-back.jpg`; coin calls use `views/images/coin`.

## Tools
`node tools/smoke_decks.js` (every shipped-deck card, per scenario) · `node tools/blockers.js` (why cards are still unscripted) · `node tools/diagnose.js` · `node tests/fuzz.js 100 1 ai`.
