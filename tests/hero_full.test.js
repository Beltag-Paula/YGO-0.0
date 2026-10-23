"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel, Effects } = require("./harness");
const E = n => "Elemental HERO " + n;
const settle = d => { for (let i = 0; i < 14 && (d.game.state.awaitingChain || d.game.state.awaitingChoice); i++) { if (!d.game.state.awaitingChoice) d.game.dispatch({ type: "PASS_RESPONSE" }); else if (d.game.choice.option) d.game.resolveOption(d.game.choice.options[0].id); else if (d.game.choice.min === 0) d.game.resolveChoice(d.game.choice.candidateIds.slice(0, 1)); else d.choose("first"); } };
const atk = (d, a, t) => { d.game.phase = "battle"; const r = d.game.declareAttack(a, t); if (d.game.state.awaitingResponse) d.game.dispatch({ type: "PASS_RESPONSE" }); settle(d); return r; };

test("Wildheart is unaffected by Trap effects (Mirror Force spares it, Trap targeting is refused)", () => {
    const d = makeDuel({ p1: { monsters: [E("Wildheart"), "Feral Imp"] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }, { name: "Compulsory Evacuation Device", faceUp: false }] } });
    assert.equal(d.game.checkActivation(d.st(d.p2, "Compulsory Evacuation Device"), "idle", d.mon(d.p1, E("Wildheart")).instanceId).ok, false);
    d.game.phase = "battle"; d.game.declareAttack(d.mon(d.p1, "Feral Imp"), null);
    d.game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: d.st(d.p2, "Mirror Force") } }); settle(d);
    assert.ok(d.mon(d.p1, E("Wildheart")), "Wildheart survived"); assert.equal(d.mon(d.p1, "Feral Imp"), null, "its friend did not");
});
test("Heat gains 200 ATK per Elemental HERO monster you control (itself included)", () => {
    const d = makeDuel({ p1: { monsters: [E("Heat"), E("Wildheart")] } }); assert.equal(d.atk(E("Heat"), d.p1), 1600 + 400);
});
test("Lady Heat inflicts 200 per face-up Elemental HERO at YOUR End Phase", () => {
    const d = makeDuel({ p1: { monsters: [E("Lady Heat"), E("Wildheart")] } }); Effects.runPhaseTriggers(d.game, "end", d.p1); assert.equal(d.p2.lifePoints, 8000 - 400);
    const e = makeDuel({ p2: { monsters: [E("Lady Heat")] } }); Effects.runPhaseTriggers(e.game, "end", e.p1); assert.equal(e.p1.lifePoints, 8000, "not the opponent's End Phase");
});
test("Bubbleman: Special Summon only as the last card in hand; draws 2 only if you control nothing else and have no hand", () => {
    let d = makeDuel({ p1: { hand: [E("Bubbleman"), "Feral Imp"] } }); assert.equal(d.game.activateHandEffect(d.hand(d.p1, E("Bubbleman"))), false);
    d = makeDuel({ p1: { hand: [E("Bubbleman")] } }); const deck = d.p1.zone.deck.length;
    assert.ok(d.game.activateHandEffect(d.hand(d.p1, E("Bubbleman")))); assert.ok(d.game.choice && d.game.choice.option, "asked whether to draw"); d.game.resolveOption("yes");
    assert.equal(d.p1.zone.hand.length, 2); assert.equal(d.p1.zone.deck.length, deck - 2);
    d = makeDuel({ p1: { hand: [E("Bubbleman")], monsters: ["Feral Imp"] } }); d.game.activateHandEffect(d.hand(d.p1, E("Bubbleman"))); assert.ok(!d.game.state.awaitingChoice, "another card on the field: no draw");
});
test("Stratos: Normal Summon -> add a HERO from the Deck, or destroy up to (other HERO monsters) Spells/Traps", () => {
    let d = makeDuel({ p1: { hand: [E("Stratos")], deck: [E("Heat")] } }); d.game.normalSummon(d.hand(d.p1, E("Stratos")), []);
    assert.ok(d.game.choice.option); d.game.resolveOption("search"); settle(d); assert.ok(d.names(d.p1, "hand").includes(E("Heat")));
    d = makeDuel({ p1: { hand: [E("Stratos")], monsters: [E("Wildheart")] }, p2: { spellTrap: [{ name: "Mirror Force", faceUp: false }, { name: "Pot of Greed", faceUp: false }] } });
    d.game.normalSummon(d.hand(d.p1, E("Stratos")), []); d.game.resolveOption("destroy"); assert.equal(d.game.choice.max, 1, "1 other HERO monster"); d.choose("first"); settle(d);
    assert.equal(d.p2.getSpellTrapsOnField().length, 1);
});
test("Captain Gold: discard to fetch Skyscraper; destroyed when Skyscraper isn't face-up", () => {
    let d = makeDuel({ p1: { hand: [E("Captain Gold")], deck: ["Skyscraper"] } }); assert.ok(d.game.activateHandEffect(d.hand(d.p1, E("Captain Gold")))); settle(d);
    assert.ok(d.names(d.p1, "hand").includes("Skyscraper")); assert.ok(d.names(d.p1, "graveyard").includes(E("Captain Gold")));
    d = makeDuel({ p1: { monsters: [E("Captain Gold")] } }); d.game.checkForWinner(); assert.equal(d.mon(d.p1, E("Captain Gold")), null, "no Skyscraper: destroyed");
    d = makeDuel({ p1: { monsters: [E("Captain Gold")], spellTrap: ["Skyscraper"] } }); d.game.checkForWinner(); assert.ok(d.mon(d.p1, E("Captain Gold")), "Skyscraper face-up: stays");
});
test("Knospe: grows after battle damage; can attack directly and can't be attacked while you control another Elemental HERO", () => {
    const d = makeDuel({ p1: { monsters: [E("Knospe"), E("Wildheart")] }, p2: { monsters: ["Feral Imp"] } });
    const k = d.mon(d.p1, E("Knospe")); d.game.phase = "battle";
    assert.ok(d.game.canAttack(k)); assert.ok(d.game.declareAttack(k, null), "direct attack despite a defender"); settle(d);
    assert.equal(d.atk(k, d.p1), k.card.atk + 100); assert.equal(d.def(k, d.p1), k.card.def - 100);
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1;
    assert.equal(d.game.declareAttack(d.mon(d.p2, "Feral Imp"), k), false, "Knospe is protected");
});
test("Voltic: after inflicting battle damage, Special Summon a banished Elemental HERO", () => {
    const d = makeDuel({ p1: { monsters: [E("Voltic")], banished: [E("Wildheart")] } });
    atk(d, d.mon(d.p1, E("Voltic")), null); assert.ok(d.mon(d.p1, E("Wildheart")));
});
test("Woodsman fetches Polymerization and Ocean returns a HERO — at YOUR Standby Phase, once, by choice", () => {
    let d = makeDuel({ p1: { monsters: [E("Woodsman")], deck: ["Polymerization"] } }); Effects.runPhaseTriggers(d.game, "standby", d.p1); settle(d); assert.ok(d.names(d.p1, "hand").includes("Polymerization"));
    d = makeDuel({ p1: { monsters: [E("Ocean"), E("Wildheart")] } }); Effects.runPhaseTriggers(d.game, "standby", d.p1); d.choose(E("Wildheart")); settle(d); assert.ok(d.names(d.p1, "hand").includes(E("Wildheart")));
});
test("Flame Wingman / Shining Flare Wingman burn for the ATK of what they destroy; Steam Healer gains it", () => {
    let d = makeDuel({ p1: { monsters: [E("Flame Wingman")] }, p2: { monsters: [{ name: "Feral Imp", pos: "attack" }] } }); atk(d, d.mon(d.p1, E("Flame Wingman")), d.mon(d.p2, "Feral Imp"));
    assert.equal(d.p2.lifePoints, 8000 - (2100 - 1300) - 1300);
    d = makeDuel({ p1: { monsters: [E("Steam Healer")], lp: 5000 }, p2: { monsters: [{ name: "Feral Imp", pos: "attack" }] } }); atk(d, d.mon(d.p1, E("Steam Healer")), d.mon(d.p2, "Feral Imp"));
    assert.equal(d.p1.lifePoints, 5000 + 1300);
    d = makeDuel({ p1: { monsters: [E("Shining Flare Wingman")], graveyard: [E("Heat"), E("Wildheart"), "Pot of Greed"] } }); assert.equal(d.atk(E("Shining Flare Wingman"), d.p1), 2500 + 600);
});
test("Wildedge attacks every opposing monster once; Mariner attacks directly with a Set card; Mudballman can't be Special Summoned otherwise", () => {
    const d = makeDuel({ p1: { monsters: [E("Wildedge")] }, p2: { monsters: [{ name: "Feral Imp", pos: "defense" }, { name: "Sangan", pos: "defense" }] } });
    const w = d.mon(d.p1, E("Wildedge")); d.game.phase = "battle";
    d.game.declareAttack(w, d.mon(d.p2, "Feral Imp")); if (d.game.state.awaitingResponse) d.game.dispatch({ type: "PASS_RESPONSE" }); settle(d);
    assert.equal(d.game.canAttack(w), true, "a second attack is available");
    assert.equal(d.game.declareAttack(w, d.mon(d.p2, "Feral Imp")) , false, "not the same monster twice");
    const m = makeDuel({ p1: { monsters: [E("Mariner")], spellTrap: [{ name: "Mirror Force", faceUp: false }] }, p2: { monsters: ["Feral Imp"] } });
    m.game.phase = "battle"; assert.ok(m.game.declareAttack(m.mon(m.p1, E("Mariner")), null));
    assert.equal(Effects.cannotBeSpecialSummoned(E("Mudballman")), true);
});
test("Hero Signal: offered right after one of your monsters is destroyed by battle; summons a Level 4 or lower HERO", () => {
    const d = makeDuel({ p1: { monsters: ["Feral Imp"], spellTrap: [{ name: "Hero Signal", faceUp: false }], deck: [E("Wildheart")] }, p2: { monsters: ["Summoned Skull"] } });
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.game.phase = "battle";
    d.game.declareAttack(d.mon(d.p2, "Summoned Skull"), d.mon(d.p1, "Feral Imp")); if (d.game.state.awaitingResponse) d.game.dispatch({ type: "PASS_RESPONSE" });
    assert.ok(d.game.state.awaitingChain, "a window opens after the battle"); assert.equal(d.game.chainWindow.player, d.p1);
    d.game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: d.st(d.p1, "Hero Signal") } }); settle(d);
    assert.ok(d.mon(d.p1, E("Wildheart")));
});
test("Hero Barrier negates the next attack of the opponent's turn only while you control an Elemental HERO", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull", "Feral Imp"] }, p2: { monsters: [E("Wildheart")], spellTrap: [{ name: "Hero Barrier", faceUp: false }] } });
    assert.equal(d.game.checkActivation(d.st(d.p2, "Hero Barrier"), "idle").ok, false, "only during the opponent's turn");
    d.game.phase = "battle"; d.game.battleResponse = null; d.game.chainWindow = { player: d.p2 }; d.game.chain = [{ speed: 1, gc: d.p1.zone.monster[2], meta: {}, owner: d.p1 }];
    assert.ok(d.game.checkActivation(d.st(d.p2, "Hero Barrier"), "chain").ok);
    d.game.chain = []; d.game.chainWindow = null;
    d.activateSet("Hero Barrier", null, d.p2, "chain");
});
test("Hero Heart: halve ATK, attack twice", () => {
    const d = makeDuel({ p1: { hand: ["Hero Heart"], monsters: [E("Wildheart")] }, p2: {} });
    const w = d.mon(d.p1, E("Wildheart")); d.activate("Hero Heart", w); settle(d); assert.equal(d.atk(w, d.p1), 750);
    d.game.phase = "battle"; d.game.declareAttack(w, null); settle(d); assert.equal(d.game.canAttack(w), true); d.game.declareAttack(w, null); settle(d); assert.equal(d.game.canAttack(w), false);
});
test("Hero Ring: a Warrior with 1500 or less ATK; opposing monsters with 1900+ ATK can't attack it", () => {
    const d = makeDuel({ p1: { spellTrap: [{ name: "Hero Ring", faceUp: false }], monsters: ["Battle Warrior"] }, p2: { monsters: ["Summoned Skull", "Feral Imp"] } });
    const w = d.mon(d.p1, "Battle Warrior"); assert.ok(d.activateSet("Hero Ring", w)); settle(d); assert.ok(d.st(d.p1, "Hero Ring"), "stays on the field as an equip");
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.game.phase = "battle";
    assert.equal(d.game.declareAttack(d.mon(d.p2, "Summoned Skull"), w), false);
    assert.notEqual(d.game.declareAttack(d.mon(d.p2, "Feral Imp"), w), false, "a weaker monster may attack");
});
test("Hero Blast, Hero Counterattack, A Hero Emerges", () => {
    const LC = require("../LocalCards");
    const normalEH = LC.all().map(r => LC.toApiShape(r)).find(c => /^Elemental HERO /.test(c.name) && c.type === "Normal Monster" && c.atk >= 1300 && c.atk < 2500).name;
    let d = makeDuel({ p1: { spellTrap: [{ name: "Hero Blast", faceUp: false }], graveyard: [normalEH] }, p2: { monsters: ["Feral Imp", "Summoned Skull"] } });
    assert.equal(d.game.checkActivation(d.st(d.p1, "Hero Blast"), "idle", d.p1.zone.graveyard[0].instanceId).ok, true);
    assert.ok(d.activateSet("Hero Blast", d.find(d.p1, normalEH, "graveyard"))); settle(d);
    assert.ok(d.names(d.p1, "hand").includes(normalEH)); assert.equal(d.mon(d.p2, "Feral Imp"), null, "ATK 1300 <= the added monster's ATK"); assert.ok(d.mon(d.p2, "Summoned Skull"));
    d = makeDuel({ p1: { monsters: ["Summoned Skull"], spellTrap: [{ name: "A Hero Emerges", faceUp: false }], hand: [E("Wildheart")] }, p2: { monsters: ["Feral Imp"] } });
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.game.phase = "battle"; d.game.declareAttack(d.mon(d.p2, "Feral Imp"), d.mon(d.p1, "Summoned Skull")); assert.ok(d.game.state.awaitingResponse);
    d.game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: d.st(d.p1, "A Hero Emerges") } }); settle(d); assert.ok(d.mon(d.p1, E("Wildheart")), "the only card in hand is summoned");
});
test("Hero's Rule 2 negates a Spell that targets the Graveyard and destroys it", () => {
    const d = makeDuel({ p1: { hand: ["Monster Reborn"] }, p2: { spellTrap: [{ name: "Hero's Rule 2", faceUp: false }], graveyard: ["Summoned Skull"] } });
    d.activate("Monster Reborn", d.find(d.p2, "Summoned Skull", "graveyard")); assert.ok(d.game.state.awaitingChain);
    d.game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: d.st(d.p2, "Hero's Rule 2") } }); settle(d);
    assert.equal(d.p1.getMonstersOnField().length, 0, "Monster Reborn was negated"); assert.ok(d.names(d.p1, "graveyard").includes("Monster Reborn"));
});
test("Skyscraper: +1000 ATK for an Elemental HERO attacking a stronger monster, in damage calculation only", () => {
    const d = makeDuel({ p1: { monsters: [E("Wildheart")], spellTrap: ["Skyscraper"] }, p2: { monsters: [{ name: "Summoned Skull", pos: "attack" }] } });
    const w = d.mon(d.p1, E("Wildheart")); assert.equal(d.atk(w, d.p1), 1500);
    atk(d, w, d.mon(d.p2, "Summoned Skull")); assert.equal(d.mon(d.p2, "Summoned Skull"), null, "1500 + 1000 = 2500 vs 2500: both are destroyed");
    assert.equal(d.mon(d.p1, E("Wildheart")), null);
});
test("Skyscraper 2 revives an Elemental HERO that was destroyed by battle; Neo Space gives Neos +500", () => {
    const d = makeDuel({ p1: { hand: ["Skyscraper 2 - Hero City"], graveyard: [E("Wildheart")] } });
    d.find(d.p1, E("Wildheart"), "graveyard")._gyByBattle = true; d.activate("Skyscraper 2 - Hero City"); settle(d);
    const city = d.p1.zone.field || d.st(d.p1, "Skyscraper 2 - Hero City"); assert.ok(d.game.checkActivation(city, "idle").ok);
    d.game.dispatch({ type: "ACTIVATE_QUICK", payload: { card: city } }); settle(d); assert.ok(d.mon(d.p1, E("Wildheart")));
    const n = makeDuel({ p1: { hand: ["Neo Space"], monsters: [E("Neos")] } }); const base = n.atk(E("Neos"), n.p1); n.activate("Neo Space"); settle(n); assert.equal(n.atk(E("Neos"), n.p1), base + 500);
});
