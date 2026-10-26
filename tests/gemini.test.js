"use strict";
process.env.YGO_QUIET = "1";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel, Effects } = require("./harness");

test("Gemini: a Normal Monster (effect off) until it is Gemini Summoned with the Normal Summon", () => {
    const d = makeDuel({ p1: { monsters: ["King Pyron"] } });
    const g = d.game, kp = d.mon(d.p1, "King Pyron"); g.phase = "m1";
    Effects.geminiOnSummoned(kp); d.p1.normalSummonedThisTurn = true;      // it was just Normal Summoned
    assert.ok(kp.modifiers.effectsNegated, "no effect while it is a Normal Monster");
    assert.equal(g.canGeminiSummon(kp), false, "the Normal Summon was just used");
    // a fresh turn: the Normal Summon is available again
    d.p1.normalSummonedThisTurn = false; g.phase = "m1";
    assert.equal(g.canGeminiSummon(kp), true);
    const ign = Effects.getIgnition("King Pyron");
    assert.equal(!!(kp.modifiers.effectsNegated), true);
    assert.ok(g.geminiSummon(kp));
    assert.equal(kp.modifiers.effectsNegated, false);
    assert.ok(ign.canActivate(g, kp), "its ignition effect works now");
    const before = d.p2.lifePoints; ign.activate(g, kp);
    assert.equal(d.p2.lifePoints, before - 1000);
    assert.equal(d.p1.normalSummonedThisTurn, true, "the Gemini Summon used the Normal Summon");
});

test("Goggle Golem: original ATK becomes 2100 once Gemini Summoned; Gemini Lancer pierces", () => {
    const d = makeDuel({ p1: { monsters: ["Goggle Golem"] } });
    const gg = d.mon(d.p1, "Goggle Golem"); Effects.geminiOnSummoned(gg);
    assert.equal(d.game.getAtk(gg), 1500);
    d.p1.normalSummonedThisTurn = false; d.game.phase = "m1";
    assert.ok(d.game.geminiSummon(gg));
    assert.equal(d.game.getAtk(gg), 2100);
    assert.ok(Effects.isGemini("Gemini Lancer") && Effects.hasPiercing("Gemini Lancer"));
});
