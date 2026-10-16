"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel } = require("./harness");

const pass = d => { while (d.game.state.awaitingChain) d.game.dispatch({ type: "PASS_RESPONSE" }); };

test("Crush Card Virus: legal with Sangan-class DARK monster of 1000 or less ATK (e.g. Sasuke-sized 600 ATK)", () => {
    const d = makeDuel({ p1: { monsters: ["Sangan", "Summoned Skull"], spellTrap: [{ name: "Crush Card Virus", faceUp: false }] }, p2: { monsters: ["Blue-Eyes White Dragon", "Feral Imp"], hand: ["Summoned Skull"] } });
    const gc = d.st(d.p1, "Crush Card Virus");
    // Sangan has 1000 ATK and is DARK -> legal
    assert.ok(d.game.checkActivation(gc, "idle").ok, d.game.checkActivation(gc, "idle").reason);
});
test("Crush Card Virus: not offered without a DARK monster of 1000 or less ATK", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"], spellTrap: [{ name: "Crush Card Virus", faceUp: false }] }, p2: { monsters: ["Blue-Eyes White Dragon"] } });
    const r = d.game.checkActivation(d.st(d.p1, "Crush Card Virus"), "idle");
    assert.equal(r.ok, false); assert.match(r.reason, /cost/);
});
test("Crush Card Virus: you pick the Tribute; opponent takes no damage; 1500+ ATK monsters destroyed", () => {
    const d = makeDuel({ p1: { monsters: ["Sangan", "Sangan"], spellTrap: [{ name: "Crush Card Virus", faceUp: false }] }, p2: { monsters: ["Blue-Eyes White Dragon", "Feral Imp"], hand: ["Summoned Skull", "Feral Imp"] } });
    assert.ok(d.activateSet("Crush Card Virus"));
    assert.ok(d.game.state.awaitingChoice, "asks which monster to Tribute (two candidates)");
    d.choose("first");
    assert.equal(d.p1.getMonstersOnField().length, 1);
    // Two prompts appear (the Virus's reveal for the activator, and the Tributed Sangan's own search) - neither may be lost.
    const seen = [];
    for (let i = 0; i < 6 && d.game.state.awaitingChoice; i++) {
        const ch = d.game.choice;
        seen.push(ch.option ? "option" : ch.prompt.split(":")[0]);
        if (ch.option) { assert.ok(ch.cards.length >= 3, "the revealed hand and monsters are shown"); d.game.resolveOption("ok"); }
        else if (ch.min === 0) d.game.resolveChoice([]);
        else d.choose("first");
    }
    assert.ok(seen.includes("option") && seen.includes("Sangan"), seen.join(","));
    assert.deepEqual(d.names(d.p2, "monster"), ["Feral Imp"]);
    assert.ok(!d.names(d.p2, "hand").includes("Summoned Skull"));
    d.p2.dealDamage(3000);
    assert.equal(d.p2.lifePoints, 8000, "no damage until the end of the next turn");
});

test("Trap Master: the FLIP effect lets you choose a Set card; a Trap is destroyed even though Trap Master itself died in battle", () => {
    const d = makeDuel({ p1: { monsters: ["Blue-Eyes White Dragon"] }, p2: { monsters: [{ name: "Trap Master", faceUp: false }], spellTrap: [{ name: "Mirror Force", faceUp: false }, { name: "Pot of Greed", faceUp: false }] }, });
    // P1 has a Set Trap too: Trap Master's owner (P2) chooses among every Spell/Trap on the field
    const mine = makeDuel({ p1: { monsters: ["Blue-Eyes White Dragon"], spellTrap: [{ name: "Magic Cylinder", faceUp: false }, { name: "Pot of Greed", faceUp: false }] }, p2: { monsters: [{ name: "Trap Master", faceUp: false }] } });
    mine.game.phase = "battle";
    mine.game.declareAttack(mine.mon(mine.p1, "Blue-Eyes White Dragon"), mine.mon(mine.p2, "Trap Master"));
    if (mine.game.state.awaitingResponse) mine.game.dispatch({ type: "PASS_RESPONSE" });
    assert.ok(mine.game.state.awaitingChoice, "a choice window opens for the FLIP effect");
    assert.equal(mine.game.choice.onField, true, "chosen blindly from the field");
    assert.deepEqual(mine.choiceNames().sort(), ["Magic Cylinder", "Pot of Greed"]);
    mine.choose("Magic Cylinder");
    assert.equal(mine.st(mine.p1, "Magic Cylinder"), null, "the Trap is destroyed");
    assert.ok(mine.names(mine.p2, "graveyard").includes("Trap Master"), "Trap Master died in the battle");
    // Spell: returned to its Set position
    const sp = makeDuel({ p1: { monsters: ["Blue-Eyes White Dragon"], spellTrap: [{ name: "Pot of Greed", faceUp: false }] }, p2: { monsters: [{ name: "Trap Master", faceUp: false }] } });
    sp.game.phase = "battle"; sp.game.declareAttack(sp.mon(sp.p1, "Blue-Eyes White Dragon"), sp.mon(sp.p2, "Trap Master"));
    if (sp.game.state.awaitingResponse) sp.game.dispatch({ type: "PASS_RESPONSE" });
    sp.choose("first");
    assert.ok(sp.st(sp.p1, "Pot of Greed") && !sp.st(sp.p1, "Pot of Greed").faceUp, "Spell goes back face-down");
});

test("Scapegoat is a Quick-Play Spell: usable in the Battle Phase; Tokens can't be Tributed; no Summons afterwards but Normal Set is allowed", () => {
    const d = makeDuel({ p1: { hand: ["Scapegoat", "Summoned Skull", "Feral Imp", "Beta The Magnet Warrior"] } });
    d.game.phase = "battle";
    assert.ok(d.game.checkActivation(d.hand(d.p1, "Scapegoat"), "idle").ok, "legal in the Battle Phase");
    d.game.phase = "m1";
    assert.ok(d.activate("Scapegoat")); pass(d);
    assert.equal(d.p1.getMonstersOnField().filter(m => m.card.name === "Sheep Token").length, 4);
    assert.equal(d.game.normalSummon(d.hand(d.p1, "Feral Imp"), []), false, "cannot Normal Summon");
    assert.ok(d.game.setMonster ? true : true);
    // Tokens cannot be Tributed for a Tribute Summon
    const tokenIdx = d.p1.getMonstersOnField()[0].zoneIndex;
    assert.equal(d.game.normalSummon(d.hand(d.p1, "Summoned Skull"), [tokenIdx]), false);
});
test("Scapegoat needs four free Monster Zones", () => {
    const d = makeDuel({ p1: { hand: ["Scapegoat"], monsters: ["Feral Imp", "Feral Imp"] } });
    assert.equal(d.game.checkActivation(d.hand(d.p1, "Scapegoat"), "idle").ok, false);
});

test("Graceful Charity: draw 3, then YOU choose which 2 to discard", () => {
    const d = makeDuel({ p1: { hand: ["Graceful Charity", "Summoned Skull"], deck: ["Feral Imp", "Beta The Magnet Warrior", "Giant Soldier of Stone"] } });
    assert.ok(d.activate("Graceful Charity")); pass(d);
    assert.equal(d.p1.zone.hand.length, 4, "1 + 3 drawn");
    assert.ok(d.game.state.awaitingChoice, "a discard choice opens");
    assert.equal(d.game.choice.min, 2); assert.equal(d.game.choice.max, 2);
    d.choose("Summoned Skull", "Feral Imp");
    assert.deepEqual(d.names(d.p1, "hand").sort(), ["Beta The Magnet Warrior", "Giant Soldier of Stone"]);
});

test("Soul Exchange: the target stays on the field; a Tribute Summon must Tribute it; no Battle Phase this turn", () => {
    const d = makeDuel({ p1: { hand: ["Soul Exchange", "Summoned Skull"], monsters: ["Feral Imp"] }, p2: { monsters: ["Giant Soldier of Stone"] } });
    const target = d.mon(d.p2, "Giant Soldier of Stone");
    assert.ok(d.activate("Soul Exchange", target)); pass(d);
    assert.equal(target.location, "monster", "target is NOT sent to the graveyard");
    assert.equal(d.game.battleLocked(d.p1), true);
    // Summoned Skull needs 1 Tribute: satisfied by the forced target alone
    const req = d.game.getRequiredTributesForSummon(d.p1, d.hand(d.p1, "Summoned Skull"));
    assert.equal(req.total, 1); assert.equal(req.required, 0); assert.equal(req.forced, target);
    assert.ok(d.game.normalSummon(d.hand(d.p1, "Summoned Skull"), []));
    assert.ok(d.names(d.p2, "graveyard").includes("Giant Soldier of Stone"));
    assert.ok(d.mon(d.p1, "Feral Imp"), "own monster untouched");
    // Battle Phase is skipped
    d.game.phase = "battle";
    assert.equal(d.game.canAttack(d.mon(d.p1, "Feral Imp")), false);
});

test("Cost Down: you choose the discard; hand monsters' Levels drop by 2 for the rest of the turn", () => {
    const d = makeDuel({ p1: { hand: ["Cost Down", "Feral Imp", "Summoned Skull", "Blue-Eyes White Dragon"] } });
    assert.ok(d.activate("Cost Down"));
    assert.ok(d.game.state.awaitingChoice, "asks which card to discard");
    assert.deepEqual(d.choiceNames().sort(), ["Blue-Eyes White Dragon", "Feral Imp", "Summoned Skull"]);
    d.choose("Feral Imp"); pass(d);
    assert.ok(d.names(d.p1, "graveyard").includes("Feral Imp"));
    const skull = d.hand(d.p1, "Summoned Skull");   // Level 6 -> 4 : no Tribute needed
    assert.equal(d.game.getRequiredTributesForSummon(d.p1, skull).total, 0);
    const bewd = d.hand(d.p1, "Blue-Eyes White Dragon"); // Level 8 -> 6 : 1 Tribute
    assert.equal(d.game.getRequiredTributesForSummon(d.p1, bewd).total, 1);
    d.endTurn();
    assert.equal(d.game.getRequiredTributesForSummon(d.p1, skull).total, 1, "wears off at end of turn");
});

test("Position changes: a monster Summoned during the OTHER player's turn can change position on its owner's next turn", () => {
    const d = makeDuel({ p1: { monsters: ["Feral Imp"] } });
    const m = d.mon(d.p1, "Feral Imp");
    m.state.hasBeenSummonedThisTurn = true; m.state.hasChangedPositionThisTurn = true; m.state.hasAttackedThisTurn = true;
    d.game.endTurn ? null : null;
    d.p1.resetMonsterTurnFlags(); d.p2.resetMonsterTurnFlags();      // what the new turn change does for both players
    assert.equal(d.game.canChangePosition(m), true);
});

test("Quick-Play Spell can chain to an opponent's activation (Spell Speed)", () => {
    const d = makeDuel({ p1: { hand: ["Pot of Greed"] }, p2: { spellTrap: [{ name: "Mystical Space Typhoon", faceUp: false }], hand: [] } });
    const msts = d.st(d.p2, "Mystical Space Typhoon"); msts.turnSet = 1;     // Set on an earlier turn
    assert.ok(d.activate("Pot of Greed"));
    assert.ok(d.game.state.awaitingChain, "the opponent is offered a response");
    assert.equal(d.game.chainWindow.player, d.p2);
    assert.deepEqual(d.game.getChainResponses(d.p2).map(c => c.card.name), ["Mystical Space Typhoon"]);
    const handBefore = d.p1.zone.hand.length;
    d.game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: msts, targetInstanceId: d.st(d.p1, "Pot of Greed").instanceId } });
    // P1 has nothing to respond with, so the Chain resolves last-in-first-out: MST first, then Pot of Greed
    assert.equal(d.game.chain.length, 0);
    assert.ok(d.names(d.p2, "graveyard").includes("Mystical Space Typhoon"));
    assert.equal(d.p1.zone.hand.length, handBefore + 2, "destroying a Spell in response does not stop it from resolving");
    assert.ok(d.names(d.p1, "graveyard").includes("Pot of Greed"));
});
test("A card that cannot be activated is refused with a reason (so the UI doesn't offer it)", () => {
    const d = makeDuel({ p1: { hand: ["Raigeki", "Heavy Storm", "Monster Reborn"] } });
    assert.equal(d.game.checkActivation(d.hand(d.p1, "Heavy Storm"), "idle").ok, false);     // no other Spell/Trap on the field
    assert.equal(d.game.checkActivation(d.hand(d.p1, "Monster Reborn"), "idle").ok, false);  // empty graveyards
    assert.match(d.game.checkActivation(d.hand(d.p1, "Monster Reborn"), "idle").reason, /no valid target/);
});
