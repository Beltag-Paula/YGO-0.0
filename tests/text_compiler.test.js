"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel } = require("./harness");
const Effects = require("../Effects");
const { parseSel } = require("../scripts/96_text_compiler");

test("selector grammar: counts, zones, qualifiers, and rejects what it does not understand", () => {
    const s = parseSel('1 face-up FIRE monster your opponent controls');
    assert.equal(s.zone, "field"); assert.equal(s.side, "opp"); assert.equal(s.n, 1); assert.ok(s.faceUp);
    const g = parseSel("all Spell/Trap Cards on the field"); assert.ok(g.all); assert.equal(g.noun, "st");
    const d = parseSel('1 DARK monster with 1500 or less ATK in your GY'); assert.equal(d.zone, "graveyard");
    assert.equal(parseSel("1 monster that nobody understands"), null);
});
test("compiled cards are registered and reported as scripted/partial, never silently", () => {
    for (const n of ["Dark Eruption", "White Ninja", "Mobius the Frost Monarch"]) assert.ok(Effects.scriptKinds(n).length, n);
});
test("Dark Eruption (compiled): Target 1 DARK monster ≤1500 ATK in GY; add it to hand", () => {
    const d = makeDuel({ p1: { hand: ["Dark Eruption"], graveyard: ["Summoned Skull", "Feral Imp"] } });
    const imp = d.find(d.p1, "Feral Imp", "graveyard");
    assert.ok(d.use("Dark Eruption", imp));
    assert.ok(d.hand(d.p1, "Feral Imp"), "the ≤1500 ATK monster came back");
    assert.ok(d.find(d.p1, "Summoned Skull", "graveyard"), "the 2500 ATK one stayed");
});
test("Dark Eruption cannot target a monster that is over the ATK limit", () => {
    const d = makeDuel({ p1: { hand: ["Dark Eruption"], graveyard: ["Summoned Skull"] } });
    assert.equal(d.use("Dark Eruption", d.find(d.p1, "Summoned Skull", "graveyard")), false);
});
test("Mobius: Tribute Summon trigger is registered as an on-summon effect", () => {
    assert.ok(Effects.getOnSummon("Mobius the Frost Monarch"));
});

test("End Phase / Standby compiled triggers are registered", () => {
    const Effects = require("../Effects");
    const L = require("../LocalCards");
    let n = 0;
    for (const r of L.all()) if (/Monster/.test(L.toApiShape(r).type) && Effects.scriptKinds(r.name).some(k => /end|standby|phase/i.test(k))) n++;
    assert.ok(n > 0);
});

test("Necroshade in the GY lets a Level 5+ Elemental HERO be Normal Summoned without Tributes, once", () => {
    const d = makeDuel({ p1: { hand: ["Elemental HERO Flame Wingman"], graveyard: ["Elemental HERO Necroshade"] } });
    const hero = d.hand(d.p1, "Elemental HERO Flame Wingman") || d.find(d.p1, "Elemental HERO Flame Wingman", "hand");
    assert.equal(d.game.getRequiredTributesForSummon(d.p1, hero).required, 0);
});

test("Cyber Dragon is Special Summoned from hand only when just the opponent controls a monster", () => {
    const d = makeDuel({ p1: { hand: ["Cyber Dragon"] }, p2: { monsters: ["Summoned Skull"] } });
    const cd = d.find(d.p1, "Cyber Dragon", "hand");
    assert.equal(d.game.activateHandEffect(cd), true);
    assert.ok(d.find(d.p1, "Cyber Dragon", "monster"));
    const d2 = makeDuel({ p1: { hand: ["Cyber Dragon"] } });
    assert.equal(d2.game.activateHandEffect(d2.find(d2.p1, "Cyber Dragon", "hand")), false);
});

test("compiled passive sentences: summon restrictions and stat auras", () => {
    const E = require("../Effects");
    assert.equal(E.cannotBeNormalSummoned("Vennominaga the Deity of Poisonous Snakes"), true);
    assert.ok(E.scriptKinds("Gaia Power").includes("continuous"));
});
