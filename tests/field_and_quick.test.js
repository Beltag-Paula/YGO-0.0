"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel } = require("./harness");
const AI = require("../AIController");
const settle = d => { for (let i = 0; i < 10 && (d.game.state.awaitingChain || d.game.state.awaitingChoice); i++) { if (!d.game.state.awaitingChoice) d.game.dispatch({ type: "PASS_RESPONSE" }); else if (d.game.choice.option) d.game.resolveOption(d.game.choice.options[0].id); else d.choose("first"); } };

// -------------------------------------------------------------------- 1. Field Zone
test("A Field Spell is Set into the FIELD ZONE (not a Spell & Trap Zone) and can be activated from there", () => {
    const d = makeDuel({ p1: { hand: ["The Seal of Orichalcos"] } });
    const gc = d.hand(d.p1, "The Seal of Orichalcos");
    assert.ok(d.game.setSpellTrap(gc));
    assert.equal(d.p1.zone.field, gc); assert.equal(gc.location, "field"); assert.equal(gc.faceUp, false);
    assert.equal(d.p1.zone.spellTrap.filter(Boolean).length, 0, "no Spell & Trap Zone used");
    gc.turnSet = d.game.turn;                                        // Set this very turn
    assert.ok(d.game.checkActivation(gc, "idle").ok, "a Set Field Spell can be activated the turn it is Set");
    assert.ok(d.game.activateSetCard(gc, null, null)); settle(d);
    assert.equal(gc.faceUp, true); assert.equal(d.p1.zone.field, gc);
});
test("Activating a Field Spell from the hand puts it in the Field Zone; a new Field Spell replaces the old one", () => {
    const d = makeDuel({ p1: { hand: ["Rising Air Current", "Wetlands"] } });
    assert.ok(d.activate("Rising Air Current")); settle(d);
    assert.equal(d.p1.zone.field.card.name, "Rising Air Current");
    assert.ok(d.activate("Wetlands")); settle(d);
    assert.equal(d.p1.zone.field.card.name, "Wetlands");
    assert.ok(d.names(d.p1, "graveyard").includes("Rising Air Current"), "the old Field Spell goes to the Graveyard");
});
test("Field Spells show up as Spell/Trap Cards for removal (Heavy Storm)", () => {
    const d = makeDuel({ p1: { hand: ["Heavy Storm"] }, p2: { hand: ["Wetlands"] } });
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.activate("Wetlands", null, d.p2); settle(d);
    d.game.currentPlayer = d.p1; d.game.opponentPlayer = d.p2;
    d.activate("Heavy Storm"); settle(d);
    assert.equal(d.p2.zone.field, null);
});

// -------------------------------------------------------------------- The Seal of Orichalcos
test("The Seal of Orichalcos: +500 ATK to your monsters; destroys your Special Summoned monsters on activation", () => {
    const d = makeDuel({ p1: { hand: ["The Seal of Orichalcos"], monsters: ["Feral Imp", "Summoned Skull"] }, p2: { monsters: ["Feral Imp"] } });
    const ss = d.mon(d.p1, "Summoned Skull"); ss.state.summonType = "special";
    const [mine, theirs] = [d.atk("Feral Imp", d.p1), d.atk("Feral Imp", d.p2)];
    assert.ok(d.activate("The Seal of Orichalcos")); settle(d);
    assert.equal(d.mon(d.p1, "Summoned Skull"), null, "the Special Summoned monster is destroyed");
    assert.equal(d.atk("Feral Imp", d.p1), mine + 500); assert.equal(d.atk("Feral Imp", d.p2), theirs);
});
test("The Seal of Orichalcos: once per Duel, and no Extra Deck Special Summons", () => {
    const d = makeDuel({ p1: { hand: ["The Seal of Orichalcos", "Polymerization"], monsters: ["Summoned Skull", "Red-Eyes Black Dragon"], extra: ["Black Skull Dragon"] } });
    d.activate("The Seal of Orichalcos"); settle(d);
    const fusion = d.p1.zone.extraDeck[0];
    assert.equal(d.game.checkActivation(d.hand(d.p1, "Polymerization"), "idle").ok, false, "Polymerization is locked");
    assert.match(d.game.checkActivation(d.hand(d.p1, "Polymerization"), "idle").reason, /Extra Deck/);
    d.p1.moveCard(d.p1.zone.field, "field", "graveyard");
    d.p1.sealActivated = true;
    assert.equal(makeDuel({ p1: { hand: ["The Seal of Orichalcos"] } }).game.checkActivation(null, "idle").ok, false);
});
test("The Seal of Orichalcos: cannot be destroyed by card effects ONCE per turn", () => {
    const d = makeDuel({ p1: { hand: ["The Seal of Orichalcos"] }, p2: { hand: ["Heavy Storm", "Heavy Storm"] } });
    d.activate("The Seal of Orichalcos"); settle(d);
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1;
    d.activate("Heavy Storm", null, d.p2); settle(d);
    assert.ok(d.p1.zone.field, "survived the first destruction this turn");
    d.activate("Heavy Storm", null, d.p2); settle(d);
    assert.equal(d.p1.zone.field, null, "the second one in the same turn destroys it");
});
test("The Seal of Orichalcos: with 2+ face-up Attack Position monsters the lowest-ATK one can't be attacked", () => {
    const d = makeDuel({ p1: { hand: ["The Seal of Orichalcos"], monsters: ["Feral Imp", "Summoned Skull"] }, p2: { monsters: ["Beta The Magnet Warrior"] } });
    d.activate("The Seal of Orichalcos"); settle(d);
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.game.phase = "battle";
    assert.equal(d.game.declareAttack(d.mon(d.p2, "Beta The Magnet Warrior"), d.mon(d.p1, "Feral Imp")), false, "lowest ATK is protected");
    assert.notEqual(d.game.declareAttack(d.mon(d.p2, "Beta The Magnet Warrior"), d.mon(d.p1, "Summoned Skull")), false);
});

// -------------------------------------------------------------------- 2. priority before an attack
test("The opponent gets priority at the START of the Battle Phase: a Set Spellbinding Circle stops the monster BEFORE it attacks", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"] }, p2: { spellTrap: [{ name: "Spellbinding Circle", faceUp: false }] } });
    d.game.phase = "battle";
    d.game.battlePhase();
    assert.ok(d.game.state.awaitingChain, "a priority window opened");
    assert.equal(d.game.chainWindow.player, d.p2);
    const skull = d.mon(d.p1, "Summoned Skull");
    d.game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: d.st(d.p2, "Spellbinding Circle"), targetInstanceId: skull.instanceId } });
    settle(d);
    assert.equal(d.game.canAttack(skull), false, "the monster is paralysed before it can declare an attack");
    assert.equal(d.game.state.awaitingChain, false);
});
test("Passing the priority window simply lets the Battle Phase continue", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"] }, p2: { spellTrap: [{ name: "Spellbinding Circle", faceUp: false }] } });
    d.game.phase = "battle"; d.game.battlePhase();
    d.game.dispatch({ type: "PASS_RESPONSE" });
    assert.equal(d.game.state.awaitingChain, false); assert.equal(d.game.canAttack(d.mon(d.p1, "Summoned Skull")), true);
});
test("No window opens if the opponent has nothing to activate", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"] } });
    d.game.phase = "battle"; d.game.battlePhase();
    assert.equal(d.game.state.awaitingChain, false);
});
test("The bot uses the same window: it paralyses your best monster before you can attack", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"] }, p2: { spellTrap: [{ name: "Spellbinding Circle", faceUp: false }] } });
    d.game.phase = "battle"; d.game.battlePhase();
    assert.ok(d.game.state.awaitingChain);
    AI.step(d.game);
    assert.equal(d.game.canAttack(d.mon(d.p1, "Summoned Skull")), false);
});
test("Spellbinding Circle is destroyed when its target is destroyed OR Tributed", () => {
    const d = makeDuel({ p1: { hand: ["Blue-Eyes White Dragon"], spellTrap: [{ name: "Spellbinding Circle", faceUp: false }] }, p2: { monsters: ["Feral Imp"] } });
    d.activateSet("Spellbinding Circle", d.mon(d.p2, "Feral Imp")); settle(d);
    d.p2.zone.monster.forEach(m => { if (m) { m._noReplace = true; d.p2.moveCard(m, "monster", "graveyard"); } });   // Tributed
    d.game.checkForWinner();
    assert.equal(d.p1.getSpellTrapsOnField().length, 0);
});

// -------------------------------------------------------------------- 3. Heart of the Underdog
test("Heart of the Underdog: draw a Normal Monster in the Draw Phase -> reveal it and draw 1 more", () => {
    const d = makeDuel({ p1: { spellTrap: ["Heart of the Underdog"], deck: ["Feral Imp", "Pot of Greed"] } });
    d.game.phase = "draw"; d.game.state.waitingForAction = false;
    const hand = d.p1.zone.hand.length;
    d.game.nextPhase();
    assert.ok(d.game.state.awaitingChoice && d.game.choice.option, "you are asked whether to reveal it");
    assert.equal(d.game.choice.cards[0].card.name, "Feral Imp");
    d.game.resolveOption("yes");
    assert.equal(d.p1.zone.hand.length, hand + 2);
    assert.ok(d.names(d.p1, "hand").includes("Pot of Greed"));
});
test("Heart of the Underdog chains: a second Normal Monster draws another card; declining draws nothing extra", () => {
    const d = makeDuel({ p1: { spellTrap: ["Heart of the Underdog"], deck: ["Feral Imp", "Beta The Magnet Warrior", "Pot of Greed"] } });
    d.game.phase = "draw"; d.game.state.waitingForAction = false; const hand = d.p1.zone.hand.length;
    d.game.nextPhase(); d.game.resolveOption("yes");
    assert.ok(d.game.state.awaitingChoice, "Beta is also a Normal Monster");
    d.game.resolveOption("yes");
    assert.equal(d.p1.zone.hand.length, hand + 3);
    const e = makeDuel({ p1: { spellTrap: ["Heart of the Underdog"], deck: ["Feral Imp", "Pot of Greed"] } });
    e.game.phase = "draw"; e.game.state.waitingForAction = false; const h2 = e.p1.zone.hand.length;
    e.game.nextPhase(); e.game.resolveOption("no");
    assert.equal(e.p1.zone.hand.length, h2 + 1);
});
test("Heart of the Underdog does nothing for a non-Normal draw", () => {
    const d = makeDuel({ p1: { spellTrap: ["Heart of the Underdog"], deck: ["Pot of Greed", "Feral Imp"] } });
    d.game.phase = "draw"; d.game.state.waitingForAction = false;
    d.game.nextPhase();
    assert.equal(d.game.state.awaitingChoice, false);
});

// -------------------------------------------------------------------- 4. Ultimate Offering
const uoDuel = extra => makeDuel({ p1: { spellTrap: [{ name: "Ultimate Offering", faceUp: true }], ...extra.p1 }, p2: extra.p2 || {} });
test("Ultimate Offering: in your Main Phase, pay 500 LP and Tribute Summon Dark Magician with your own choice of Tributes", () => {
    const d = uoDuel({ p1: { hand: ["Dark Magician", "Feral Imp"], monsters: ["Beta The Magnet Warrior", "Giant Soldier of Stone", "Sangan"] } });
    d.p1.normalSummonedThisTurn = true;        // the normal Summon for the turn is already used
    const uo = d.st(d.p1, "Ultimate Offering");
    const chk = d.game.checkActivation(uo, "idle"); assert.ok(chk.ok, chk.reason);
    assert.ok(d.game.activateCard(uo, null, "idle"));
    assert.equal(d.p1.lifePoints, 7500, "500 LP paid at activation");
    // choose the monster to Summon (Dark Magician) ...
    assert.ok(d.game.choice); assert.deepEqual(d.choiceNames().sort(), ["Dark Magician", "Feral Imp"]);
    d.choose("Dark Magician");
    if (d.game.choice && d.game.choice.option) d.game.resolveOption("summon");
    // ... then YOU choose which 2 monsters to Tribute (Level 7 needs 2)
    assert.match(d.game.choice.prompt, /Tribute/); assert.equal(d.game.choice.min, 2);
    assert.equal(d.game.choice.onField, true);
    d.choose("Beta The Magnet Warrior", "Sangan");
    assert.ok(d.mon(d.p1, "Dark Magician"), "Dark Magician is on the field");
    assert.deepEqual(d.names(d.p1, "monster").sort(), ["Dark Magician", "Giant Soldier of Stone"]);
    assert.ok(d.names(d.p1, "graveyard").includes("Beta The Magnet Warrior"));
});
test("Ultimate Offering during the OPPONENT's Battle Phase (response to an attack), then the battle goes on", () => {
    const d = uoDuel({ p1: { hand: ["Dark Magician"], monsters: ["Feral Imp", "Beta The Magnet Warrior"] }, p2: { monsters: ["Summoned Skull"] } });
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.game.phase = "battle";
    assert.ok(d.game.declareAttack(d.mon(d.p2, "Summoned Skull"), d.mon(d.p1, "Feral Imp")));
    assert.ok(d.game.state.awaitingResponse, "the defender gets an attack response window (because Ultimate Offering is usable)");
    const uo = d.st(d.p1, "Ultimate Offering");
    assert.ok(d.game.getEligibleResponses(d.p1).includes(uo));
    d.game.dispatch({ type: "ACTIVATE_QUICK", payload: { card: uo } });
    assert.equal(d.p1.lifePoints, 7500);
    if (d.game.choice && d.game.choice.min === 1 && !d.game.choice.option) d.choose("first");
    while (d.game.state.awaitingChoice) { if (d.game.choice.option) d.game.resolveOption("summon"); else d.choose("first"); }
    assert.ok(d.mon(d.p1, "Dark Magician"), "Tribute Summoned during the opponent's Battle Phase");
    assert.equal(d.game.state.awaitingResponse, false);
});
test("Ultimate Offering is not offered when it can't do anything (no summonable monster / not enough LP / wrong phase)", () => {
    const none = uoDuel({ p1: { hand: ["Pot of Greed"] } });
    assert.equal(none.game.checkActivation(none.st(none.p1, "Ultimate Offering"), "idle").ok, false);
    const poor = uoDuel({ p1: { hand: ["Feral Imp"], lp: 500 } });
    assert.equal(poor.game.checkActivation(poor.st(poor.p1, "Ultimate Offering"), "idle").ok, false);
    const bp = uoDuel({ p1: { hand: ["Feral Imp"] } });
    bp.game.phase = "battle";
    assert.equal(bp.game.checkActivation(bp.st(bp.p1, "Ultimate Offering"), "idle").ok, false, "your own Battle Phase is not allowed");
});
test("Ultimate Offering can Set instead of Summon, and is usable more than once per turn (500 LP each time)", () => {
    const d = uoDuel({ p1: { hand: ["Feral Imp", "Beta The Magnet Warrior", "Sangan"] } });
    const uo = d.st(d.p1, "Ultimate Offering");
    d.game.activateCard(uo, null, "idle");
    d.choose("Feral Imp"); d.game.resolveOption("set");
    assert.equal(d.mon(d.p1, "Feral Imp").faceUp, false);
    d.game.activateCard(uo, null, "idle"); d.choose("Beta The Magnet Warrior"); d.game.resolveOption("summon");
    assert.equal(d.p1.lifePoints, 7000); assert.equal(d.p1.getMonstersOnField().length, 2);
    assert.equal(d.p1.normalSummonedThisTurn, false, "it was an ADDITIONAL summon: the turn's own Normal Summon is untouched");
});
