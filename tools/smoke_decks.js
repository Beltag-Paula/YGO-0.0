#!/usr/bin/env node
/**
 * tools/smoke_decks.js — exercises EVERY distinct card of the decks in deck_inventory/ in a prepared board
 * (summon / set+flip / ignition / quick / hand effect / Spell+Trap activation / GY trigger / phase triggers /
 * attack) and reports:
 *   CRASH   an exception was thrown
 *   BADLOG  the game log contains "undefined" / "NaN" / "[object"
 *   INERT   no scenario could ever use the card's script (condition never met) — worth a look
 * Usage: node tools/smoke_decks.js [deckId|all] [--verbose]
 */
"use strict";
const path = require("path");
const { makeDuel, Effects } = require("../tests/harness");
const L = require("../scripts/_lib");
const D = require("../DeckInventory");
const CS = require("../CardScripts");

const arg = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "all";
const verbose = process.argv.includes("--verbose");
const ids = arg === "all" ? D.list().map(d => d.id) : [arg];
const cards = new Map();
for (const id of ids) { const dk = D.readDeck(id); if (!dk) continue; for (const c of [...dk.mainDeck, ...dk.extraDeck]) if (!cards.has(c.name)) cards.set(c.name, { c, decks: new Set() }), cards.get(c.name).decks.add(id); else cards.get(c.name).decks.add(id); }

const BOARD = {
    p1: { monsters: ["Beaver Warrior", "Feral Imp", "Mystical Elf"], graveyard: ["Summoned Skull", "Dark Magician Girl", "Polymerization"], deck: ["Gaia The Fierce Knight", "Curse of Dragon"], lp: 6000 },
    p2: { monsters: ["Blue-Eyes White Dragon", { name: "Man-Eater Bug", faceUp: false }], spellTrap: [{ name: "Mirror Force", faceUp: false }, { name: "Dark Hole", faceUp: false }], graveyard: ["Red-Eyes Black Dragon"], lp: 8000 }
};
const settle = d => { for (let i = 0; i < 12 && d.game.choice; i++) { try { d.choose("first"); } catch (e) { break; } } for (let i = 0; i < 6 && d.game.state.awaitingResponse; i++) { try { d.game.resolveBattleDamage(); } catch (e) { break; } } };
const RICH = {
    p1: { monsters: ["Beaver Warrior", "Feral Imp", "Mystical Elf", "Gaia The Fierce Knight", "Curse of Dragon"], spellTrap: [{ name: "Mirror Force", faceUp: true }], graveyard: ["Summoned Skull", "Dark Magician Girl", "Polymerization", "Dark Hole", "Mystical Space Typhoon", "Crystal Beast Topaz Tiger", "Elemental HERO Avian"], deck: ["Gaia The Fierce Knight", "Harpie Lady", "Crystal Beast Amber Mammoth", "Elemental HERO Sparkman"], hand: ["Kuriboh", "Feral Imp", "Dark Magician", "Blue-Eyes White Dragon"], lp: 6000 },
    p2: { monsters: ["Blue-Eyes White Dragon", "Summoned Skull", "Red-Eyes Black Dragon"], spellTrap: [{ name: "Mirror Force", faceUp: true }, { name: "Dark Hole", faceUp: false }, { name: "Mystical Space Typhoon", faceUp: false }], graveyard: ["Red-Eyes Black Dragon", "Monster Reborn"], lp: 8000 }
};
const spec = (name, where, extra = {}) => {
    const b = JSON.parse(JSON.stringify(extra.rich ? RICH : BOARD));
    b.p1.hand = [...(b.p1.hand || [])]; b.p1.spellTrap = b.p1.spellTrap || [];
    b.p1.extra = extra.extra || [];
    if (where === "hand") b.p1.hand = [name, ...(extra.rich ? b.p1.hand : [])];
    if (where === "field") b.p1.monsters = [name, ...b.p1.monsters.slice(0, 2)];
    if (where === "facedown") b.p1.monsters = [{ name, faceUp: false }, ...b.p1.monsters.slice(0, 2)];
    if (where === "st") b.p1.spellTrap = [{ name, faceUp: true }];
    if (where === "custom") return b;
    if (where === "gy") b.p1.graveyard = [name, ...b.p1.graveyard.slice(0, 2)];
    return b;
};

// deterministic RNG so reruns are comparable
let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pickN = (arr, n) => { const a = arr.slice(); const out = []; while (a.length && out.length < n) out.push(a.splice(Math.floor(rnd() * a.length), 1)[0]); return out; };
/** A board built from the card's OWN deck(s): the way the card is meant to be played. */
function deckBoard(name, decks) {
    const dk = D.readDeck([...decks][0]);
    const mons = [...new Set(dk.mainDeck.filter(x => /Monster/.test(x.type) && x.name !== name).map(x => x.name))];
    const sts = [...new Set(dk.mainDeck.filter(x => !/Monster/.test(x.type) && x.name !== name).map(x => x.name))];
    const fus = [...new Set(dk.extraDeck.map(x => x.name))];
    const b = JSON.parse(JSON.stringify(RICH));
    b.p1.hand = [name, ...pickN(mons, 3), ...pickN(sts, 2)];
    b.p1.monsters = pickN(mons.filter(n => !b.p1.hand.includes(n)), 2);
    b.p1.graveyard = pickN(mons, 3);
    b.p1.deck = pickN(mons.concat(sts), 5);
    b.p1.extra = fus;
    b.p2.monsters = pickN(["Blue-Eyes White Dragon", "Summoned Skull", "Red-Eyes Black Dragon", "Man-Eater Bug"], 2);
    return b;
}
const results = [];
for (const [name, { c, decks }] of cards) {
    const kinds = Effects.scriptKinds(name);
    const isMon = /Monster/.test(c.type), isSp = /Spell/.test(c.type), isTr = /Trap/.test(c.type);
    const used = new Set(), problems = [];
    let rich = false;
    const run = (label, where, fn) => {
        let d;
        try {
            d = makeDuel(spec(name, where, { extra: /Fusion|Synchro/.test(c.type) ? [name] : [], rich }));
            const before = d.game.log.length;
            const r = fn(d);
            settle(d);
            const out = d.game.log.slice(before).join(" | ");
            if (/undefined|NaN|\[object/.test(out)) problems.push(`BADLOG(${label}): ${out.match(/.{0,50}(undefined|NaN|\[object).{0,50}/)[0]}`);
            if (r) used.add(label);
        } catch (e) { problems.push(`CRASH(${label}): ${String(e.stack || e).split("\n").slice(0, 2).join(" ")}`); }
    };
    try {
        if (isMon) {
            run("normal-summon", "hand", d => { const gc = d.hand(d.p1, name); if (!gc) return false; const lv = c.level || 4; const t = lv >= 7 ? [0, 1] : lv >= 5 ? [0] : []; const ok = d.game.normalSummon(gc, t); return ok !== false && gc.location === "monster"; });
            run("set+flip", "hand", d => { const gc = d.hand(d.p1, name); if (!gc) return false; const lv = c.level || 4; d.game.setMonster(gc, lv >= 7 ? [0, 1] : lv >= 5 ? [0] : []); if (gc.location !== "monster") return false; Effects.triggerFlip(d.game, gc); return !!Effects.getFlipEffect(name); });
            run("ignition", "field", d => { const gc = d.mon(d.p1, name); const eff = Effects.getIgnition(name); if (!gc || !eff) return false; gc.state.hasBeenSummonedThisTurn = false; if (!eff.canActivate(d.game, gc)) return false; let tg = null; if (eff.needsTarget && eff.targets) tg = eff.targets(d.game, gc)[0] || null; eff.activate(d.game, gc, tg); return true; });
            run("hand-effect", "hand", d => { const gc = d.hand(d.p1, name); if (!gc || !Effects.getHandIgnition(name)) return false; return d.game.activateHandEffect(gc) !== false; });
            run("quick", "field", d => { const gc = d.mon(d.p1, name); const q = Effects.getQuickEffect && Effects.getQuickEffect(name); if (!gc || !q) return false; if (!q.canActivate(d.game, gc)) return false; q.resolve(d.game, gc); return true; });
            run("destroyed->gy", "field", d => { const gc = d.mon(d.p1, name); if (!gc) return false; gc._destroyedByBattle = true; L.destroy(d.game, gc); if (Effects.triggerGYEffect) Effects.triggerGYEffect(d.game, gc); return !!kinds.some(k => /grave|gy/.test(k)); });
            run("phase-triggers", "field", d => { const gc = d.mon(d.p1, name); if (!gc) return false; Effects.runPhaseTriggers(d.game, "standby", d.p1); Effects.runPhaseTriggers(d.game, "end", d.p1); return kinds.some(k => /standby|end/.test(k)); });
            run("attack", "field", d => { const gc = d.mon(d.p1, name); if (!gc) return false; d.game.phase = "battle"; gc.state.hasBeenSummonedThisTurn = false; const t = d.p2.zone.monster.find(Boolean); d.game.declareAttack(gc, t); return true; });
            run("being-attacked", "field", d => { const gc = d.mon(d.p1, name); if (!gc) return false; d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; const a = d.mon(d.p2, "Blue-Eyes White Dragon"); d.game.phase = "battle"; if (a) d.game.declareAttack(a, gc); return true; });
        } else {
            for (rich of [false, true]) {
            run("activate", "hand", d => { const ok = d.use(name, null); return ok !== false; });
            run("activate+target", "hand", d => { const gc = d.hand(d.p1, name); if (!gc) return false; const m = Effects.getMeta(name) || {}; let tg = null; if (m.needsTarget === "custom" && m.targets) tg = m.targets(d.game, gc)[0] || null; else tg = d.mon(d.p1, "Beaver Warrior") || null; const ok = d.use(name, tg); return ok !== false; });
            run("set-trap-vs-attack", "st", d => { if (!isTr) return false; const gc = d.st(d.p1, name); if (!gc) return false; gc.faceUp = false; gc.turnSet = 0; d.game.currentPlayer = d.p2; d.game.opponentPlayer = d.p1; d.game.phase = "battle"; const a = d.mon(d.p2, "Blue-Eyes White Dragon"); const t = d.mon(d.p1, "Beaver Warrior"); d.game.declareAttack(a, t); return true; });
            run("continuous-on-field", "st", d => { const gc = d.st(d.p1, name); if (!gc) return false; Effects.runStateChecks(d.game); Effects.runPhaseTriggers(d.game, "standby", d.p1); Effects.runPhaseTriggers(d.game, "end", d.p1); return !!kinds.some(k => /continuous|state|standby|end|passive/.test(k)); });
            }
            rich = false;
            for (let k = 0; k < 14 && !used.has("activate"); k++) {
                try {
                    const d = makeDuel(deckBoard(name, decks));
                    const gc = d.hand(d.p1, name); if (!gc) continue;
                    const m = Effects.getMeta(name) || {}; let tg = null;
                    if (m.needsTarget === "custom" && m.targets) tg = m.targets(d.game, gc)[0] || null;
                    const before = d.game.log.length;
                    const ok = d.use(name, tg); settle(d);
                    const out = d.game.log.slice(before).join(" | ");
                    if (/undefined|NaN|\[object/.test(out)) problems.push("BADLOG(deck-board): " + out.match(/.{0,50}(undefined|NaN|\[object).{0,50}/)[0]);
                    if (ok !== false) used.add("activate");
                } catch (e) { problems.push("CRASH(deck-board): " + String(e.stack || e).split("\n").slice(0, 2).join(" ")); }
            }
            run("gy-effect", "gy", d => { const gc = d.find(d.p1, name, "graveyard"); if (!gc) return false; Effects.runPhaseTriggers(d.game, "end", d.p1); return kinds.some(k => /grave/.test(k)); });
        }
    } catch (e) { problems.push(`CRASH(harness): ${e.message}`); }
    const st = CS.cardStatus(c).status;
    const inert = !used.size && st !== "vanilla" && !problems.length;
    results.push({ name, st, problems, inert, used: [...used] });
}

const crash = results.filter(r => r.problems.length), inert = results.filter(r => r.inert && r.st !== "stub");
console.log(`Cards tested: ${results.length}   with problems: ${crash.length}   never-triggered (needs a look): ${inert.length}`);
crash.forEach(r => { console.log(`\n✖ ${r.name} [${r.st}]`); [...new Set(r.problems)].slice(0, 4).forEach(p => console.log("   " + p.slice(0, 220))); });
if (verbose || inert.length) { console.log("\nNever exercised by any scenario (condition not met in the test board — not necessarily a bug):"); console.log("  " + inert.map(r => r.name).join(" · ")); }
process.exit(crash.length ? 1 : 0);
