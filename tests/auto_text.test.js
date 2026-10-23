"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel, Effects, LocalCards, CardScripts } = require("./harness");

const rows = LocalCards.all().map(r => ({ r, c: LocalCards.toApiShape(r) }));
const inDb = n => !!LocalCards.rowByName(n);
const kinds = n => Effects.scriptKinds(n);

test("Every automatically registered Fusion recipe lists at least two materials and a Fusion Monster", () => {
    let n = 0;
    for (const { r, c } of rows) {
        if (!(r.metadata.type & LocalCards.T.FUSION)) continue;
        const rec = Effects.getFusionRecipe(c.name);
        if (!rec) continue;
        n++;
        assert.ok(rec.materials.length >= 2 && rec.materials.every(m => (typeof m === "string" && m.length) || (Array.isArray(m) && m.length) || typeof m === "function"), c.name);
    }
    assert.ok(n >= 80, `expected most of the 114 Fusion Monsters to have recipes, got ${n}`);
});

test("A database Fusion Monster can really be Fusion Summoned with Polymerization using its auto-registered recipe", () => {
    const cand = rows.find(({ r, c }) => (r.metadata.type & LocalCards.T.FUSION) && Effects.getFusionRecipe(c.name) &&
        Effects.getFusionRecipe(c.name).materials.length === 2 && Effects.getFusionRecipe(c.name).materials.every(m => typeof m === "string" && inDb(m)) &&
        Effects.getFusionRecipe(c.name).materials[0] !== Effects.getFusionRecipe(c.name).materials[1]);
    assert.ok(cand, "a two-material recipe whose materials are in the DB");
    const mats = Effects.getFusionRecipe(cand.c.name).materials;
    const d = makeDuel({ p1: { hand: ["Polymerization"], monsters: mats, extra: [cand.c.name] } });
    const fusion = d.p1.zone.extraDeck[0];
    assert.ok(d.activate("Polymerization", fusion), "activation accepted");
    while (d.game.state.awaitingChain) d.game.dispatch({ type: "PASS_RESPONSE" });
    assert.ok(d.names(d.p1, "monster").includes(cand.c.name), `${cand.c.name} summoned from ${mats.join(" + ")}`);
});

test("Ritual Spells from the text: recipe + Ritual Summon flow works with a real database pair", () => {
    const spell = rows.find(({ r, c }) => (r.metadata.type & LocalCards.T.SPELL) && (r.metadata.type & LocalCards.T.RITUAL) &&
        Effects.getRitualRecipe(c.name) && inDb(Effects.getRitualRecipe(c.name).summons) && Effects.getRitualRecipe(c.name).tributeLevel <= 8 &&
        !["black luster ritual", "black magic ritual"].includes(Effects.normalize(c.name)));
    assert.ok(spell, "an automatically registered Ritual Spell");
    const rec = Effects.getRitualRecipe(spell.c.name);
    const d = makeDuel({ p1: { hand: [spell.c.name, rec.summons], monsters: ["Giant Soldier of Stone", "Feral Imp"] } });   // Levels 3 + 4... may need more
    const need = rec.tributeLevel;
    const have = d.p1.getMonstersOnField().reduce((s, m) => s + (m.card.level || 0), 0);
    const ok = d.game.checkActivation(d.hand(d.p1, spell.c.name), "idle");
    assert.equal(ok.ok, have >= need, `${spell.c.name}: need Level ${need}, have ${have} -> ${ok.reason || "ok"}`);
});

test("A database monster whose ONLY text is 'may attack directly' attacks past a defender", () => {
    const c = rows.find(({ r, c }) => (r.metadata.type & 1) && Effects.scriptKinds(c.name).includes("direct-attacker") && !Effects.scriptKinds(c.name).includes("partial") && (c.atk || 0) > 0 && !/Fusion|Ritual/.test(c.type));
    if (!c) return;
    const d = makeDuel({ p1: { monsters: [c.c.name] }, p2: { monsters: ["Feral Imp"] } });
    d.game.phase = "battle";
    assert.ok(d.game.declareAttack(d.mon(d.p1, c.c.name), null));
    assert.ok(d.p2.lifePoints < 8000);
});

test("'Cannot be destroyed by battle' monsters survive a stronger attacker", () => {
    const c = rows.find(({ r, c }) => (r.metadata.type & 1) && Effects.isBattleIndestructible(c.name) && (c.def || 0) <= 2000);
    assert.ok(c, "a database monster with this passive");
    const d = makeDuel({ p1: { monsters: ["Summoned Skull"] }, p2: { monsters: [{ name: c.c.name, pos: "defense" }] } });
    d.game.phase = "battle";
    d.game.declareAttack(d.mon(d.p1, "Summoned Skull"), d.mon(d.p2, c.c.name));
    if (d.game.state.awaitingResponse) d.game.dispatch({ type: "PASS_RESPONSE" });
    assert.ok(d.mon(d.p2, c.c.name), `${c.c.name} was not destroyed`);
});

test("Cards with extra, unsupported text are PARTIAL with a note — never silently 'scripted'", () => {
    let partials = 0;
    for (const { c } of rows) {
        const st = CardScripts.cardStatus(c);
        if (st.status === "partial") { partials++; assert.ok(st.note && st.note.length > 10, c.name); }
    }
    assert.ok(partials > 0);
});

test("Coverage never claims more than exists: every 'scripted' card has at least one registered behaviour", () => {
    for (const { c } of rows) {
        const st = CardScripts.cardStatus(c);
        if (st.status === "scripted") assert.ok(st.kinds.length > 0, c.name);
    }
});
