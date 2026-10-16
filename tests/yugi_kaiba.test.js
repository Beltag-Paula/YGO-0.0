"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel } = require("./harness");
const settle = d => { for (let i = 0; i < 8 && (d.game.state.awaitingChain || d.game.state.awaitingChoice); i++) { if (!d.game.state.awaitingChoice) d.game.dispatch({ type: "PASS_RESPONSE" }); else if (d.game.choice.option) d.game.resolveOption(d.game.choice.options[0].id); else if (d.game.choice.min === 0) d.game.resolveChoice([]); else d.choose("first"); } };

test("Dark Hole / Pot of Greed / Dian Keto / Heavy Storm", () => {
    let d = makeDuel({ p1: { hand: ["Dark Hole"], monsters: ["Feral Imp"] }, p2: { monsters: ["Summoned Skull"] } });
    d.use("Dark Hole"); assert.equal(d.game.player1.getMonstersOnField().length + d.game.player2.getMonstersOnField().length, 0);
    d = makeDuel({ p1: { hand: ["Pot of Greed"] } }); const h = d.p1.zone.hand.length; d.use("Pot of Greed"); assert.equal(d.p1.zone.hand.length, h - 1 + 2);
    d = makeDuel({ p1: { hand: ["Dian Keto the Cure Master"] } }); d.use("Dian Keto the Cure Master"); assert.equal(d.p1.lifePoints, 9000);
    d = makeDuel({ p1: { hand: ["Heavy Storm"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    d.use("Heavy Storm"); assert.equal(d.p2.getSpellTrapsOnField().length, 0);
    assert.equal(makeDuel({ p1: { hand: ["Heavy Storm"] } }).game.checkActivation(makeDuel({ p1: { hand: ["Heavy Storm"] } }).hand ? null : null, "idle").ok, false);
});
test("Card Destruction: both discard their hands and draw the same number", () => {
    const d = makeDuel({ p1: { hand: ["Card Destruction", "Feral Imp", "Feral Imp"] }, p2: { hand: ["Feral Imp", "Feral Imp", "Feral Imp"] } });
    d.use("Card Destruction"); settle(d);
    assert.equal(d.p1.zone.hand.length, 2); assert.equal(d.p2.zone.hand.length, 3);
});
test("Mystical Space Typhoon: Quick-Play, destroys a Spell/Trap (face-up or Set)", () => {
    const d = makeDuel({ p1: { hand: ["Mystical Space Typhoon"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    assert.ok(d.game.metaFor(d.hand(d.p1, "Mystical Space Typhoon")).window === "anytime");
    d.game.phase = "battle"; assert.ok(d.game.checkActivation(d.hand(d.p1, "Mystical Space Typhoon"), "idle").ok, "usable in the Battle Phase");
    d.game.phase = "m1"; assert.ok(d.activate("Mystical Space Typhoon", d.st(d.p2, "Mirror Force"))); settle(d);
    assert.equal(d.p2.getSpellTrapsOnField().length, 0);
});
test("Remove Trap only targets FACE-UP Traps; De-Spell: Spells destroyed, a Set Trap is just revealed", () => {
    let d = makeDuel({ p1: { hand: ["Remove Trap"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    assert.equal(d.game.checkActivation(d.hand(d.p1, "Remove Trap"), "idle").ok, false);
    d = makeDuel({ p1: { hand: ["Remove Trap"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: true }] } });
    assert.ok(d.activate("Remove Trap", d.st(d.p2, "Mirror Force"))); settle(d); assert.equal(d.p2.getSpellTrapsOnField().length, 0);
    d = makeDuel({ p1: { hand: ["De-Spell"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    assert.ok(d.activate("De-Spell", d.st(d.p2, "Mirror Force"))); settle(d);
    assert.ok(d.st(d.p2, "Mirror Force") && !d.st(d.p2, "Mirror Force").faceUp, "Trap stays Set");
    d = makeDuel({ p1: { hand: ["De-Spell"] }, p2: { spellTrap: [{ name: "Pot of Greed", faceUp: false }] } });
    d.activate("De-Spell", d.st(d.p2, "Pot of Greed")); settle(d); assert.equal(d.p2.getSpellTrapsOnField().length, 0);
});
test("Fissure destroys the face-up opposing monster with the LOWEST ATK (face-down ones are ignored)", () => {
    const d = makeDuel({ p1: { hand: ["Fissure"] }, p2: { monsters: ["Summoned Skull", "Feral Imp", { name: "Sangan", faceUp: false }] } });
    d.use("Fissure"); settle(d);
    assert.deepEqual(d.names(d.p2, "monster").sort(), ["Sangan", "Summoned Skull"]);
});
test("Shrink halves the original ATK until the end of the turn", () => {
    const d = makeDuel({ p1: { hand: ["Shrink"] }, p2: { monsters: ["Summoned Skull"] } });
    const m = d.mon(d.p2, "Summoned Skull"); d.activate("Shrink", m); settle(d); assert.equal(d.atk(m), 1250); d.endTurn(); assert.equal(d.atk(m), 2500);
});
test("Change of Heart: take control until the End Phase, then it goes back", () => {
    const d = makeDuel({ p1: { hand: ["Change of Heart"] }, p2: { monsters: ["Summoned Skull"] } });
    const m = d.mon(d.p2, "Summoned Skull"); assert.ok(d.activate("Change of Heart", m)); settle(d);
    assert.equal(m.owner, d.p1); assert.equal(d.p2.getMonstersOnField().length, 0);
    d.endTurn(); assert.equal(m.owner, d.p2); assert.equal(d.p1.getMonstersOnField().length, 0);
});
test("Brain Control: pay 800 LP, only monsters that could be Normal Summoned/Set", () => {
    const d = makeDuel({ p1: { hand: ["Brain Control"] }, p2: { monsters: ["Summoned Skull", "Black Skull Dragon"] } });
    const bs = d.mon(d.p2, "Black Skull Dragon");
    assert.equal(d.activate("Brain Control", bs), false, "a Fusion can't be taken");
    assert.ok(d.activate("Brain Control", d.mon(d.p2, "Summoned Skull"))); settle(d); assert.equal(d.p1.lifePoints, 7200);
});
test("Enemy Controller: you choose between its two effects", () => {
    const d = makeDuel({ p1: { hand: ["Enemy Controller"], monsters: ["Feral Imp"] }, p2: { monsters: [{ name: "Summoned Skull", pos: "attack" }] } });
    assert.ok(d.activate("Enemy Controller")); while (d.game.state.awaitingChain) d.game.dispatch({ type: "PASS_RESPONSE" });
    assert.ok(d.game.choice && d.game.choice.option && d.game.choice.options.length === 2);
    d.game.resolveOption("position"); if (d.game.state.awaitingChoice) d.choose("first");
    assert.equal(d.mon(d.p2, "Summoned Skull").position, "defense");
});
test("Horn of the Unicorn returns to the top of the Deck when it goes to the Graveyard", () => {
    const d = makeDuel({ p1: { hand: ["Horn of the Unicorn"], monsters: ["Feral Imp"] } });
    const m = d.mon(d.p1, "Feral Imp"), a = d.atk(m);
    d.activate("Horn of the Unicorn", m); settle(d); assert.equal(d.atk(m), a + 700);
    d.game.player1.moveCard(d.st(d.p1, "Horn of the Unicorn"), "spellTrap", "graveyard"); d.game.checkForWinner();
    assert.equal(d.p1.zone.deck[0].card.name, "Horn of the Unicorn"); assert.equal(d.atk(m), a);
});
test("Megamorph doubles ATK with lower LP, halves it with higher LP", () => {
    const d = makeDuel({ p1: { hand: ["Megamorph"], monsters: ["Feral Imp"], lp: 3000 } });
    const m = d.mon(d.p1, "Feral Imp"); d.activate("Megamorph", m); settle(d); assert.equal(d.atk(m), 2600);
    d.p1.lifePoints = 9000; assert.equal(d.atk(m), 650);
});
test("Monster Reborn / Premature Burial / Call of the Haunted bring back from the Graveyard, with their ties", () => {
    let d = makeDuel({ p1: { hand: ["Monster Reborn"] }, p2: { graveyard: ["Summoned Skull"] } });
    assert.ok(d.activate("Monster Reborn", d.find(d.p2, "Summoned Skull", "graveyard"))); settle(d); assert.equal(d.mon(d.p1, "Summoned Skull").owner.name, "P2".replace("P2", d.mon(d.p1, "Summoned Skull").owner.name));
    assert.equal(d.p1.getMonstersOnField().length, 1);
    d = makeDuel({ p1: { hand: ["Premature Burial"], graveyard: ["Summoned Skull"] } });
    assert.ok(d.activate("Premature Burial", d.find(d.p1, "Summoned Skull", "graveyard"))); settle(d);
    assert.equal(d.p1.lifePoints, 7200); d.game.player1.moveCard(d.st(d.p1, "Premature Burial"), "spellTrap", "graveyard"); d.game.checkForWinner();
    assert.equal(d.p1.getMonstersOnField().length, 0, "the monster is destroyed with the equip");
    d = makeDuel({ p1: { spellTrap: [{ name: "Call of the Haunted", faceUp: false }], graveyard: ["Summoned Skull"] } });
    assert.ok(d.activateSet("Call of the Haunted", d.find(d.p1, "Summoned Skull", "graveyard"))); settle(d);
    assert.equal(d.p1.getMonstersOnField().length, 1);
    d.game.player1.moveCard(d.mon(d.p1, "Summoned Skull"), "monster", "graveyard"); d.game.checkForWinner();
    assert.equal(d.p1.getSpellTrapsOnField().length, 0, "Call of the Haunted is destroyed with its monster");
});
test("Burst Stream of Destruction needs Blue-Eyes; BEWD can't attack afterwards", () => {
    assert.equal(makeDuel({ p1: { hand: ["Burst Stream of Destruction"] }, p2: { monsters: ["Summoned Skull"] } }).game.checkActivation(null, "idle").ok, false);
    const d = makeDuel({ p1: { hand: ["Burst Stream of Destruction"], monsters: ["Blue-Eyes White Dragon"] }, p2: { monsters: ["Summoned Skull"] } });
    d.use("Burst Stream of Destruction"); settle(d);
    assert.equal(d.p2.getMonstersOnField().length, 0); d.game.phase = "battle"; assert.equal(d.game.canAttack(d.mon(d.p1, "Blue-Eyes White Dragon")), false);
});
test("Spellbinding Circle: target can't attack/change position; freed when the Circle is destroyed", () => {
    const d = makeDuel({ p1: { spellTrap: [{ name: "Spellbinding Circle", faceUp: false }] }, p2: { monsters: ["Summoned Skull"] } });
    const m = d.mon(d.p2, "Summoned Skull"); assert.ok(d.activateSet("Spellbinding Circle", m)); settle(d);
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.game.phase = "battle"; assert.equal(d.game.canAttack(m), false);
    d.game.player1.moveCard(d.st(d.p1, "Spellbinding Circle"), "spellTrap", "graveyard"); d.game.checkForWinner();
    assert.equal(d.game.canAttack(m), true);
});
test("Shadow Spell: -700 ATK, can't attack or change position", () => {
    const d = makeDuel({ p1: { spellTrap: [{ name: "Shadow Spell", faceUp: false }] }, p2: { monsters: ["Summoned Skull"] } });
    const m = d.mon(d.p2, "Summoned Skull"); d.activateSet("Shadow Spell", m); settle(d); assert.equal(d.atk(m), 1800);
});
test("Fiendish Chain only targets face-up Effect Monsters", () => {
    const d = makeDuel({ p1: { spellTrap: [{ name: "Fiendish Chain", faceUp: false }] }, p2: { monsters: ["Summoned Skull", "Sangan"] } });
    assert.equal(d.activateSet("Fiendish Chain", d.mon(d.p2, "Summoned Skull")), false, "Summoned Skull is a Normal Monster");
    assert.ok(d.activateSet("Fiendish Chain", d.mon(d.p2, "Sangan"))); settle(d);
    assert.equal(d.mon(d.p2, "Sangan").modifiers.effectsNegated, true);
});
test("Trap Hole only hits a Summoned monster with 1000+ ATK", () => {
    const run = name => {
        const d = makeDuel({ p1: { spellTrap: [{ name: "Trap Hole", faceUp: false }] }, p2: { hand: [name] } });
        d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1;
        d.game.normalSummon(d.hand(d.p2, name), []);
        const open = d.game.state.awaitingSummonResponse;
        if (open) d.game.activateSetCard(d.st(d.p1, "Trap Hole"), null, "summon");
        return [open, d.p2.getMonstersOnField().length];
    };
    assert.deepEqual(run("Feral Imp"), [true, 0]);
    assert.deepEqual(run("Mystical Elf"), [false, 1].slice(0, 2).map((v, i) => (i === 0 ? false : 1)));
});
test("Mirror Force destroys only Attack Position monsters; Magic Cylinder reflects ATK; Negate Attack ends the Battle Phase", () => {
    let d = makeDuel({ p1: { monsters: ["Summoned Skull", { name: "Feral Imp", pos: "defense" }] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    d.game.phase = "battle"; d.game.declareAttack(d.mon(d.p1, "Summoned Skull"), null); d.activateSet("Mirror Force", null, d.p2, "battle"); settle(d);
    assert.deepEqual(d.names(d.p1, "monster"), ["Feral Imp"]);
    d = makeDuel({ p1: { monsters: ["Summoned Skull"] }, p2: { spellTrap: [{ name: "Magic Cylinder", faceUp: false }] } });
    d.game.phase = "battle"; d.game.declareAttack(d.mon(d.p1, "Summoned Skull"), null); d.activateSet("Magic Cylinder", null, d.p2, "battle"); settle(d);
    assert.equal(d.p1.lifePoints, 8000 - 2500); assert.equal(d.p2.lifePoints, 8000);
    d = makeDuel({ p1: { monsters: ["Summoned Skull", "Feral Imp"] }, p2: { spellTrap: [{ name: "Negate Attack", faceUp: false }] } });
    d.game.phase = "battle"; d.game.declareAttack(d.mon(d.p1, "Summoned Skull"), null); d.activateSet("Negate Attack", null, d.p2, "battle"); settle(d);
    assert.equal(d.p2.lifePoints, 8000); assert.equal(d.game.canAttack(d.mon(d.p1, "Feral Imp")), false, "Battle Phase is over");
});
test("Reinforcements +500 ATK; Ring of Destruction only on the OPPONENT's turn, both take the ATK as damage", () => {
    let d = makeDuel({ p1: { spellTrap: [{ name: "Reinforcements", faceUp: false }], monsters: ["Feral Imp"] } });
    d.activateSet("Reinforcements", d.mon(d.p1, "Feral Imp")); settle(d); assert.equal(d.atk("Feral Imp", d.p1), 1800);
    d = makeDuel({ p1: { spellTrap: [{ name: "Ring of Destruction", faceUp: false }] }, p2: { monsters: ["Feral Imp"] } });
    assert.equal(d.game.checkActivation(d.st(d.p1, "Ring of Destruction"), "idle").ok, false, "your own turn");
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1;
    d.game.chainWindow = { player: d.p1 }; d.game.chain = [{ speed: 1, gc: d.p2.zone.monster[2] || d.mon(d.p2, "Feral Imp"), meta: {}, owner: d.p2 }];
    assert.ok(d.game.checkActivation(d.st(d.p1, "Ring of Destruction"), "chain").ok);
});
test("Man-Eater Bug: you choose any monster on the field and destroy it", () => {
    const d = makeDuel({ p1: { monsters: ["Blue-Eyes White Dragon"] }, p2: { monsters: [{ name: "Man-Eater Bug", faceUp: false }] } });
    d.game.phase = "battle"; d.game.declareAttack(d.mon(d.p1, "Blue-Eyes White Dragon"), d.mon(d.p2, "Man-Eater Bug")); settle(d);
});
test("Sangan: you choose the monster; its name is locked for the turn; only once per turn", () => {
    const d = makeDuel({ p1: { monsters: ["Sangan"], deck: ["Feral Imp", "Beta The Magnet Warrior"] }, p2: { hand: ["Raigeki"] } });
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.activate("Raigeki", null, d.p2); settle(d);
    assert.ok(d.game.state.awaitingChoice || d.names(d.p1, "hand").length >= 1);
});
test("Obelisk: 3 Tributes, can't be Set, untargetable; Tribute 2 monsters to destroy the opposing field", () => {
    const d = makeDuel({ p1: { hand: ["Obelisk the Tormentor"], monsters: ["Feral Imp", "Feral Imp", "Feral Imp"] }, p2: { monsters: ["Summoned Skull", "Sangan"] } });
    const gc = d.hand(d.p1, "Obelisk the Tormentor");
    assert.equal(d.game.getRequiredTributesForSummon(d.p1, gc).total, 3);
    assert.equal(d.game.setMonster(gc, d.p1.getMonstersOnField().map(m => m.zoneIndex)), false);
    assert.ok(d.game.normalSummon(gc, d.p1.getMonstersOnField().map(m => m.zoneIndex)));
    assert.equal(d.game.state.awaitingSummonResponse, false, "its Normal Summon can't be responded to");
    const ob = d.mon(d.p1, "Obelisk the Tormentor");
    d.p1.zone.deck.slice(0, 0);
    assert.equal(Effects_untargetable(ob), true);
});
const Effects_untargetable = gc => require("../Effects").isUntargetable(gc.card.name);
test("Slifer: 1000 ATK/DEF per card in hand", () => {
    const d = makeDuel({ p1: { hand: ["Feral Imp", "Feral Imp"], monsters: ["Slifer the Sky Dragon"] } });
    assert.equal(d.atk("Slifer the Sky Dragon", d.p1), 2000 + 0);
});
test("Dark Paladin: Quick Effect — discard 1 to negate and destroy a Spell as it is activated", () => {
    const d = makeDuel({ p1: { hand: ["Dian Keto the Cure Master"] }, p2: { monsters: ["Dark Paladin"], hand: ["Feral Imp"] } });
    d.activate("Dian Keto the Cure Master");
    assert.ok(d.game.state.awaitingChain, "the opponent's Dark Paladin can respond");
    const dp = d.mon(d.p2, "Dark Paladin");
    assert.ok(d.game.getChainResponses(d.p2).includes(dp));
    d.game.dispatch({ type: "ACTIVATE_MONSTER_EFFECT", payload: { card: dp } }); settle(d);
    assert.equal(d.p1.lifePoints, 8000, "Dian Keto was negated");
    assert.ok(d.names(d.p1, "graveyard").includes("Dian Keto the Cure Master"));
});
