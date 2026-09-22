/**
 * CardPrimitives.js
 *
 * A small library of reusable, generic gameplay operations — the actual
 * "verbs" almost every Yu-Gi-Oh! card effect is built from (destroy,
 * draw, search, Special Summon, change ATK/DEF, change battle position,
 * banish, negate, discard, mill, gain/inflict LP, equip, tribute).
 *
 * This file is deliberately engine-facing but CARD-agnostic: nothing in
 * here knows the name of a single card. CardEffectsDB.js (or Effects.js)
 * composes these primitives into the specific effect of a specific card.
 * That split is what makes it possible to cover thousands of cards
 * without writing thousands of one-off, hand-rolled game-state mutations
 * — most cards are 1-3 primitive calls in sequence.
 *
 * Every primitive takes `game` (the MainGame instance) first, mirrors
 * the parameter order/shape MainGame.js and Effects.js already use
 * elsewhere in this project, and returns a small result object so a
 * calling handler can log something meaningful or make a follow-up
 * decision (e.g. "was anything actually destroyed?").
 *
 * None of these primitives call game.checkForWinner() or addLog() on
 * your behalf for every micro-step — the calling card handler stays in
 * charge of its own single, readable log line and win-check, exactly
 * like every hand-written effect elsewhere in this codebase already does.
 */

"use strict";

// --------------------------------------------------------------------
// DESTRUCTION
// --------------------------------------------------------------------

/**
 * Destroys a single monster (respects Union Monster protection and any
 * other redirection Player.moveCard already implements, since this is
 * just a thin wrapper around it — nothing here needs its own protection
 * logic, that lives in exactly one place).
 */
function destroyMonster(game, gc) {
    if (!gc || gc.location !== "monster") return { destroyed: false };
    const owner = gc.owner;
    owner.moveCard(gc, "monster", "graveyard");
    return { destroyed: true, name: gc.card.name, owner };
}

/** Destroys every monster a given player currently controls. */
function destroyAllMonsters(game, player) {
    const targets = player.getMonstersOnField();
    targets.forEach(m => player.moveCard(m, "monster", "graveyard"));
    return { count: targets.length, names: targets.map(m => m.card.name) };
}

/** Destroys every monster BOTH players control. */
function destroyAllMonstersBothSides(game) {
    const a = destroyAllMonsters(game, game.player1);
    const b = destroyAllMonsters(game, game.player2);
    return { count: a.count + b.count };
}

/** Destroys every Spell/Trap a given player currently controls. */
function destroyAllSpellTraps(game, player) {
    const targets = player.getSpellTrapsOnField();
    targets.forEach(c => player.moveCard(c, "spellTrap", "graveyard"));
    return { count: targets.length, names: targets.map(c => c.card.name) };
}

/** Destroys every Spell/Trap BOTH players control. */
function destroyAllSpellTrapsBothSides(game) {
    const a = destroyAllSpellTraps(game, game.player1);
    const b = destroyAllSpellTraps(game, game.player2);
    return { count: a.count + b.count };
}

/** Destroys every monster on the field matching a predicate(cardData). */
function destroyAllMonstersMatching(game, predicate) {
    const all = [...game.player1.getMonstersOnField(), ...game.player2.getMonstersOnField()];
    const targets = all.filter(m => predicate(m.card));
    targets.forEach(m => m.owner.moveCard(m, "monster", "graveyard"));
    return { count: targets.length, names: targets.map(m => m.card.name) };
}

/** Destroys a single Spell/Trap Card on the field. */
function destroySpellTrap(game, gc) {
    if (!gc || gc.location !== "spellTrap") return { destroyed: false };
    const owner = gc.owner;
    owner.moveCard(gc, "spellTrap", "graveyard");
    return { destroyed: true, name: gc.card.name, owner };
}

// --------------------------------------------------------------------
// BANISH ("Remove from Play" in older/classic wording)
// --------------------------------------------------------------------

function banish(game, gc) {
    if (!gc) return { banished: false };
    const owner = gc.owner;
    const from = gc.location;
    owner.moveCard(gc, from, "banished");
    return { banished: true, name: gc.card.name };
}

// --------------------------------------------------------------------
// CARD ADVANTAGE: draw / discard / mill / search
// --------------------------------------------------------------------

function drawCards(game, player, n) {
    const drawn = player.drawCard(n);
    return { drawn: drawn.length, cards: drawn };
}

/** Discards up to n RANDOM cards from hand (no UI for player choice yet —
 *  fine for costs/effects where the classic ruling lets the opponent
 *  choose or it's random; a chosen-discard variant can be layered on
 *  top by a handler that already has a specific card in hand). */
function discardRandom(game, player, n) {
    const discarded = [];
    for (let i = 0; i < n && player.zone.hand.length > 0; i++) {
        const idx = Math.floor(Math.random() * player.zone.hand.length);
        const card = player.zone.hand[idx];
        player.moveCard(card, "hand", "graveyard");
        discarded.push(card);
    }
    return { count: discarded.length, cards: discarded };
}

function discardCard(game, player, gc) {
    if (!gc || gc.location !== "hand") return { discarded: false };
    player.moveCard(gc, "hand", "graveyard");
    return { discarded: true, name: gc.card.name };
}

/** Mills (deck -> graveyard) the top n cards of a player's deck. */
function millCards(game, player, n) {
    const milled = [];
    for (let i = 0; i < n && player.zone.deck.length > 0; i++) {
        const card = player.zone.deck[0];
        player.moveCard(card, "deck", "graveyard");
        milled.push(card);
    }
    return { count: milled.length, cards: milled };
}

/**
 * Generic "search your Deck for 1 card matching X and add it to your
 * hand" primitive. `predicate` is a function(cardData) => boolean run
 * against each GameCard's underlying .card data. Returns the found
 * card (already moved to hand) or null if nothing matched.
 */
function searchDeckToHand(game, player, predicate) {
    const found = player.zone.deck.find(gc => predicate(gc.card));
    if (!found) return { found: false };
    player.moveCard(found, "deck", "hand");
    // Real tournament rules require revealing exactly which card a
    // search effect found to the opponent.
    if (typeof game.revealSearchedCard === "function") game.revealSearchedCard(player, found);
    return { found: true, name: found.card.name, card: found };
}

/** Convenience wrapper: search by exact card name (the extremely common
 *  "Add 1 '<Name>' from your Deck to your hand" template). */
function searchDeckToHandByName(game, player, exactName) {
    const target = exactName.trim().toLowerCase();
    return searchDeckToHand(game, player, c => c.name.trim().toLowerCase() === target);
}

// --------------------------------------------------------------------
// SPECIAL SUMMON
// --------------------------------------------------------------------

function specialSummonFrom(game, player, gc, fromZone, position = "attack") {
    if (!gc) return { summoned: false };
    if (player.getFreeMonsterSlot() === -1) return { summoned: false, reason: "no free zone" };
    player.moveCard(gc, fromZone, "monster");
    gc.faceUp = true;
    gc.position = position;
    gc.state.hasBeenSummonedThisTurn = true;
    return { summoned: true, name: gc.card.name };
}

function specialSummonFromGraveyard(game, player, gc, position = "attack") {
    return specialSummonFrom(game, player, gc, "graveyard", position);
}

function specialSummonFromHand(game, player, gc, position = "attack") {
    return specialSummonFrom(game, player, gc, "hand", position);
}

// --------------------------------------------------------------------
// LIFE POINTS
// --------------------------------------------------------------------

function inflictDamage(game, player, amount) {
    if (amount <= 0) return { dealt: 0 };
    const before = player.lifePoints;
    player.dealDamage(amount);
    return { dealt: before - player.lifePoints };
}

function gainLifePoints(game, player, amount) {
    if (amount <= 0) return { gained: 0 };
    player.lifePoints += amount;
    return { gained: amount };
}

// --------------------------------------------------------------------
// STAT / POSITION MODIFICATION
// --------------------------------------------------------------------

/** Adjusts ATK/DEF for the rest of the turn only (cleared automatically
 *  via game.turnEffects, the same mechanism every other temporary boost
 *  in this project already uses). */
function modifyStatsTemporary(game, gc, atkDelta, defDelta) {
    gc.modifiers.atk += atkDelta;
    gc.modifiers.def += defDelta;
    game.turnEffects.push(() => {
        // BUGFIX: see the matching comment on tempStatBoost in Effects.js
        // — don't re-subtract a delta from a card whose modifiers were
        // already zeroed out by Player.moveCard when it left the field.
        if (gc.location !== "monster") return;
        gc.modifiers.atk -= atkDelta;
        gc.modifiers.def -= defDelta;
    });
    return { atkDelta, defDelta };
}

/** Adjusts ATK/DEF permanently (equip cards, and the small number of
 *  monster effects with a lasting, not turn-scoped, stat change). */
function modifyStatsPermanent(game, gc, atkDelta, defDelta) {
    gc.modifiers.atk += atkDelta;
    gc.modifiers.def += defDelta;
    return { atkDelta, defDelta };
}

function changeBattlePosition(game, gc, position) {
    if (!gc || gc.location !== "monster") return { changed: false };
    gc.position = position;
    return { changed: true, position };
}

// --------------------------------------------------------------------
// EQUIP
// --------------------------------------------------------------------

/** A flat, permanent +atk/+def Equip Spell — by far the most common
 *  Equip Spell template in the classic card pool. */
function equipStatBoost(game, equipGc, targetGc, atkDelta, defDelta) {
    modifyStatsPermanent(game, targetGc, atkDelta, defDelta);
    equipGc.equippedTo = targetGc.instanceId;
    return { atkDelta, defDelta, targetName: targetGc.card.name };
}

// --------------------------------------------------------------------
// TRIBUTE
// --------------------------------------------------------------------

function tributeMonster(game, player, gc) {
    if (!gc || gc.location !== "monster") return { tributed: false };
    player.moveCard(gc, "monster", "graveyard");
    return { tributed: true, name: gc.card.name };
}

// --------------------------------------------------------------------
// NEGATION (Counter Traps, and the handful of Quick-Play/Continuous
// Spells that negate rather than destroy)
// --------------------------------------------------------------------

/** Negates the activation of a still-resolving Spell/Trap and sends it
 *  to the Graveyard. In this engine's turn-resolution model, activated
 *  Spell/Traps resolve immediately inside their own handler, so a
 *  "negate the activation" effect that fires as its OWN card's handler
 *  targets an opponent's card that hasn't fully resolved yet — callers
 *  should use this from a needsTarget:"spellTrap" handler. */
function negateActivation(game, targetGc) {
    if (!targetGc) return { negated: false };
    const owner = targetGc.owner;
    owner.moveCard(targetGc, "spellTrap", "graveyard");
    return { negated: true, name: targetGc.card.name };
}

/** Marks a face-up monster's effects as negated for as long as it
 *  remains on the field (matches the existing `effectsNegated` flag
 *  used by Fiendish Chain/Lord of D.-style cards elsewhere). */
function negateMonsterEffect(game, gc) {
    if (!gc) return { negated: false };
    gc.modifiers.effectsNegated = true;
    return { negated: true, name: gc.card.name };
}

module.exports = {
    destroyMonster,
    destroyAllMonsters,
    destroyAllMonstersBothSides,
    destroyAllMonstersMatching,
    destroyAllSpellTraps,
    destroyAllSpellTrapsBothSides,
    destroySpellTrap,
    banish,
    drawCards,
    discardRandom,
    discardCard,
    millCards,
    searchDeckToHand,
    searchDeckToHandByName,
    specialSummonFrom,
    specialSummonFromGraveyard,
    specialSummonFromHand,
    inflictDamage,
    gainLifePoints,
    modifyStatsTemporary,
    modifyStatsPermanent,
    changeBattlePosition,
    equipStatBoost,
    tributeMonster,
    negateActivation,
    negateMonsterEffect
};
