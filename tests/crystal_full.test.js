"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel } = require("./harness");
const CB = n => "Crystal Beast " + n;
const SEVEN = ["Sapphire Pegasus", "Amethyst Cat", "Emerald Tortoise", "Topaz Tiger", "Ruby Carbuncle", "Amber Mammoth", "Cobalt Eagle"].map(CB);
const settle = d => { for (let i = 0; i < 14 && (d.game.state.awaitingChain || d.game.state.awaitingChoice); i++) { if (!d.game.state.awaitingChoice) d.game.dispatch({ type: "PASS_RESPONSE" }); else if (d.game.choice.option) d.game.resolveOption(d.game.choice.options[0].id); else if (d.game.choice.min === 0) d.game.resolveChoice([]); else d.choose("first"); } };

test("Crystal Tree gains a counter for each Crystal Beast placed (either player); sends itself to take that many from the Deck", () => {
    const d = makeDuel({ p1: { hand: ["Crystal Tree", "Crystal Bond"], deck: [CB("Topaz Tiger"), CB("Cobalt Eagle"), CB("Amethyst Cat")] }, p2: {} });
    d.activate("Crystal Tree"); settle(d);
    const tree = d.st(d.p1, "Crystal Tree");
    d.activate("Crystal Bond"); d.choose(CB("Topaz Tiger")); d.choose(CB("Cobalt Eagle")); settle(d);      // places 1 Crystal Beast
    assert.equal(tree._crystalCounters, 1);
    const chk = d.game.checkActivation(tree, "idle"); assert.ok(chk.ok, chk.reason);
    d.game.dispatch({ type: "ACTIVATE_QUICK", payload: { card: tree } }); settle(d);
    assert.ok(d.names(d.p1, "graveyard").includes("Crystal Tree"));
    assert.equal(d.p1.getSpellTrapsOnField().filter(c => /Crystal Beast/.test(c.card.name)).length, 2, "the placed one + 1 taken with the counter");
});
test("Rainbow Dragon: exactly 7 different Crystal Beast cards to Special Summon from the hand", () => {
    const six = makeDuel({ p1: { hand: ["Rainbow Dragon"], graveyard: SEVEN.slice(0, 6) } }); assert.equal(six.game.activateHandEffect(six.hand(six.p1, "Rainbow Dragon")), false);
    const seven = makeDuel({ p1: { hand: ["Rainbow Dragon"], graveyard: SEVEN.slice(0, 4), spellTrap: SEVEN.slice(4) } });
    assert.ok(seven.game.activateHandEffect(seven.hand(seven.p1, "Rainbow Dragon"))); assert.ok(seven.mon(seven.p1, "Rainbow Dragon"));
});
test("Rainbow Dragon: Quick Effect sends your Crystal Beasts to the GY for +1000 ATK each — not the turn it was Summoned", () => {
    const d = makeDuel({ p1: { monsters: ["Rainbow Dragon", CB("Topaz Tiger"), CB("Amethyst Cat")] } });
    const rd = d.mon(d.p1, "Rainbow Dragon"), base = d.atk(rd, d.p1);
    rd.state.hasBeenSummonedThisTurn = true; assert.equal(d.game.checkActivation(rd, "idle").ok, false, "same turn as its Summon");
    rd.state.hasBeenSummonedThisTurn = false;
    assert.ok(d.game.checkActivation(rd, "idle").ok); d.game.dispatch({ type: "ACTIVATE_QUICK", payload: { card: rd } }); settle(d);
    assert.equal(d.atk(rd, d.p1), base + 2000); assert.equal(d.names(d.p1, "graveyard").filter(n => /Crystal Beast/.test(n)).length, 2, "sent to the GY, not placed in the S/T Zone");
});
test("Rainbow Dragon is also a legal chain response (it is a Quick Effect)", () => {
    const d = makeDuel({ p1: { hand: ["Pot of Greed"] }, p2: { monsters: ["Rainbow Dragon", CB("Topaz Tiger")] } });
    d.activate("Pot of Greed"); assert.ok(d.game.state.awaitingChain); assert.ok(d.game.getChainResponses(d.p2).includes(d.mon(d.p2, "Rainbow Dragon")));
});
test("Rainbow Dragon's other effect: banish the Crystal Beasts in the GY, shuffle every card on the field into the Deck", () => {
    const d = makeDuel({ p1: { monsters: ["Rainbow Dragon", "Feral Imp"], graveyard: [CB("Topaz Tiger")] }, p2: { monsters: ["Summoned Skull"], spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    assert.ok(d.game.activateMonsterEffect(d.mon(d.p1, "Rainbow Dragon"), null)); settle(d);
    assert.equal(d.p1.getMonstersOnField().length + d.p2.getMonstersOnField().length + d.p2.getSpellTrapsOnField().length, 0);
    assert.deepEqual(d.names(d.p1, "banished"), [CB("Topaz Tiger")]);
});
test("Crystal Release: +800 ATK, and when it goes to the GY you may place a Crystal Beast from the Deck", () => {
    const d = makeDuel({ p1: { hand: ["Crystal Release"], monsters: [CB("Topaz Tiger")], deck: [CB("Cobalt Eagle")] } });
    const m = d.mon(d.p1, CB("Topaz Tiger")), a = d.atk(m, d.p1);
    assert.ok(d.activate("Crystal Release", m)); settle(d); assert.equal(d.atk(m, d.p1), a + 800);
    d.game.player1.moveCard(d.st(d.p1, "Crystal Release"), "spellTrap", "graveyard"); d.game.checkForWinner();
    assert.ok(d.game.choice, "asked whether to place one"); d.choose(CB("Cobalt Eagle")); settle(d);
    assert.deepEqual(d.names(d.p1, "spellTrap"), [CB("Cobalt Eagle")]);
});
test("Amber Mammoth redirects an attack on another Crystal Beast to itself", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"] }, p2: { monsters: [CB("Topaz Tiger"), CB("Amber Mammoth")] } });
    d.game.phase = "battle";
    assert.ok(d.game.declareAttack(d.mon(d.p1, "Summoned Skull"), d.mon(d.p2, CB("Topaz Tiger"))));
    assert.ok(d.game.state.awaitingResponse, "the defender is offered a response");
    const mam = d.mon(d.p2, CB("Amber Mammoth")); assert.ok(d.game.getEligibleQuickMonsters(d.p2).includes(mam));
    d.game.dispatch({ type: "ACTIVATE_QUICK", payload: { card: mam } }); settle(d);
    assert.ok(d.mon(d.p2, CB("Topaz Tiger")), "Topaz Tiger was not attacked");
    assert.ok(d.game.log.some(l => /new attack target/.test(l)));
});
test("Amber Mammoth can't redirect an attack on a monster that isn't a Crystal Beast", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"] }, p2: { monsters: ["Feral Imp", CB("Amber Mammoth")] } });
    d.game.phase = "battle"; d.game.declareAttack(d.mon(d.p1, "Summoned Skull"), d.mon(d.p2, "Feral Imp"));
    assert.equal(d.game.getEligibleQuickMonsters(d.p2).length, 0);
});
test("Rainbow Path: send a Crystal Beast card to negate an attack, then optionally add a Rainbow Dragon", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"] }, p2: { spellTrap: [CB("Topaz Tiger"), { name: "Rainbow Path", faceUp: false }], deck: ["Rainbow Dragon"] } });
    d.game.phase = "battle"; d.game.declareAttack(d.mon(d.p1, "Summoned Skull"), null);
    assert.equal(d.game.checkActivation(d.st(d.p2, "Rainbow Path"), "battle").ok, true);
    d.game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: d.st(d.p2, "Rainbow Path") } });
    while (d.game.state.awaitingChoice) { if (d.game.choice.min === 0) d.game.resolveChoice(d.game.choice.candidateIds.slice(0, 1)); else d.choose("first"); } settle(d);
    assert.equal(d.p2.lifePoints, 8000, "the attack was negated"); assert.ok(d.names(d.p2, "hand").includes("Rainbow Dragon"));
    assert.ok(d.names(d.p2, "graveyard").includes(CB("Topaz Tiger")));
});
test("Rainbow Path is refused with no Crystal Beast card in the Spell & Trap Zone", () => {
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"] }, p2: { spellTrap: [{ name: "Rainbow Path", faceUp: false }] } });
    d.game.phase = "battle"; d.game.battleResponse = { defender: d.p2 }; d.game.pendingAttack = { attacker: d.mon(d.p1, "Summoned Skull"), target: null };
    assert.equal(d.game.checkActivation(d.st(d.p2, "Rainbow Path"), "battle").ok, false);
});
test("Rainbow Veil: the opposing monster's effects are negated while it battles the equipped monster, until the Battle Phase ends", () => {
    const d = makeDuel({ p1: { hand: ["Rainbow Veil"], monsters: ["Summoned Skull"] }, p2: { monsters: [{ name: "Sangan", pos: "attack" }] } });
    d.activate("Rainbow Veil", d.mon(d.p1, "Summoned Skull")); settle(d); d.game.phase = "battle";
    d.game.declareAttack(d.mon(d.p1, "Summoned Skull"), d.mon(d.p2, "Sangan")); if (d.game.state.awaitingResponse) d.game.dispatch({ type: "PASS_RESPONSE" });
    assert.ok(d.game.log.some(l => /Rainbow Veil negates Sangan/.test(l)));
});
test("Crystal Pair needs a Crystal Beast destroyed by battle AND sent to the GY; you take no battle damage afterwards", () => {
    const none = makeDuel({ p1: { spellTrap: [{ name: "Crystal Pair", faceUp: false }], deck: [CB("Cobalt Eagle")] } });
    assert.equal(none.game.checkActivation(none.st(none.p1, "Crystal Pair"), "idle").ok, false);
    const d = makeDuel({ p1: { spellTrap: [{ name: "Crystal Pair", faceUp: false }], graveyard: [CB("Topaz Tiger")], deck: [CB("Cobalt Eagle")] } });
    const gy = d.find(d.p1, CB("Topaz Tiger"), "graveyard"); gy._gyTurn = d.game.turn; gy._gyByBattle = true;
    assert.ok(d.activateSet("Crystal Pair")); d.choose("first"); settle(d);
    assert.deepEqual(d.names(d.p1, "spellTrap"), [CB("Cobalt Eagle")]); assert.equal(d.game.preventBattleDamageFor, d.p1);
});
test("Rainbow Gravity: 7 different Crystal Beasts -> Special Summon an Ultimate Crystal from the Deck or GY", () => {
    const d = makeDuel({ p1: { spellTrap: [{ name: "Rainbow Gravity", faceUp: false }, ...SEVEN.slice(0, 3)], graveyard: SEVEN.slice(3), deck: ["Rainbow Dragon"] } });
    assert.ok(d.activateSet("Rainbow Gravity")); d.choose("first"); settle(d);
    assert.ok(d.mon(d.p1, "Rainbow Dragon"));
    const few = makeDuel({ p1: { spellTrap: [{ name: "Rainbow Gravity", faceUp: false }], graveyard: SEVEN.slice(0, 5), deck: ["Rainbow Dragon"] } });
    assert.equal(few.game.checkActivation(few.st(few.p1, "Rainbow Gravity"), "idle").ok, false);
});
test("Crystal Abundance: send 4 Crystal Beast cards, wipe the field, revive as many as the opponent lost", () => {
    const d = makeDuel({ p1: { hand: ["Crystal Abundance"], spellTrap: SEVEN.slice(0, 4), monsters: ["Feral Imp"] }, p2: { monsters: ["Summoned Skull", "Sangan"], spellTrap: [{ name: "Mirror Force", faceUp: false }] } });
    assert.ok(d.activate("Crystal Abundance")); d.choose(...SEVEN.slice(0, 4));
    d.choose(CB("Amethyst Cat"), CB("Emerald Tortoise"), CB("Topaz Tiger")); settle(d);   // (no Summon-triggered Pegasus/Carbuncle)
    assert.equal(d.p2.getMonstersOnField().length + d.p2.getSpellTrapsOnField().length, 0);
    assert.equal(d.p1.getMonstersOnField().filter(m => /Crystal Beast/.test(m.card.name)).length, 3, "3 opposing cards were sent");
});
test("Rainbow Dark Dragon: banish 7 different DARK monsters to Summon it; its effect banishes the rest and gains 500 each", () => {
    const dark = LocalCards().filter(c => c.attribute === "DARK" && /Monster/.test(c.type) && !/Effect|Fusion|Ritual/.test(c.type)).map(c => c.name).filter((n, i, a) => a.indexOf(n) === i).slice(0, 8);
    let d = makeDuel({ p1: { hand: ["Rainbow Dark Dragon"], graveyard: dark.slice(0, 6) } }); assert.equal(d.game.activateHandEffect(d.hand(d.p1, "Rainbow Dark Dragon")), false);
    d = makeDuel({ p1: { hand: ["Rainbow Dark Dragon"], graveyard: dark.slice(0, 8) } });
    assert.ok(d.game.activateHandEffect(d.hand(d.p1, "Rainbow Dark Dragon"))); settle(d); const rdd = d.mon(d.p1, "Rainbow Dark Dragon"); assert.ok(rdd);
    assert.equal(d.names(d.p1, "banished").length, 7);
    const base = d.atk(rdd, d.p1); assert.ok(d.game.activateMonsterEffect(rdd, null)); assert.equal(d.atk(rdd, d.p1), base + 500, "1 DARK monster was left in the GY");
});
function LocalCards() { const L = require("../LocalCards"); return L.all().map(r => L.toApiShape(r)); }
test("Crystal Seer: excavate 2, add 1 to the hand, the other goes to the bottom", () => {
    const d = makeDuel({ p1: { monsters: [{ name: "Crystal Seer", faceUp: false }], deck: ["Pot of Greed", "Sangan"] } });
    const m = d.mon(d.p1, "Crystal Seer"); m.faceUp = true; require("../Effects").triggerFlip(d.game, m);
    assert.deepEqual(d.choiceNames().sort(), ["Pot of Greed", "Sangan"]); d.choose("Sangan");
    assert.ok(d.names(d.p1, "hand").includes("Sangan")); assert.equal(d.p1.zone.deck[d.p1.zone.deck.length - 1].card.name, "Pot of Greed");
});
test("Ancient City - Rainbow Ruins: indestructible by effects with a Crystal Beast, halves battle damage (2+), draws (4+)", () => {
    const d = makeDuel({ p1: { spellTrap: ["Ancient City - Rainbow Ruins", ...SEVEN.slice(0, 4)] }, p2: { hand: ["Mystical Space Typhoon"] } });
    const city = d.st(d.p1, "Ancient City - Rainbow Ruins");
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.activate("Mystical Space Typhoon", city, d.p2); settle(d);
    assert.ok(d.st(d.p1, "Ancient City - Rainbow Ruins"), "cannot be destroyed by card effects");
    d.game.currentPlayer = d.p1; d.game.opponentPlayer = d.p2; d.game.phase = "m1"; d.game.state.waitingForAction = true;
    const h = d.p1.zone.hand.length; assert.ok(d.game.checkActivation(city, "idle").ok);
    d.game.dispatch({ type: "ACTIVATE_QUICK", payload: { card: city } }); settle(d); assert.equal(d.p1.zone.hand.length, h + 1);
    assert.equal(d.game.checkActivation(city, "idle").ok, false, "once per turn each");
});
test("Ancient City (3+ Crystal Beast cards): sends a Crystal Beast monster to negate and destroy a Spell/Trap activation", () => {
    const d = makeDuel({ p1: { spellTrap: ["Ancient City - Rainbow Ruins", ...SEVEN.slice(0, 3)], monsters: [CB("Topaz Tiger")] }, p2: { hand: ["Pot of Greed"] } });
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.activate("Pot of Greed", null, d.p2);
    assert.ok(d.game.state.awaitingChain); const city = d.st(d.p1, "Ancient City - Rainbow Ruins");
    assert.ok(d.game.getChainResponses(d.p1).includes(city));
    const hand = d.p2.zone.hand.length;
    d.game.dispatch({ type: "ACTIVATE_QUICK", payload: { card: city } }); settle(d);
    assert.equal(d.p2.zone.hand.length, hand, "Pot of Greed was negated: no cards drawn");
    assert.ok(d.names(d.p1, "graveyard").includes(CB("Topaz Tiger")), "sent to the GY as the cost, not placed in the S/T Zone");
});
test("Rainbow Neos: Fusion Summon with Neos + an Ultimate Crystal; its effect shuffles the opponent's monsters away", () => {
    const d = makeDuel({ p1: { hand: ["Polymerization"], monsters: ["Elemental HERO Neos", "Rainbow Dragon"], extra: ["Rainbow Neos"] }, p2: { monsters: ["Summoned Skull", "Sangan"] } });
    assert.ok(d.activate("Polymerization", d.p1.zone.extraDeck[0])); settle(d);
    const rn = d.mon(d.p1, "Rainbow Neos"); assert.ok(rn, "Rainbow Neos summoned");
    assert.ok(d.game.activateMonsterEffect(rn, null)); d.game.resolveOption("mon"); while (d.game.state.awaitingChoice) d.choose("first");
    assert.equal(d.p2.getMonstersOnField().length, 0); assert.equal(d.p2.zone.deck.filter(c => ["Summoned Skull", "Sangan"].includes(c.card.name)).length, 2);
});
