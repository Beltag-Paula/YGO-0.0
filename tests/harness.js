/**
 * tests/harness.js — build a duel in an exact, hand-picked position so a
 * single card's script can be exercised in isolation.
 *
 *   const d = makeDuel({
 *     p1: { hand: ["Raigeki"], monsters: ["Blue-Eyes White Dragon"], spellTrap: [{ name: "Mirror Force", faceUp: false }], graveyard: [], lp: 8000 },
 *     p2: { monsters: [{ name: "Summoned Skull", pos: "defense", faceUp: false }] }
 *   });
 *   d.activate("Raigeki");   // plays it from p1's hand
 *
 * Card data comes from the local card DB, falling back to every card found
 * in deck_inventory (so cards the DB lacks, e.g. Blue-Eyes, still work).
 */
"use strict";
process.env.YGO_QUIET = "1";
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const Player = require(path.join(ROOT, "Player"));
const MainGame = require(path.join(ROOT, "MainGame"));
const LocalCards = require(path.join(ROOT, "LocalCards"));
const CardScripts = require(path.join(ROOT, "CardScripts"));
const Effects = require(path.join(ROOT, "Effects"));
CardScripts.loadAll();

const inventoryIndex = new Map();
(function indexInventory() {
    const dir = path.join(ROOT, "deck_inventory");
    for (const f of fs.readdirSync(dir)) {
        if (!f.endsWith(".json")) continue;
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
        for (const c of [...d.mainDeck, ...(d.extraDeck || []), ...(d.sideDeck || [])]) {
            const k = c.name.toLowerCase();
            if (!inventoryIndex.has(k)) inventoryIndex.set(k, c);
        }
    }
})();

function cardJSON(name) {
    const inv = inventoryIndex.get(name.toLowerCase());
    if (inv) return JSON.parse(JSON.stringify(inv));
    const row = LocalCards.rowByName(name);
    if (row) return LocalCards.toApiShape(row);
    throw new Error(`Unknown card "${name}" (not in local DB or deck_inventory)`);
}

const FILLER = "Feral Imp";
const norm = x => (typeof x === "string" ? { name: x } : x);

function makeDuel(spec = {}) {
    const build = side => {
        const s = spec[side] || {};
        const main = [], extra = [];
        const all = [...(s.hand || []), ...(s.monsters || []), ...(s.spellTrap || []), ...(s.graveyard || []), ...(s.banished || []), ...(s.deck || [])].map(norm);
        all.forEach(c => main.push(cardJSON(c.name)));
        for (let i = 0; i < 30; i++) main.push(cardJSON(FILLER));
        (s.extra || []).map(norm).forEach(c => extra.push(cardJSON(c.name)));
        return { json: { mainDeck: main, extraDeck: extra, sideDeck: [] }, s };
    };
    const b1 = build("p1"), b2 = build("p2");
    const p1 = new Player("P1", b1.json), p2 = new Player("P2", b2.json);
    const game = new MainGame(p1, p2);

    const place = (p, list, zone, defaults) => {
        for (const raw of list || []) {
            const c = norm(raw);
            const gc = p.zone.deck.find(g => g.card.name === c.name);
            if (!gc) throw new Error(`harness: no spare copy of ${c.name}`);
            p.moveCard(gc, "deck", zone);
            if (zone === "monster") {
                gc.faceUp = c.faceUp !== false;
                gc.position = c.pos || (gc.faceUp ? "attack" : "defense");
                gc.state.hasBeenSummonedThisTurn = false;
            } else if (zone === "spellTrap") {
                gc.faceUp = c.faceUp !== undefined ? c.faceUp : true;
                gc.turnSet = 0;
            }
            if (c.counter) gc.hasSpellCounter = true;
        }
    };
    // Order matters: the named deck cards go to the TOP (index 0 = next draw).
    for (const [p, b] of [[p1, b1], [p2, b2]]) {
        const s = b.s;
        place(p, s.monsters, "monster");
        place(p, s.spellTrap, "spellTrap");
        place(p, s.graveyard, "graveyard");
        place(p, s.banished, "banished");
        place(p, s.hand, "hand");
        if (s.lp) p.lifePoints = s.lp;
        // put the explicitly listed deck cards on top, in order
        const wanted = (s.deck || []).map(norm).map(c => c.name);
        const top = [];
        for (const n of wanted) { const i = p.zone.deck.findIndex(g => g.card.name === n && !top.includes(g)); if (i >= 0) top.push(p.zone.deck[i]); }
        p.zone.deck = [...top, ...p.zone.deck.filter(g => !top.includes(g))];
    }
    game.turn = 3; game.firstTurn = false; game.phase = (spec.phase || "m1");
    game.state.waitingForAction = true; game.state.actedThisWindow = false;
    game.drainEvents();

    const d = {
        game, p1, p2,
        names(p, zone) {
            const z = p.zone[zone];
            return (Array.isArray(z) ? z : [z]).filter(Boolean).map(g => g.card.name);
        },
        find(p, name, zone) {
            const z = p.zone[zone];
            return (Array.isArray(z) ? z : [z]).filter(Boolean).find(g => g.card.name === name) || null;
        },
        hand(p, name) { return d.find(p, name, "hand"); },
        mon(p, name) { return d.find(p, name, "monster"); },
        st(p, name) { return d.find(p, name, "spellTrap") || (p.zone.field && p.zone.field.card.name === name ? p.zone.field : null); },
        /** play a Spell from P1's hand (optionally with a target GameCard) */
        activate(name, target = null, p = p1) {
            const gc = d.hand(p, name);
            if (!gc) throw new Error(`${name} is not in ${p.name}'s hand`);
            return game.activateSpellFromHand(gc, target ? target.instanceId : null);
        },
        /** play a card by name: Spells from hand, Traps via Set-then-activate (or an already-Set card) */
        use(name, target = null, p = p1) {
            const gc = d.hand(p, name);
            if (gc && /Trap/.test(gc.card.type)) {
                p.moveCard(gc, "hand", "spellTrap"); gc.faceUp = false; gc.turnSet = 0;
                return d.activateSet(name, target, p);
            }
            return gc ? d.activate(name, target, p) : d.activateSet(name, target, p);
        },
        /** activate a face-down Set card of `p` from the S/T zone, main-phase style */
        activateSet(name, target = null, p = p1, mode = null) {
            const gc = d.st(p, name);
            if (!gc) throw new Error(`${name} is not set on ${p.name}'s field`);
            return game.activateSetCard(gc, target ? target.instanceId : null, mode);
        },
        /** answer the currently open choice window by card name(s) (or "first") */
        choose(...names) {
            const ch = game.choice;
            if (!ch) throw new Error("no choice window is open");
            let picks;
            if (names.length === 0 || names[0] === "first") picks = ch.candidates.slice(0, ch.min);
            else picks = names.map(n => ch.candidates.find(c => c.card.name === n)).filter(Boolean);
            return game.resolveChoice(picks.map(c => c.instanceId));
        },
        choiceNames() { return game.choice ? game.choice.candidates.map(c => c.card.name) : null; },
        endTurn() { game.turnEffects.forEach(fn => fn()); game.turnEffects = []; },
        attack(attName, targetName = null) {
            const a = d.mon(game.currentPlayer, attName);
            const t = targetName ? d.mon(game.opponentPlayer, targetName) : null;
            game.phase = "battle";
            const ok = game.declareAttack(a, t);
            if (game.state.awaitingResponse) game.resolveBattleDamage();
            return ok;
        },
        atk(gcOrName, p) { const gc = typeof gcOrName === "string" ? d.mon(p, gcOrName) : gcOrName; return game.getAtk(gc); },
        def(gcOrName, p) { const gc = typeof gcOrName === "string" ? d.mon(p, gcOrName) : gcOrName; return game.getDef(gc); }
    };
    return d;
}

module.exports = { makeDuel, cardJSON, Effects, CardScripts, LocalCards, FILLER };
