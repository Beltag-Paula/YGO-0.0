"use strict";
// Bugs reported while playtesting the shipped decks (Jaden / Joey): each one stays fixed.
process.env.YGO_QUIET = "1";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel, Effects } = require("./harness");
const L = require("../scripts/_lib");

const answerAll = d => { for (let i = 0; i < 12 && d.game.choice; i++) { const c = d.game.choice; if (c.option) d.game.resolveOption(c.options[0].id); else d.game.resolveChoice(c.candidates.slice(0, c.min).map(x => x.instanceId)); } };

test("O - Oversoul can target and revive an Elemental HERO Normal Monster from the GY", () => {
    const d = makeDuel({ p1: { hand: ["O - Oversoul"], graveyard: ["Elemental HERO Avian", "Summoned Skull"] } });
    const t = Effects.getMeta("O - Oversoul").targets(d.game, d.hand(d.p1, "O - Oversoul")).map(c => c.card.name);
    assert.deepEqual(t, ["Elemental HERO Avian"], "only the HERO Normal Monster is a legal target");
    assert.ok(d.use("O - Oversoul", d.find(d.p1, "Elemental HERO Avian", "graveyard"))); answerAll(d);
    assert.ok(d.mon(d.p1, "Elemental HERO Avian"));
});

test("Spark Blaster: once equipped to Sparkman it offers its own Main Phase effect (3 uses, then destroyed)", () => {
    const DuelSession = require("../DuelSession");
    const s = new DuelSession({ playerDeckId: "deck_1792783183115", botDeckId: "yugi", first: "you", playerName: "T" });
    s.advance(); const g = s.game, h = s.human;
    const grab = (n, to) => { const c = [...h.zone.hand, ...h.zone.deck].find(x => x.card.name === n); h.moveCard(c, c.location, to); return c; };
    const sp = grab("Elemental HERO Sparkman", "monster"); sp.faceUp = true; sp.position = "attack";
    const sb = grab("Spark Blaster", "hand");
    assert.ok(s.act("spell", { uid: s.uidOf(sb), target: s.uidOf(sp) }).ok); answerAll({ game: g });
    assert.ok(s._actions(sb, "spellTrap").effect, "the face-up Spell shows an 'Activate Effect' command");
    assert.ok(s.act("monsterEffect", { uid: s.uidOf(sb) }).ok); answerAll({ game: g });
    assert.equal(sp.position, "defense", "the target changed battle position");
});

test("Hero Mask renames the target (usable as that card for Polymerization) and sends the chosen HERO", () => {
    const d = makeDuel({ p1: { hand: ["Hero Mask", "Polymerization", "Elemental HERO Burstinatrix"], monsters: ["Elemental HERO Sparkman"], deck: ["Elemental HERO Avian"], extra: ["Elemental HERO Flame Wingman"] } });
    const sp = d.mon(d.p1, "Elemental HERO Sparkman");
    assert.ok(d.use("Hero Mask", sp)); answerAll(d);
    assert.equal(sp.card.name, "Elemental HERO Avian");
    assert.ok(d.find(d.p1, "Elemental HERO Avian", "graveyard"));
    assert.ok(d.activate("Polymerization", d.p1.zone.extraDeck[0])); answerAll(d);
    assert.ok(d.mon(d.p1, "Elemental HERO Flame Wingman"));
});

test("Hero Mask: the original name comes back at the End Phase", () => {
    const d = makeDuel({ p1: { hand: ["Hero Mask"], monsters: ["Elemental HERO Sparkman"], deck: ["Elemental HERO Avian"] } });
    const sp = d.mon(d.p1, "Elemental HERO Sparkman");
    d.use("Hero Mask", sp); answerAll(d);
    assert.equal(sp.card.name, "Elemental HERO Avian");
    d.game.turnEffects.forEach(fn => fn());
    assert.equal(sp.card.name, "Elemental HERO Sparkman");
});

for (const [call, flip, zeroed] of [["heads", "heads", true], ["tails", "heads", false]]) {
    test(`Fairy Box: call ${call}, coin ${flip} → attacker ${zeroed ? "ATK 0, no damage" : "keeps attacking"}; stays face-up and tosses again on the next attack`, () => {
        const d = makeDuel({ p1: { monsters: ["Blue-Eyes White Dragon", "Summoned Skull"] }, p2: { spellTrap: [{ name: "Fairy Box", faceUp: false }] } });
        const real = L.coin; L.coin = () => flip === "heads";
        try {
            const g = d.game; g.phase = "battle";
            const be = d.mon(d.p1, "Blue-Eyes White Dragon"), sk = d.mon(d.p1, "Summoned Skull"), fb = d.st(d.p2, "Fairy Box");
            g.declareAttack(be, null);
            g.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: fb } });
            assert.ok(g.choice && g.choice.option, "the owner is asked to call heads or tails");
            g.resolveOption(call);
            assert.equal(d.p2.lifePoints, zeroed ? 8000 : 5000);
            assert.ok(fb.faceUp && fb.location === "spellTrap", "Continuous Trap stays on the field");
            g.declareAttack(sk, null);
            assert.ok(g.choice && g.choice.option, "the next attack triggers another coin call");
        } finally { L.coin = real; }
    });
}

test("Bubbleman draws 2 when it is the only card; otherwise the log says why not", () => {
    let d = makeDuel({ p1: { hand: ["Elemental HERO Bubbleman"], deck: ["Kuriboh", "Kuriboh", "Kuriboh"] } });
    assert.ok(d.game.activateHandEffect(d.hand(d.p1, "Elemental HERO Bubbleman")));
    assert.ok(d.game.choice && d.game.choice.option, "asks whether to draw");
    d.game.resolveOption("yes"); assert.equal(d.p1.zone.hand.length, 2);
    d = makeDuel({ p1: { hand: ["Elemental HERO Bubbleman"], monsters: ["Kuriboh"], deck: ["Kuriboh", "Kuriboh"] } });
    d.game.activateHandEffect(d.hand(d.p1, "Elemental HERO Bubbleman"));
    assert.ok(d.game.log.some(x => /no draw/.test(x)), "explains why the draw did not happen");
    assert.ok(!d.game.choice);
});

test("AI attacks a Set monster about half the time (it must not 'see' the hidden DEF)", () => {
    const AI = require("../AIController");
    let hit = 0; const N = 160;
    for (let i = 0; i < N; i++) {
        const d = makeDuel({ p1: { monsters: ["Gaia The Fierce Knight"] }, p2: { monsters: [{ name: "Blue-Eyes White Dragon", faceUp: false, pos: "defense" }] } });
        d.game.phase = "battle"; const b = d.game.log.length; AI.step(d.game);
        if (d.game.log.slice(b).some(x => /declares an attack/.test(x))) hit++;
    }
    assert.ok(hit > N * 0.25 && hit < N * 0.75, `attacked ${hit}/${N}`);
});
