/**
 * tests/fuzz.js — headless duel fuzzer.
 *
 *   node tests/fuzz.js [games=200] [seedStart=1] [mode=mixed|ai|chaos]
 *
 * Plays many full duels with no browser. One side (or both) is driven by
 * either the real AIController or a "chaos" agent that fires random,
 * frequently ILLEGAL actions at the engine. After every single step it
 * checks structural invariants (no card lost/duplicated, zone bookkeeping
 * is consistent, no NaN stats, no leaked modifiers on cards that left the
 * field, response windows are well-formed) and reports the first few
 * violations / exceptions / stuck duels it finds, grouped by message.
 */
"use strict";
const path = require("path");
const ROOT = path.join(__dirname, "..");
const Player = require(path.join(ROOT, "Player"));
const MainGame = require(path.join(ROOT, "MainGame"));
const AIController = require(path.join(ROOT, "AIController"));
const Effects = require(path.join(ROOT, "Effects"));

const GAMES = parseInt(process.argv[2] || "200", 10);
const SEED0 = parseInt(process.argv[3] || "1", 10);
const MODE = process.argv[4] || "mixed";

// ---- deterministic RNG so every failure is reproducible by seed ----
let _s = 1;
function seed(n) { _s = n >>> 0 || 1; }
function rnd() { _s ^= _s << 13; _s >>>= 0; _s ^= _s >> 17; _s ^= _s << 5; _s >>>= 0; return (_s >>> 0) / 4294967296; }
const _origRandom = Math.random;
function pick(a) { return a.length ? a[Math.floor(rnd() * a.length)] : undefined; }

const problems = new Map(); // key -> {count, example}
function report(kind, msg, ctx) {
    const key = kind + " :: " + msg.replace(/\d+/g, "#");
    const e = problems.get(key) || { count: 0, example: null };
    e.count++;
    if (!e.example) e.example = ctx;
    problems.set(key, e);
}

function allCards(p) {
    const z = p.zone;
    const out = [];
    for (const k of ["hand", "deck", "extraDeck", "sideDeck", "graveyard", "banished"]) z[k].forEach(c => out.push({ c, zone: k }));
    z.monster.forEach((c, i) => c && out.push({ c, zone: "monster", i }));
    z.spellTrap.forEach((c, i) => c && out.push({ c, zone: "spellTrap", i }));
    if (z.field) out.push({ c: z.field, zone: "field" });
    z.monster.forEach(c => { if (c && c.equippedUnion) out.push({ c: c.equippedUnion, zone: "equipped" }); });
    return out;
}

function checkInvariants(game, ctx) {
    const seen = new Map();
    for (const p of [game.player1, game.player2]) {
        if (!(p.lifePoints >= 0)) report("INV", "LP negative/NaN: " + p.lifePoints, ctx);
        for (const { c, zone, i } of allCards(p)) {
            const id = c.instanceId;
            if (c.isToken) {
                if (zone !== "monster") report("INV", `token ${c.card.name} found in zone ${zone}`, ctx);
                continue;
            }
            if (seen.has(id)) report("INV", `card duplicated: ${c.card.name} in ${seen.get(id)} and ${p.name}.${zone}`, ctx);
            seen.set(id, `${p.name}.${zone}`);
            if (c.location !== zone) report("INV", `location mismatch: ${c.card.name} says '${c.location}' but sits in ${zone}`, ctx);
            if ((zone === "monster" || zone === "spellTrap") && c.zoneIndex !== i) report("INV", `zoneIndex mismatch on ${c.card.name}: ${c.zoneIndex} vs ${i}`, ctx);
            if (zone === "monster" && c.owner !== p) report("INV", `controller mismatch: ${c.card.name} in ${p.name}'s monster zone but owner=${c.owner && c.owner.name}`, ctx);
            const offField = zone === "hand" || zone === "deck" || zone === "graveyard" || zone === "banished" || zone === "extraDeck";
            if (offField) {
                const m = c.modifiers;
                if (m.atk || m.def || m.cannotAttack || m.cannotChangePosition || m.effectsNegated) {
                    report("INV", `LEAKED MODIFIERS on ${c.card.name} in ${zone}: atk${m.atk} def${m.def} noAtk=${m.cannotAttack} noPos=${m.cannotChangePosition} negated=${m.effectsNegated}`, ctx);
                }
                if (c.hasSpellCounter) report("INV", `stale Spell Counter on ${c.card.name} in ${zone}`, ctx);
                if (c.equippedTo || c.linkedTarget) report("INV", `stale equip/link on ${c.card.name} in ${zone}`, ctx);
            }
            if (zone === "monster") {
                const a = game.getAtk(c), d = game.getDef(c);
                if (!Number.isFinite(a) || !Number.isFinite(d)) report("INV", `non-finite ATK/DEF on ${c.card.name}`, ctx);
                if (!c.position) report("INV", `monster ${c.card.name} on field with no position`, ctx);
            }
            if (zone === "spellTrap" && c.equippedTo && !game.findMonsterAnywhereOnField(c.equippedTo)) {
                report("INV", `equip ${c.card.name} still on field but its host is gone`, ctx);
            }
        }
    }
    const s = game.state;
    if (s.awaitingResponse && !(game.battleResponse && game.pendingAttack)) report("INV", "awaitingResponse without battleResponse/pendingAttack", ctx);
    if (s.awaitingSummonResponse && !game.summonResponse) report("INV", "awaitingSummonResponse without summonResponse", ctx);
    if (s.awaitingResponse && s.awaitingSummonResponse) report("INV", "both response windows open at once", ctx);
}

// ---------- the "chaos" agent: random (often illegal) actions ----------
function chaosStep(game, me) {
    const opp = me === game.player1 ? game.player2 : game.player1;
    // Response windows first
    if (game.state.awaitingResponse) {
        const opts = game.getEligibleResponses(me);
        const hand = game.getEligibleHandResponses(me);
        const r = rnd();
        if (r < 0.35 && hand.length) return game.dispatch({ type: "ACTIVATE_HAND_CARD", payload: { card: pick(hand) } });
        if (r < 0.75 && opts.length) {
            const c = pick(opts);
            return game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: c, targetInstanceId: randomTargetId(game, me, opp, Effects.getMeta(c.card.name)) } });
        }
        return game.dispatch({ type: "PASS_RESPONSE" });
    }
    if (game.state.awaitingSummonResponse) {
        const opts = game.getEligibleSummonResponses(me);
        if (rnd() < 0.7 && opts.length) {
            const c = pick(opts);
            return game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: c, targetInstanceId: randomTargetId(game, me, opp, Effects.getMeta(c.card.name)) } });
        }
        return game.dispatch({ type: "PASS_RESPONSE" });
    }
    const ph = game.phase;
    const r = rnd();
    if (ph === "m1" || ph === "m2") {
        if (r < 0.10) return game.dispatch({ type: "PASS" });
        const kind = pick(["summon", "set", "spell", "setst", "pos", "ign", "setact", "union", "fusion"]);
        const hand = me.zone.hand;
        const mons = me.getMonstersOnField();
        const sts = me.getSpellTrapsOnField();
        if (kind === "summon" || kind === "set") {
            const c = pick(hand.filter(x => game.isMonster(x)));
            if (!c) return game.dispatch({ type: "PASS" });
            const need = game.getRequiredTributesForSummon(me, c).required;
            const idxs = shuffle(me.zone.monster.map((m, i) => m ? i : null).filter(v => v !== null)).slice(0, need + (rnd() < 0.1 ? 1 : 0));
            return game.dispatch({ type: kind === "summon" ? "NORMAL_SUMMON" : "SET_MONSTER", payload: { card: c, tributeIndices: idxs } });
        }
        if (kind === "spell") {
            const c = pick(hand.filter(x => game.isSpellOrTrap(x)));
            if (!c) return;
            return game.dispatch({ type: "ACTIVATE_SPELL", payload: { card: c, targetInstanceId: randomTargetId(game, me, opp, Effects.getMeta(c.card.name)) } });
        }
        if (kind === "setst") {
            const c = pick(hand.filter(x => game.isSpellOrTrap(x)));
            if (!c) return;
            return game.dispatch({ type: "SET_SPELL_TRAP", payload: { card: c } });
        }
        if (kind === "pos") { const c = pick(mons); if (c) return game.dispatch({ type: "CHANGE_POSITION", payload: { card: c } }); return; }
        if (kind === "ign") { const c = pick(mons); if (c) return game.dispatch({ type: "ACTIVATE_MONSTER_EFFECT", payload: { card: c, targetInstanceId: randomAnyMonsterId(game) } }); return; }
        if (kind === "setact") {
            const c = pick(sts);
            if (!c) return;
            return game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: c, targetInstanceId: randomTargetId(game, me, opp, Effects.getMeta(c.card.name)) } });
        }
        if (kind === "union") { const c = pick(mons); if (c) return game.dispatch({ type: "UNEQUIP_UNION", payload: { host: c } }); return; }
        if (kind === "fusion") return;
        return;
    }
    if (ph === "battle") {
        if (r < 0.15) return game.dispatch({ type: "PASS" });
        const mons = me.getMonstersOnField();
        const a = pick(mons);
        if (!a) return game.dispatch({ type: "PASS" });
        const defs = opp.getMonstersOnField();
        const t = rnd() < 0.85 ? pick(defs) || null : null;
        return game.dispatch({ type: "ATTACK", payload: { attacker: a, target: t } });
    }
    return game.dispatch({ type: "PASS" });
}
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function randomAnyMonsterId(game) { const all = [...game.player1.getMonstersOnField(), ...game.player2.getMonstersOnField()]; const c = pick(all); return c ? c.instanceId : null; }
function randomTargetId(game, me, opp, meta) {
    if (!meta || !meta.needsTarget) return null;
    if (meta.needsTarget === "monster") return randomAnyMonsterId(game);
    if (meta.needsTarget === "spellTrap") { const all = [...me.getSpellTrapsOnField(), ...opp.getSpellTrapsOnField()]; const c = pick(all); return c ? c.instanceId : null; }
    if (meta.needsTarget === "graveyardMonster") { const all = [...me.zone.graveyard, ...opp.zone.graveyard].filter(x => game.isMonster(x)); const c = pick(all); return c ? c.instanceId : null; }
    if (meta.needsTarget === "fusionMonster") { const c = pick(me.zone.extraDeck); return c ? c.instanceId : null; }
    return null;
}

// Polymerization/fusion is only reachable via a targeted Spell; also poke the
// direct fusion helper occasionally so it gets exercised even if the random
// agent never lines it up.
function drive(game, agents, ctx) {
    let steps = 0, lastSig = "", same = 0;
    while (!game.gameOver && steps < 4000 && game.turn <= 60) {
        steps++;
        const cur = game.currentPlayer;
        const sig = [game.turn, game.phase, game.state.waitingForAction, game.state.awaitingResponse, game.state.awaitingSummonResponse, cur.zone.hand.length, cur.lifePoints, game.opponentPlayer.lifePoints, game.log.length].join("|");
        if (sig === lastSig) { same++; } else { same = 0; lastSig = sig; }
        if (same > 60) { report("STUCK", `no state change for 60 steps in ${game.phase} (agent=${agentOf(agents, game)}) waiting=${game.state.waitingForAction} resp=${game.state.awaitingResponse}/${game.state.awaitingSummonResponse}`, ctx); return "stuck"; }

        ctx.step = steps; ctx.turn = game.turn; ctx.phase = game.phase;
        try {
            if (game.state.awaitingResponse) {
                const def = game.battleResponse.defender;
                actor(agents, game, def);
            } else if (game.state.awaitingSummonResponse) {
                const def = game.summonResponse.defender;
                actor(agents, game, def);
            } else if (!game.state.waitingForAction) {
                game.nextPhase();
            } else {
                actor(agents, game, cur);
            }
            checkInvariants(game, ctx);
        } catch (e) {
            report("EXCEPTION", (e && e.message) || String(e), { ...ctx, stack: (e && e.stack || "").split("\n").slice(0, 6).join("\n") });
            return "exception";
        }
    }
    if (!game.gameOver) return steps >= 4000 ? "step-cap" : "turn-cap";
    return "finished";
}
function agentOf(agents, game) { return agents.get(game.currentPlayer) || "?"; }
function actor(agents, game, player) {
    const kind = agents.get(player);
    if (kind === "ai") {
        const before = game.log.length;
        const res = AIController.step(game);
        if (!res.acted) {
            // fall back so we never stall on an AI that declines a window
            if (game.state.awaitingResponse || game.state.awaitingSummonResponse) game.dispatch({ type: "PASS_RESPONSE" });
            else if (game.state.waitingForAction) game.dispatch({ type: "PASS" });
        }
    } else {
        chaosStep(game, player);
    }
}

// ------------------------------------------------------------------
const results = { finished: 0, "turn-cap": 0, "step-cap": 0, stuck: 0, exception: 0 };
const origLog = console.log; 
for (let g = 0; g < GAMES; g++) {
    const sd = SEED0 + g;
    seed(sd * 2654435761);
    // make the engine's own Math.random deterministic per game too
    Math.random = rnd;
    console.log = () => {};
    let outcome;
    const ctx = { seed: sd };
    try {
        const p1 = new Player("Yugi", JSON.parse(JSON.stringify(require(path.join(ROOT, "deck_inventory/yugi.json")))));
        const p2 = new Player("Kaiba", JSON.parse(JSON.stringify(require(path.join(ROOT, "deck_inventory/kaiba.json")))));
        const game = new MainGame(p1, p2);
        game.startDuel();
        const agents = new Map();
        const m = MODE === "mixed" ? (g % 3) : (MODE === "ai" ? 0 : 2);
        agents.set(p1, m === 0 ? "ai" : "chaos");
        agents.set(p2, m === 2 ? "chaos" : "ai");
        ctx.agents = `${agents.get(p1)} vs ${agents.get(p2)}`;
        outcome = drive(game, agents, ctx);
    } catch (e) {
        outcome = "exception";
        report("EXCEPTION", "setup: " + e.message, { ...ctx, stack: e.stack });
    }
    console.log = origLog;
    results[outcome] = (results[outcome] || 0) + 1;
}
Math.random = _origRandom;

console.log(`\nGames: ${GAMES}  outcomes:`, JSON.stringify(results));
if (problems.size === 0) { console.log("No problems detected. ✔"); process.exit(0); }
console.log(`\n${problems.size} distinct problem(s):\n`);
const sorted = [...problems.entries()].sort((a, b) => b[1].count - a[1].count);
for (const [k, v] of sorted) {
    console.log(`x${String(v.count).padEnd(5)} ${k}`);
    const ex = v.example;
    console.log(`        e.g. seed=${ex.seed} ${ex.agents || ""} turn=${ex.turn} phase=${ex.phase}${ex.stack ? "\n        " + ex.stack.replace(/\n/g, "\n        ") : ""}`);
}
process.exit(1);
