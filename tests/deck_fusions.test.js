"use strict";
// Every Fusion Monster in a shipped deck must really be Fusion Summonable with Polymerization from its listed materials.
const test = require("node:test");
const assert = require("node:assert/strict");
const { makeDuel, Effects } = require("./harness");
const D = require("../DeckInventory");

const fusions = new Map();
for (const d of D.list()) { const dk = D.readDeck(d.id); for (const c of dk.extraDeck || []) if (/Fusion/.test(c.type) && !fusions.has(c.name)) fusions.set(c.name, c); }

for (const [name] of fusions) {
    const recipe = Effects.getFusionRecipe(name);
    if (!recipe || recipe.method !== "polymerization" || recipe.materials.length > 4) continue;   // 7-material / banish-method monsters have their own tests
    test(`Polymerization Fusion Summons ${name} from ${recipe.materials.join(" + ")}`, () => {
        const d = makeDuel({ p1: { hand: ["Polymerization", ...recipe.materials], extra: [name] } });
        assert.ok(d.activate("Polymerization", d.p1.zone.extraDeck[0]), "activation accepted");
        for (let i = 0; i < 8 && d.game.choice; i++) d.choose("first");
        assert.ok(d.mon(d.p1, name), `${name} is on the field`);
    });
}
