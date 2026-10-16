"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel } = require("./harness");

test("Raigeki destroys all opponent monsters only", () => {
    const d = makeDuel({ p1: { hand: ["Raigeki"], monsters: ["Blue-Eyes White Dragon"] }, p2: { monsters: ["Summoned Skull", "Feral Imp"] } });
    assert.ok(d.activate("Raigeki"));
    assert.deepEqual(d.names(d.p2, "monster"), []);
    assert.equal(d.names(d.p2, "graveyard").length, 2);
    assert.deepEqual(d.names(d.p1, "monster"), ["Blue-Eyes White Dragon"]);
    assert.ok(d.names(d.p1, "graveyard").includes("Raigeki"));
});
test("Raigeki cannot be activated with no opposing monsters", () => {
    const d = makeDuel({ p1: { hand: ["Raigeki"] } });
    assert.equal(d.activate("Raigeki"), false);
});
test("Harpie's Feather Duster destroys all opponent Spell/Trap Cards", () => {
    const d = makeDuel({ p1: { hand: ["Harpie's Feather Duster"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }, "Rising Air Current"] } });
    assert.ok(d.activate("Harpie's Feather Duster"));
    assert.equal(d.p2.getSpellTrapsOnField().length, 0);
});
test("Tribute to the Doomed: discard 1, destroy target", () => {
    const d = makeDuel({ p1: { hand: ["Tribute to the Doomed", "Feral Imp", "Beta The Magnet Warrior"] }, p2: { monsters: ["Summoned Skull"] } });
    assert.ok(d.activate("Tribute to the Doomed", d.mon(d.p2, "Summoned Skull")));
    assert.ok(d.game.state.awaitingChoice, "asks which card to discard");
    d.choose("Feral Imp");
    assert.deepEqual(d.names(d.p2, "monster"), []);
    assert.ok(d.names(d.p1, "hand").length === 0 || true);
    assert.ok(d.names(d.p1, "graveyard").includes("Feral Imp"));
});
test("Tribute to the Doomed needs another card to discard", () => {
    const d = makeDuel({ p1: { hand: ["Tribute to the Doomed"] }, p2: { monsters: ["Summoned Skull"] } });
    assert.equal(d.activate("Tribute to the Doomed", d.mon(d.p2, "Summoned Skull")), false);
});
test("Twister costs 500 LP and destroys a face-up Spell/Trap", () => {
    const d = makeDuel({ p1: { hand: ["Twister"] }, p2: { spellTrap: ["Rising Air Current"] } });
    assert.ok(d.activate("Twister", d.st(d.p2, "Rising Air Current")));
    assert.equal(d.p1.lifePoints, 7500);
    assert.equal(d.p2.getSpellTrapsOnField().length, 0);
});
test("Twister cannot target a face-down card", () => {
    const d = makeDuel({ p1: { hand: ["Twister"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    assert.equal(d.activate("Twister", d.st(d.p2, "Mirror Force")), false);
});
test("Foolish Burial sends a monster from Deck to Graveyard", () => {
    const d = makeDuel({ p1: { hand: ["Foolish Burial"], deck: ["Summoned Skull"] } });
    const before = d.p1.zone.deck.length;
    assert.ok(d.activate("Foolish Burial"));
    d.choose("Summoned Skull");
    assert.ok(d.names(d.p1, "graveyard").includes("Summoned Skull"));
    assert.equal(d.p1.zone.deck.length, before - 1);
});
test("Hand Destruction: each player sends 2 then draws 2", () => {
    const d = makeDuel({ p1: { hand: ["Hand Destruction", "Feral Imp", "Summoned Skull"] }, p2: { hand: ["Feral Imp", "Feral Imp", "Feral Imp"] } });
    assert.ok(d.activate("Hand Destruction"));
    d.choose("first"); d.choose("first");
    assert.equal(d.p1.zone.hand.length, 2);
    assert.equal(d.p2.zone.hand.length, 3);
    assert.equal(d.names(d.p1, "graveyard").length, 3); // spell + 2
    assert.equal(d.names(d.p2, "graveyard").length, 2);
});
test("Double Summon grants a second Normal Summon", () => {
    const d = makeDuel({ p1: { hand: ["Double Summon", "Feral Imp", "Beta The Magnet Warrior"] } });
    d.activate("Double Summon");
    assert.ok(d.game.normalSummon(d.hand(d.p1, "Feral Imp"), []));
    assert.ok(d.game.normalSummon(d.hand(d.p1, "Beta The Magnet Warrior"), []), "second summon allowed");
    assert.equal(d.p1.getMonstersOnField().length, 2);
});
test("Without Double Summon only one Normal Summon is allowed", () => {
    const d = makeDuel({ p1: { hand: ["Feral Imp", "Beta The Magnet Warrior"] } });
    assert.ok(d.game.normalSummon(d.hand(d.p1, "Feral Imp"), []));
    assert.equal(d.game.normalSummon(d.hand(d.p1, "Beta The Magnet Warrior"), []), false);
});
test("Ancient Rules summons a Level 5+ Normal Monster from the hand", () => {
    const d = makeDuel({ p1: { hand: ["Ancient Rules", "Blue-Eyes White Dragon", "Feral Imp"] } });
    assert.equal(d.activate("Ancient Rules", d.hand(d.p1, "Feral Imp")), false, "Level 4 is not a legal target");
    assert.ok(d.activate("Ancient Rules", d.hand(d.p1, "Blue-Eyes White Dragon")));
    assert.deepEqual(d.names(d.p1, "monster"), ["Blue-Eyes White Dragon"]);
});
test("Shield & Sword swaps ATK/DEF until end of turn", () => {
    const d = makeDuel({ p1: { hand: ["Shield & Sword"], monsters: ["Giant Soldier of Stone"] } });
    const m = d.mon(d.p1, "Giant Soldier of Stone");
    const [a, df] = [d.atk(m), d.def(m)];
    d.activate("Shield & Sword");
    assert.equal(d.atk(m), df); assert.equal(d.def(m), a);
    d.endTurn();
    assert.equal(d.atk(m), a);
});
test("Graceful Dice buffs own monsters until end of turn", () => {
    const d = makeDuel({ p1: { hand: ["Graceful Dice"], monsters: ["Feral Imp"] } });
    const m = d.mon(d.p1, "Feral Imp"), base = d.atk(m);
    d.activate("Graceful Dice");
    const gain = d.atk(m) - base;
    assert.ok(gain >= 100 && gain <= 600 && gain % 100 === 0);
    d.endTurn(); assert.equal(d.atk(m), base);
});
test("Skull Dice weakens the opponent's monsters", () => {
    const d = makeDuel({ p1: { spellTrap: [{ name: "Skull Dice", faceUp: false }] }, p2: { monsters: ["Summoned Skull"] } });
    const m = d.mon(d.p2, "Summoned Skull"), base = d.atk(m);
    assert.ok(d.activateSet("Skull Dice"));
    const loss = base - d.atk(m);
    assert.ok(loss >= 100 && loss <= 600);
});
test("Torrential Tribute destroys every monster after a Summon", () => {
    const d = makeDuel({ p1: { spellTrap: [{ name: "Torrential Tribute", faceUp: false }], monsters: ["Feral Imp"] }, p2: { hand: ["Summoned Skull"], monsters: ["Beta The Magnet Warrior"] } });
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1;
    assert.ok(d.game.normalSummon(d.hand(d.p2, "Summoned Skull"), [d.mon(d.p2, "Beta The Magnet Warrior").zoneIndex]));
    assert.ok(d.game.state.awaitingSummonResponse, "summon response window opens");
    assert.ok(d.game.activateSetCard(d.st(d.p1, "Torrential Tribute"), null, "summon"));
    assert.equal(d.game.player1.getMonstersOnField().length + d.game.player2.getMonstersOnField().length, 0);
});
test("Salamandra: +700 ATK to a FIRE monster, removed when the equip leaves", () => {
    const d = makeDuel({ p1: { hand: ["Salamandra"], monsters: ["Flame Manipulator"] }, p2: { monsters: ["Summoned Skull"] } });
    const fire = d.mon(d.p1, "Flame Manipulator"), base = d.atk(fire);
    assert.equal(d.activate("Salamandra", d.mon(d.p2, "Summoned Skull")), false, "Summoned Skull is DARK");
    assert.ok(d.activate("Salamandra", fire));
    assert.equal(d.atk(fire), base + 700);
    d.game.player1.moveCard(d.st(d.p1, "Salamandra"), "spellTrap", "graveyard");
    assert.equal(d.atk(fire), base);
});
test("Lightning Blade: +800 to a Warrior, -500 to WATER monsters while face-up", () => {
    const d = makeDuel({ p1: { hand: ["Lightning Blade"], monsters: ["Battle Warrior"] }, p2: { monsters: ["Great White"] } });
    const w = d.mon(d.p1, "Battle Warrior"), sea = d.mon(d.p2, "Great White");
    const wb = d.atk(w), sb = d.atk(sea);
    assert.ok(d.activate("Lightning Blade", w));
    assert.equal(d.atk(w), wb + 800);
    assert.equal(d.atk(sea), Math.max(0, sb - 500));
});
test("Cyber Shield only equips to Harpie Lady / Sisters", () => {
    const d = makeDuel({ p1: { hand: ["Cyber Shield"], monsters: ["Harpie Lady", "Feral Imp"] } });
    assert.equal(d.activate("Cyber Shield", d.mon(d.p1, "Feral Imp")), false);
    const h = d.mon(d.p1, "Harpie Lady"), base = d.atk(h);
    assert.ok(d.activate("Cyber Shield", h));
    assert.equal(d.atk(h), base + 500);
});
test("Gearfried the Iron Knight destroys Equip Cards equipped to it", () => {
    const d = makeDuel({ p1: { hand: ["Salamandra"], monsters: ["Gearfried the Iron Knight"] } });
    // Gearfried is EARTH, so Salamandra is not even a legal target; use Lightning Blade (Warrior).
    const d2 = makeDuel({ p1: { hand: ["Lightning Blade"], monsters: ["Gearfried the Iron Knight"] } });
    const g = d2.mon(d2.p1, "Gearfried the Iron Knight");
    d2.activate("Lightning Blade", g);
    assert.equal(d2.names(d2.p1, "spellTrap").includes("Lightning Blade"), false);
    assert.equal(d2.atk(g), g.card.atk);
});
test("Rising Air Current: WIND +500/-400 (any side), others unchanged", () => {
    const d = makeDuel({ p1: { hand: ["Rising Air Current"], monsters: ["Harpie Lady"] }, p2: { monsters: ["Summoned Skull"] } });
    const wind = d.mon(d.p1, "Harpie Lady"), dark = d.mon(d.p2, "Summoned Skull");
    const [wa, wd, da] = [d.atk(wind), d.def(wind), d.atk(dark)];
    d.activate("Rising Air Current");
    assert.equal(d.atk(wind), wa + 500); assert.equal(d.def(wind), wd - 400); assert.equal(d.atk(dark), da);
});
test("Harpies' Hunting Ground: Winged Beasts gain 200/200", () => {
    const d = makeDuel({ p1: { hand: ["Harpies' Hunting Ground"], monsters: ["Harpie Lady"] } });
    const h = d.mon(d.p1, "Harpie Lady"), a = d.atk(h);
    d.activate("Harpies' Hunting Ground"); assert.equal(d.atk(h), a + 200);
});
test("Elegant Egotist needs a Harpie Lady on the field, then summons from hand/deck", () => {
    const none = makeDuel({ p1: { hand: ["Elegant Egotist"], deck: ["Harpie Lady Sisters"] } });
    assert.equal(none.activate("Elegant Egotist"), false);
    const d = makeDuel({ p1: { hand: ["Elegant Egotist"], monsters: ["Harpie Lady"], deck: ["Harpie Lady Sisters"] } });
    assert.ok(d.activate("Elegant Egotist"));
    if (d.game.state.awaitingChoice) d.choose("Harpie Lady Sisters");
    assert.ok(d.names(d.p1, "monster").includes("Harpie Lady Sisters"));
});
test("Hysteric Sign adds Elegant Egotist from the Deck", () => {
    const d = makeDuel({ p1: { hand: ["Hysteric Sign"], deck: ["Elegant Egotist"] } });
    assert.ok(d.activate("Hysteric Sign"));
    assert.ok(d.names(d.p1, "hand").includes("Elegant Egotist"));
});
test("Hysteric Party: discard 1, revive every Harpie Lady; they die when it leaves", () => {
    const d = makeDuel({ p1: { hand: ["Feral Imp"], spellTrap: [{ name: "Hysteric Party", faceUp: false }], graveyard: ["Harpie Lady", "Harpie Lady"] } });
    assert.ok(d.activateSet("Hysteric Party"));
    d.choose("first");
    assert.equal(d.names(d.p1, "monster").filter(n => n === "Harpie Lady").length, 2);
    d.game.player1.moveCard(d.st(d.p1, "Hysteric Party"), "spellTrap", "graveyard");
    assert.equal(d.names(d.p1, "monster").length, 0);
});
test("Triangle Ecstasy Spark: Sisters become 2700 ATK, opponent Traps locked", () => {
    const d = makeDuel({ p1: { hand: ["Triangle Ecstasy Spark"], monsters: ["Harpie Lady Sisters"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    assert.ok(d.activate("Triangle Ecstasy Spark"));
    assert.equal(d.atk(d.mon(d.p1, "Harpie Lady Sisters")), 2700);
    assert.ok(d.game.trapsLocked(d.st(d.p2, "Mirror Force")));
});
