"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel } = require("./harness");

const withRandom = (v, fn) => { const o = Math.random; Math.random = () => v; try { return fn(); } finally { Math.random = o; } };

test("Harpie's Pet Dragon gains 300 ATK/DEF per Harpie Lady on the field (both sides, aliases count)", () => {
    const d = makeDuel({ p1: { monsters: ["Harpie's Pet Dragon", "Harpie Lady"] }, p2: { monsters: ["Cyber Harpie Lady"] } });
    const m = d.mon(d.p1, "Harpie's Pet Dragon");
    assert.equal(d.atk(m), 2000 + 600);
    assert.equal(d.def(m), 2500 + 600);
});
test("Harpie Lady Sisters cannot be Normal Summoned or Set", () => {
    const d = makeDuel({ p1: { hand: ["Harpie Lady Sisters"] } });
    const gc = d.hand(d.p1, "Harpie Lady Sisters");
    assert.equal(d.game.canNormalSummon(gc), false);
    assert.equal(d.game.normalSummon(gc, []), false);
});
test("Harpie Queen: discard from hand to add Harpies' Hunting Ground", () => {
    const d = makeDuel({ p1: { hand: ["Harpie Queen"], deck: ["Harpies' Hunting Ground"] } });
    assert.ok(d.game.activateHandEffect(d.hand(d.p1, "Harpie Queen")));
    assert.ok(d.names(d.p1, "hand").includes("Harpies' Hunting Ground"));
    assert.ok(d.names(d.p1, "graveyard").includes("Harpie Queen"));
});
test("Harpie Harpist: Normal Summon bounces own Winged Beast + opposing monster", () => {
    const d = makeDuel({ p1: { hand: ["Harpie Harpist"], monsters: ["Harpie Lady"] }, p2: { monsters: ["Summoned Skull"] } });
    assert.ok(d.game.normalSummon(d.hand(d.p1, "Harpie Harpist"), []));
    d.choose("Harpie Lady");
    if (d.game.state.awaitingChoice) d.choose("Summoned Skull");
    assert.ok(d.names(d.p1, "hand").includes("Harpie Lady"));
    assert.ok(d.names(d.p2, "hand").includes("Summoned Skull"));
});
test("Harpie Dancer: bounce a WIND monster, then Normal Summon a WIND monster", () => {
    const d = makeDuel({ p1: { hand: ["Harpie Lady 2"], monsters: ["Harpie Dancer", "Harpie Lady"] } });
    const dancer = d.mon(d.p1, "Harpie Dancer");
    assert.ok(game_ign(d, dancer, d.mon(d.p1, "Harpie Lady")));
    if (d.game.state.awaitingChoice) d.choose("first");
    assert.equal(d.p1.normalSummonedThisTurn, true);
});
function game_ign(d, gc, target) { return d.game.activateMonsterEffect(gc, target ? target.instanceId : null); }

test("Harpie's Pet Baby Dragon: doubles with 2 other Harpies, destroys with 3", () => {
    const d = makeDuel({ p1: { monsters: ["Harpie's Pet Baby Dragon", "Harpie Lady", "Harpie Lady", "Cyber Harpie Lady"] }, p2: { monsters: ["Summoned Skull"] } });
    const b = d.mon(d.p1, "Harpie's Pet Baby Dragon");
    assert.equal(d.atk(b), 2400);
    assert.ok(game_ign(d, b, d.mon(d.p2, "Summoned Skull")));
    assert.deepEqual(d.names(d.p2, "monster"), []);
});
test("Birdface: destroyed by battle -> add Harpie Lady from the Deck", () => {
    const d = makeDuel({ p1: { monsters: ["Blue-Eyes White Dragon"] }, p2: { monsters: ["Birdface"], deck: ["Harpie Lady"] } });
    d.attack("Blue-Eyes White Dragon", "Birdface");
    d.game.checkForWinner();
    if (d.game.state.awaitingChoice) d.choose("first");
    assert.ok(d.names(d.p2, "hand").includes("Harpie Lady"));
});
test("Birdface does NOT trigger when destroyed by a card effect", () => {
    const d = makeDuel({ p1: { hand: ["Raigeki"] }, p2: { monsters: ["Birdface"], deck: ["Harpie Lady"] } });
    d.activate("Raigeki"); d.game.checkForWinner();
    assert.ok(!d.game.state.awaitingChoice);
    assert.ok(!d.names(d.p2, "hand").includes("Harpie Lady"));
});

test("Gilford: 3 Tributes -> destroys all opposing monsters; 2 Tributes -> no effect", () => {
    const mk = () => makeDuel({ p1: { hand: ["Gilford the Lightning"], monsters: ["Feral Imp", "Feral Imp", "Feral Imp"] }, p2: { monsters: ["Summoned Skull", "Beta The Magnet Warrior"] } });
    let d = mk();
    const idx = d.p1.getMonstersOnField().map(m => m.zoneIndex);
    assert.ok(d.game.normalSummon(d.hand(d.p1, "Gilford the Lightning"), idx));
    assert.equal(d.p2.getMonstersOnField().length, 0);
    d = mk();
    assert.ok(d.game.normalSummon(d.hand(d.p1, "Gilford the Lightning"), d.p1.getMonstersOnField().slice(0, 2).map(m => m.zoneIndex)));
    assert.equal(d.p2.getMonstersOnField().length, 2);
});
test("Gilford cannot be Set with 3 Tributes", () => {
    const d = makeDuel({ p1: { hand: ["Gilford the Lightning"], monsters: ["Feral Imp", "Feral Imp", "Feral Imp"] } });
    assert.equal(d.game.setMonster(d.hand(d.p1, "Gilford the Lightning"), d.p1.getMonstersOnField().map(m => m.zoneIndex)), false);
});
test("Jinzo: Trap Cards cannot be activated while it is face-up", () => {
    const d = makeDuel({ p1: { monsters: ["Jinzo"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    const mf = d.st(d.p2, "Mirror Force");
    d.game.phase = "battle"; d.game.battleResponse = { defender: d.p2 };
    assert.equal(d.game.getEligibleResponses(d.p2).length, 0);
    assert.equal(d.game.checkActivation(mf, "battle").ok, false);
    assert.equal(d.game.activateSetCard(mf, null, "battle"), false);
    d.game.player1.moveCard(d.mon(d.p1, "Jinzo"), "monster", "graveyard");
    assert.equal(d.game.getEligibleResponses(d.p2).length, 1);
});
test("Panther Warrior can't attack alone; attacking Tributes another monster", () => {
    const d = makeDuel({ p1: { monsters: ["Panther Warrior"] } });
    d.game.phase = "battle";
    assert.equal(d.game.canAttack(d.mon(d.p1, "Panther Warrior")), false);
    const d2 = makeDuel({ p1: { monsters: ["Panther Warrior", "Feral Imp"] } });
    d2.game.phase = "battle";
    assert.equal(d2.game.canAttack(d2.mon(d2.p1, "Panther Warrior")), true);
    d2.game.declareAttack(d2.mon(d2.p1, "Panther Warrior"), null);
    assert.deepEqual(d2.names(d2.p1, "monster"), ["Panther Warrior"]);
    assert.ok(d2.names(d2.p1, "graveyard").includes("Feral Imp"));
});
test("Hayabusa Knight attacks twice per Battle Phase, but not three times", () => {
    const d = makeDuel({ p1: { monsters: ["Hayabusa Knight"] } });
    const h = d.mon(d.p1, "Hayabusa Knight"); d.game.phase = "battle";
    d.game.declareAttack(h, null); if (d.game.state.awaitingResponse) d.game.resolveBattleDamage();
    assert.equal(d.game.canAttack(h), true, "second attack available");
    d.game.declareAttack(h, null); if (d.game.state.awaitingResponse) d.game.resolveBattleDamage();
    assert.equal(d.game.canAttack(h), false);
    assert.equal(d.p2.lifePoints, 8000 - 2000);
});
test("Time Wizard: right call destroys the opponent's monsters", () => {
    const d = makeDuel({ p1: { monsters: ["Time Wizard"] }, p2: { monsters: ["Summoned Skull", "Feral Imp"] } });
    withRandom(0.1, () => assert.ok(game_ign(d, d.mon(d.p1, "Time Wizard"))));
    assert.equal(d.p2.getMonstersOnField().length, 0);
});
test("Time Wizard: wrong call destroys your monsters and costs half their ATK", () => {
    const d = makeDuel({ p1: { monsters: ["Time Wizard", "Summoned Skull"] }, p2: { monsters: ["Feral Imp"] } });
    withRandom(0.9, () => assert.ok(game_ign(d, d.mon(d.p1, "Time Wizard"))));
    assert.equal(d.p1.getMonstersOnField().length, 0);
    assert.equal(d.p1.lifePoints, 8000 - Math.floor((500 + 2500) / 2));
    assert.equal(d.p2.getMonstersOnField().length, 1);
});
test("Cyber-Stein: pay 5000 LP to Special Summon a Fusion Monster", () => {
    const d = makeDuel({ p1: { monsters: ["Cyber-Stein"], extra: ["Flame Swordsman"] } });
    assert.ok(game_ign(d, d.mon(d.p1, "Cyber-Stein")));
    if (d.game.state.awaitingChoice) d.choose("first");
    assert.equal(d.p1.lifePoints, 3000);
    assert.ok(d.names(d.p1, "monster").includes("Flame Swordsman"));
});
test("Cyber-Stein is unavailable at 5000 LP or less", () => {
    const d = makeDuel({ p1: { monsters: ["Cyber-Stein"], extra: ["Flame Swordsman"], lp: 5000 } });
    assert.equal(game_ign(d, d.mon(d.p1, "Cyber-Stein")), false);
});
test("Summoner of Illusions (Flip): Tribute 1, summon a Fusion, destroyed at End Phase", () => {
    const d = makeDuel({ p1: { monsters: [{ name: "Summoner of Illusions", faceUp: false }, "Feral Imp"], extra: ["Flame Swordsman"] } });
    d.game.phase = "battle";
    const s = d.mon(d.p1, "Summoner of Illusions");
    d.game.changeBattlePosition && (d.game.phase = "m1");
    d.game.changeBattlePosition(s);
    while (d.game.state.awaitingChoice) d.choose("first");
    assert.ok(d.names(d.p1, "monster").includes("Flame Swordsman"));
    assert.ok(!d.names(d.p1, "monster").includes("Feral Imp"));
    d.endTurn();
    assert.ok(!d.names(d.p1, "monster").includes("Flame Swordsman"));
});
test("Fusion Monsters can be summoned with Polymerization using their recipe", () => {
    const d = makeDuel({ p1: { hand: ["Polymerization"], monsters: ["Summoned Skull", "Red-Eyes Black Dragon"], extra: ["Black Skull Dragon"] } });
    const fusion = d.p1.zone.extraDeck.find(c => c.card.name === "Black Skull Dragon");
    assert.ok(d.activate("Polymerization", fusion));
    assert.deepEqual(d.names(d.p1, "monster"), ["Black Skull Dragon"]);
});
test("Lord of D.: Dragon monsters can't be targeted by either player's effects", () => {
    const d = makeDuel({ p1: { hand: ["Tribute to the Doomed", "Feral Imp"], monsters: ["Lord of D."] }, p2: { monsters: ["Blue-Eyes White Dragon"] } });
    assert.equal(d.activate("Tribute to the Doomed", d.mon(d.p2, "Blue-Eyes White Dragon")), false);
    assert.deepEqual(d.names(d.p2, "monster"), ["Blue-Eyes White Dragon"]);
});
test("Grave Squirmer: destroyed by battle -> destroy 1 card on the field", () => {
    const d = makeDuel({ p1: { monsters: ["Blue-Eyes White Dragon"] }, p2: { monsters: ["Grave Squirmer", "Summoned Skull"] } });
    d.attack("Blue-Eyes White Dragon", "Grave Squirmer");
    d.game.checkForWinner();
    d.choose("Summoned Skull");
    assert.deepEqual(d.names(d.p2, "monster"), []);
});
test("Ritual monsters count as scripted through their Ritual Spell", () => {
    const { Effects } = require("./harness");
    assert.ok(Effects.scriptKinds("Black Luster Soldier").includes("ritual-monster"));
    assert.ok(Effects.scriptKinds("Magician of Black Chaos").includes("ritual-monster"));
});
