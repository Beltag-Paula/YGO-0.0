"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel } = require("./harness");

const CB = n => "Crystal Beast " + n;

test("A destroyed Crystal Beast is placed in the Spell & Trap Zone, not the Graveyard", () => {
    const d = makeDuel({ p1: { monsters: [CB("Topaz Tiger")] }, p2: { hand: ["Raigeki"] } });
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1;
    d.activate("Raigeki", null, d.p2);
    assert.deepEqual(d.names(d.p1, "monster"), []);
    assert.deepEqual(d.names(d.p1, "spellTrap"), [CB("Topaz Tiger")]);
    assert.deepEqual(d.names(d.p1, "graveyard"), []);
    assert.equal(d.st(d.p1, CB("Topaz Tiger")).faceUp, true);
});
test("Tributing a Crystal Beast is NOT destruction: it goes to the Graveyard", () => {
    const d = makeDuel({ p1: { hand: ["Summoned Skull"], monsters: [CB("Topaz Tiger")] } });
    assert.ok(d.game.normalSummon(d.hand(d.p1, "Summoned Skull"), [d.mon(d.p1, CB("Topaz Tiger")).zoneIndex]));
    assert.deepEqual(d.names(d.p1, "graveyard"), [CB("Topaz Tiger")]);
});
test("With a full Spell & Trap Zone the Crystal Beast goes to the Graveyard", () => {
    const d = makeDuel({ p1: { monsters: [CB("Topaz Tiger")], spellTrap: ["Mirror Force", "Mirror Force", "Mirror Force", "Mirror Force", "Mirror Force"].map(n => ({ name: n, faceUp: false })) }, p2: { hand: ["Raigeki"] } });
    d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1;
    d.activate("Raigeki", null, d.p2);
    assert.deepEqual(d.names(d.p1, "graveyard"), [CB("Topaz Tiger")]);
});
test("Sapphire Pegasus: when Summoned, place another Crystal Beast from the Deck", () => {
    const d = makeDuel({ p1: { hand: [CB("Sapphire Pegasus")], deck: [CB("Cobalt Eagle")] } });
    assert.ok(d.game.normalSummon(d.hand(d.p1, CB("Sapphire Pegasus")), []));
    d.choose(CB("Cobalt Eagle"));
    assert.deepEqual(d.names(d.p1, "spellTrap"), [CB("Cobalt Eagle")]);
});
test("Ruby Carbuncle: when Special Summoned, summon all Crystal Beasts from the S/T Zone", () => {
    const d = makeDuel({ p1: { hand: ["Crystal Promise"], spellTrap: [CB("Topaz Tiger"), CB("Cobalt Eagle"), CB("Ruby Carbuncle")] } });
    assert.ok(d.activate("Crystal Promise", d.st(d.p1, CB("Ruby Carbuncle"))));
    assert.deepEqual(d.names(d.p1, "monster").sort(), [CB("Cobalt Eagle"), CB("Ruby Carbuncle"), CB("Topaz Tiger")]);
    assert.equal(d.p1.getSpellTrapsOnField().length, 0);
});
test("Cobalt Eagle returns a Crystal Beast card to the top of the Deck", () => {
    const d = makeDuel({ p1: { monsters: [CB("Cobalt Eagle")], spellTrap: [CB("Topaz Tiger")] } });
    assert.ok(d.game.activateMonsterEffect(d.mon(d.p1, CB("Cobalt Eagle")), d.st(d.p1, CB("Topaz Tiger")).instanceId));
    assert.equal(d.p1.zone.deck[0].card.name, CB("Topaz Tiger"));
});
test("Topaz Tiger gains 400 ATK only when attacking a monster", () => {
    const d = makeDuel({ p1: { monsters: [CB("Topaz Tiger")] }, p2: { monsters: [{ name: "Feral Imp", pos: "attack" }] } });
    const t = d.mon(d.p1, CB("Topaz Tiger"));
    assert.equal(d.atk(t), 1600);
    d.game.phase = "battle"; d.game.declareAttack(t, d.mon(d.p2, "Feral Imp")); // 1600+400 vs 1300
    assert.equal(d.p2.lifePoints, 8000 - (2000 - 1300));
    assert.equal(d.atk(t), 1600, "boost ends with the Damage Step");
});
test("Amethyst Cat attacks directly for half damage even with monsters on the field", () => {
    const d = makeDuel({ p1: { monsters: [CB("Amethyst Cat")] }, p2: { monsters: ["Summoned Skull"] } });
    d.game.phase = "battle";
    assert.ok(d.game.declareAttack(d.mon(d.p1, CB("Amethyst Cat")), null));
    assert.equal(d.p2.lifePoints, 8000 - 600);
});
test("Emerald Tortoise switches a monster that attacked to Defense", () => {
    const d = makeDuel({ p1: { monsters: [CB("Emerald Tortoise"), "Feral Imp"] } });
    const imp = d.mon(d.p1, "Feral Imp"); imp.state.hasAttackedThisTurn = true;
    assert.ok(d.game.activateMonsterEffect(d.mon(d.p1, CB("Emerald Tortoise")), imp.instanceId));
    assert.equal(imp.position, "defense");
});
test("Crystal Bond: add 1 from the Deck and place a different one", () => {
    const d = makeDuel({ p1: { hand: ["Crystal Bond"], deck: [CB("Topaz Tiger"), CB("Cobalt Eagle")] } });
    assert.ok(d.activate("Crystal Bond"));
    d.choose(CB("Topaz Tiger")); if (d.game.state.awaitingChoice) d.choose(CB("Cobalt Eagle"));
    assert.deepEqual(d.names(d.p1, "hand"), [CB("Topaz Tiger")]);
    assert.deepEqual(d.names(d.p1, "spellTrap"), [CB("Cobalt Eagle")]);
});
test("Crystal Blessing places up to 2 Crystal Beasts from the Graveyard", () => {
    const d = makeDuel({ p1: { hand: ["Crystal Blessing"], graveyard: [CB("Topaz Tiger"), CB("Cobalt Eagle"), CB("Amethyst Cat")] } });
    assert.ok(d.activate("Crystal Blessing"));
    d.choose(CB("Topaz Tiger"), CB("Cobalt Eagle"));
    assert.equal(d.p1.getSpellTrapsOnField().filter(c => /Crystal Beast/.test(c.card.name)).length, 2);
});
test("Crystal Beacon needs 2+ Crystal Beast cards in the S/T Zone", () => {
    const one = makeDuel({ p1: { hand: ["Crystal Beacon"], spellTrap: [CB("Topaz Tiger")], deck: [CB("Cobalt Eagle")] } });
    assert.equal(one.activate("Crystal Beacon"), false);
    const two = makeDuel({ p1: { hand: ["Crystal Beacon"], spellTrap: [CB("Topaz Tiger"), CB("Amethyst Cat")], deck: [CB("Cobalt Eagle")] } });
    assert.ok(two.activate("Crystal Beacon"));
    if (two.game.state.awaitingChoice) two.choose("first");
    assert.deepEqual(two.names(two.p1, "monster"), [CB("Cobalt Eagle")]);
});
test("Crystal Raigeki sends a Crystal Beast card to destroy a card the opponent controls", () => {
    const d = makeDuel({ p1: { spellTrap: [CB("Topaz Tiger"), { name: "Crystal Raigeki", faceUp: false }] }, p2: { monsters: ["Summoned Skull"] } });
    assert.ok(d.activateSet("Crystal Raigeki", d.mon(d.p2, "Summoned Skull")));
    d.choose("first");
    assert.deepEqual(d.names(d.p2, "monster"), []);
    assert.deepEqual(d.names(d.p1, "graveyard").includes(CB("Topaz Tiger")), true);
});
test("Crystal Boon summons up to 2 from the S/T Zone and gains their ATK", () => {
    const d = makeDuel({ p1: { spellTrap: [CB("Topaz Tiger"), CB("Amethyst Cat"), { name: "Crystal Boon", faceUp: false }] } });
    assert.ok(d.activateSet("Crystal Boon"));
    d.choose(CB("Topaz Tiger"), CB("Amethyst Cat"));
    assert.equal(d.p1.lifePoints, 8000 + 1600 + 1200);
    assert.equal(d.p1.getMonstersOnField().length, 2);
});
test("Rare Value: opponent chooses, you send it and draw 2", () => {
    const d = makeDuel({ p1: { hand: ["Rare Value"], spellTrap: [CB("Topaz Tiger"), CB("Amethyst Cat")] } });
    const hand = d.p1.zone.hand.length;
    assert.ok(d.activate("Rare Value"));
    d.choose("first");
    assert.equal(d.p1.zone.hand.length, hand - 1 + 2);
});
test("Crystal Release equips +800 ATK to a Crystal Beast only", () => {
    const d = makeDuel({ p1: { hand: ["Crystal Release"], monsters: [CB("Topaz Tiger"), "Feral Imp"] } });
    assert.equal(d.activate("Crystal Release", d.mon(d.p1, "Feral Imp")), false);
    assert.ok(d.activate("Crystal Release", d.mon(d.p1, CB("Topaz Tiger"))));
    assert.equal(d.atk(d.mon(d.p1, CB("Topaz Tiger"))), 2400);
});
test("Rainbow Life turns damage into Life Points for the turn", () => {
    const d = makeDuel({ p1: { hand: ["Feral Imp"], spellTrap: [{ name: "Rainbow Life", faceUp: false }] } });
    assert.ok(d.activateSet("Rainbow Life")); d.choose("first");
    d.p1.dealDamage(1000);
    assert.equal(d.p1.lifePoints, 9000);
});
test("Rainbow Dragon: summoned from the hand only with 7 different Crystal Beasts", () => {
    const names = ["Sapphire Pegasus", "Amethyst Cat", "Emerald Tortoise", "Topaz Tiger", "Ruby Carbuncle", "Amber Mammoth", "Cobalt Eagle"].map(CB);
    const six = makeDuel({ p1: { hand: ["Rainbow Dragon"], graveyard: names.slice(0, 6) } });
    assert.equal(six.game.activateHandEffect(six.hand(six.p1, "Rainbow Dragon")), false);
    const seven = makeDuel({ p1: { hand: ["Rainbow Dragon"], graveyard: names.slice(0, 4), spellTrap: names.slice(4) } });
    assert.equal(seven.game.canNormalSummon(seven.hand(seven.p1, "Rainbow Dragon")), false);
    assert.ok(seven.game.activateHandEffect(seven.hand(seven.p1, "Rainbow Dragon")));
    assert.deepEqual(seven.names(seven.p1, "monster"), ["Rainbow Dragon"]);
});
