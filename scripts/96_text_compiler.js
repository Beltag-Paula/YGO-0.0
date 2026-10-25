/**
 * scripts/96_text_compiler.js — a small, STRICT card-text compiler (the idea behind EDOPro/ProjectIgnis
 * scripts, but driven by the printed effect text that is already in the database).
 *
 *   text -> [trigger] [cost] [target] [action; action; ...]  -> Registry entries
 *
 * Rules that keep it honest (same philosophy as 70_from_card_text.js):
 *   - EVERY clause of a card's text must be understood. One unknown clause => the card is left alone
 *     (it stays a stub / keeps its hand-written script). Nothing is half-implemented silently.
 *   - Hand-written scripts always win: a card that already has any script is skipped.
 *   - Selectors ("1 FIRE monster your opponent controls", "2 Spell Cards in your GY") are parsed once and
 *     reused for targets, costs and mass effects, so adding one clause form lights up many cards.
 *
 * `node tools/coverage.js` reports how many cards this compiled; `compile.stats` has the per-form counts.
 */
"use strict";
const LocalCards = require("../LocalCards");
const L = require("./_lib");

const FOOTER = /\*\s*The above text is unofficial[^\n]*/gi;
const RACES = ["Winged Beast", "Beast-Warrior", "Sea Serpent", "Divine-Beast", "Creator God", "Warrior", "Spellcaster", "Fairy", "Fiend", "Zombie", "Machine", "Aqua", "Pyro", "Rock", "Plant", "Insect", "Thunder", "Dragon", "Beast", "Dinosaur", "Fish", "Reptile", "Psychic", "Wyrm"];
const ATTRS = ["EARTH", "WATER", "FIRE", "WIND", "LIGHT", "DARK", "DIVINE"];
const NUM = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, "1": 1, "2": 2, "3": 3, "4": 4, "5": 5 };
const num = s => Number(String(s).replace(/,/g, ""));
const clean = t => (t || "").replace(FOOTER, "").replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();

// ===================================================================================================
// Selectors
// ===================================================================================================
/** "1 FIRE monster your opponent controls" -> { n, all, upTo, side, zone, test } or null. */
function parseSel(raw) {
    let s = " " + raw.trim().replace(/[.,]$/, "") + " ";
    // "Name" + (qualifiers) + monster/card  => an ARCHETYPE (name contains); a lone "Name" => that exact card
    const archetype = /"[^"]+"\s+(?:(?:Normal|Effect|Fusion|Ritual|Flip Effect|Tuner|Equip|Continuous|Quick-Play|Field|Counter|face-up|face-down)\s+)*(?:monsters?|cards?|Spell|Trap)\b/i.test(raw);
    const sel = { n: 1, all: false, upTo: false, side: "both", zone: "field", preds: [], noun: null, faceUp: false, faceDown: false };
    const eat = (re, fn) => { const m = re.exec(s); if (!m) return false; s = s.replace(re, " "); if (fn) fn(m); return true; };

    // location (order matters: most specific first)
    if (!eat(/ (?:your opponent controls|your opponent's side of the field) /i, () => { sel.side = "opp"; })
        && !eat(/ (?:you control|on your side of the field) /i, () => { sel.side = "own"; })
        && !eat(/ (?:in|from) your opponent's (?:GY|Graveyard) /i, () => { sel.side = "opp"; sel.zone = "graveyard"; })
        && !eat(/ (?:in|from) (?:your|the) (?:GY|Graveyard) /i, () => { sel.side = "own"; sel.zone = "graveyard"; })
        && !eat(/ (?:in|from) (?:either player's|any|a) (?:GY|Graveyard|Graveyards) /i, () => { sel.side = "both"; sel.zone = "graveyard"; })
        && !eat(/ (?:in|from) your Deck /i, () => { sel.side = "own"; sel.zone = "deck"; })
        && !eat(/ (?:in|from) your hand /i, () => { sel.side = "own"; sel.zone = "hand"; })
        && !eat(/ (?:in|from) your opponent's hand /i, () => { sel.side = "opp"; sel.zone = "hand"; })
        && !eat(/ (?:that is |that are |your |in your )?banished /i, () => { sel.side = "own"; sel.zone = "banished"; })
        && !eat(/ on the field /i, () => { sel.side = "both"; sel.zone = "field"; })) { /* no location given */ }

    // count
    if (!eat(/^ all /i, () => { sel.all = true; })) {
        eat(/^ up to (\w+) /i, m => { sel.upTo = true; sel.n = NUM[m[1].toLowerCase()] || num(m[1]); });
        if (!sel.upTo) { const m = /^ (\w+) /.exec(s); if (m && (NUM[m[1].toLowerCase()] || /^\d+$/.test(m[1]))) { sel.n = NUM[m[1].toLowerCase()] || num(m[1]); s = s.replace(/^ \w+ /, " "); } else return null; }
    }
    // qualifiers
    if (eat(/ face-up /i)) sel.faceUp = true;
    if (eat(/ (?:face-down|Set) /i)) sel.faceDown = true;
    eat(/ (?:Attack|Defense) Position /i, m => { const pos = /Attack/i.test(m[0]) ? "attack" : "defense"; sel.preds.push(g => g.position === pos); });
    eat(/ with (\d[\d,]*) or (less|more) (ATK|DEF) /i, m => { const v = num(m[1]), less = m[2] === "less", f = m[3] === "ATK" ? "atk" : "def"; sel.preds.push(g => less ? (g.card[f] ?? 0) <= v : (g.card[f] ?? 0) >= v); });
    eat(/ with (\d[\d,]*) (ATK|DEF) /i, m => { const v = num(m[1]), f = m[2] === "ATK" ? "atk" : "def"; sel.preds.push(g => (g.card[f] ?? -1) === v); });
    eat(/ Level (\d+) or (lower|higher) /i, m => { const v = num(m[1]), lo = m[2] === "lower"; sel.preds.push(g => lo ? (g.card.level || 99) <= v : (g.card.level || 0) >= v); });
    eat(/ Level (\d+) /i, m => { const v = num(m[1]); sel.preds.push(g => g.card.level === v); });
    eat(/ Normal Monster /i, () => { sel.noun = "monster"; sel.preds.push(g => g.card.frameType === "normal"); });
    eat(/ Effect Monster /i, () => { sel.noun = "monster"; sel.preds.push(g => /Effect/.test(g.card.type)); });
    eat(/ Fusion Monster /i, () => { sel.noun = "monster"; sel.preds.push(g => /Fusion/.test(g.card.type)); });
    eat(/ Ritual Monster /i, () => { sel.noun = "monster"; sel.preds.push(g => /Ritual/.test(g.card.type)); });
    eat(/ Flip Effect Monster /i, () => { sel.noun = "monster"; sel.preds.push(g => /Flip/.test(g.card.type)); });
    eat(/ Tuner /i, () => sel.preds.push(g => /Tuner/.test(g.card.type)));
    for (const a of ATTRS) eat(new RegExp(` ${a} `), () => sel.preds.push(g => g.card.attribute === a));
    for (const r of RACES) eat(new RegExp(` ${r}(?:-Type)? `, "i"), () => sel.preds.push(g => g.card.race === r));
    // spell / trap subtypes
    for (const [w, race] of [["Equip", "Equip"], ["Quick-Play", "Quick-Play"], ["Continuous", "Continuous"], ["Field", "Field"], ["Counter", "Counter"]]) {
        if (eat(new RegExp(` ${w} (Spell|Trap)(?: Cards?)? `, "i"), m => { sel.noun = m[1].toLowerCase(); sel.preds.push(g => g.card.race === race); })) break;
    }
    if (archetype) eat(/ "([^"]+)" /i, m => { const q = m[1].toLowerCase(); sel.noun = sel.noun; sel.preds.push(g => g.card.name.toLowerCase().includes(q)); });
    eat(/ "([^"]+)" /i, m => { const q = m[1].toLowerCase(); sel.noun = sel.noun || "any"; sel.preds.push(g => g.card.name.toLowerCase() === q); });
    // noun
    if (!sel.noun) {
        if (eat(/ Spell\/Trap(?: Cards?)? /i)) sel.noun = "st";
        else if (eat(/ monsters? /i)) sel.noun = "monster";
        else if (eat(/ Spells?(?: Cards?)? /i)) sel.noun = "spell";
        else if (eat(/ Traps?(?: Cards?)? /i)) sel.noun = "trap";
        else if (eat(/ cards? /i)) sel.noun = "any";
    } else eat(/ (?:monsters?|cards?) /i);
    if (!sel.noun || s.trim()) return null;               // anything left over = not understood
    const kind = { monster: L.isMonster, spell: L.isSpell, trap: L.isTrap, st: g => !L.isMonster(g), any: () => true }[sel.noun] || (() => true);
    sel.preds.unshift(kind);
    if (sel.zone === "field" && sel.noun !== "monster" && sel.noun !== "any" && (sel.faceUp || sel.faceDown)) { /* S/T face state is honoured below */ }
    return sel;
}

/** All cards matching `sel` from `gc`'s point of view. */
function pool(game, gc, sel) {
    const me = gc.owner, foe = L.opp(game, gc);
    const sides = sel.side === "own" ? [me] : sel.side === "opp" ? [foe] : [me, foe];
    let cards;
    if (sel.zone === "field") {
        const mon = sel.noun === "monster" || sel.noun === "any", st = sel.noun !== "monster";
        cards = sides.flatMap(p => [...(mon ? L.mons(p) : []), ...(st ? L.sts(p) : [])]);
    } else cards = sides.flatMap(p => p.zone[sel.zone] || []);
    return cards.filter(c => c !== gc && sel.preds.every(f => f(c)) && (!sel.faceUp || c.faceUp) && (!sel.faceDown || !c.faceUp));
}
const targetable = (game, gc, c) => !(c.location === "monster" && c.owner !== gc.owner && (Effects().isUntargetable(c.card.name) || Effects().isProtectedByLordOfD(game, c, gc.owner)));
let _E; const Effects = () => _E || (_E = require("../Effects"));

// ===================================================================================================
// Actions. An action is { check(game, gc, ctx) -> bool, run(game, gc, ctx, next) } ; `ctx.target` is the
// declared target (list) of a "Target ..." clause. `next()` MUST be called exactly once.
// ===================================================================================================
const pickBest = (game, gc, list, n, hostile) => list.slice().sort((a, b) => (hostile ? game.getAtk(b) - game.getAtk(a) : game.getAtk(a) - game.getAtk(b))).slice(0, n);
const hostileOf = (gc, sel) => sel.side === "opp" || (sel.side === "both" && sel.zone !== "graveyard");
const log = (g, m) => g.addLog(m);
const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Resolve `sel` into concrete cards (asking the player when there is a real choice), then call fn(cards). */
function resolveSel(game, gc, sel, ctx, verb, fn, o = {}) {
    if (ctx.target && !o.fresh) return fn(ctx.target.filter(t => t.location !== "graveyard" || sel.zone === "graveyard" || ctx.keepLoc));
    const cands = pool(game, gc, sel);
    if (sel.all) return fn(cands);
    if (!cands.length) { log(game, `${gc.card.name}: no valid card.`); return o.fail ? o.fail() : null; }
    const max = Math.min(sel.n, cands.length), min = sel.upTo ? 1 : max;
    return L.choose(game, gc.owner, {
        prompt: `${gc.card.name}: ${verb} ${sel.upTo ? "up to " : ""}${plural(sel.n, "card")}`, candidates: cands, min, max, onField: sel.zone === "field", alwaysAsk: true,
        optional: !!o.optional,
        aiPick: (gm, c) => (o.aiBad ? pickBest(gm, gc, c, max, false) : pickBest(gm, gc, c, max, hostileOf(gc, sel)))
    }, fn);
}
const canSel = (g, gc, sel) => sel.all ? pool(g, gc, sel).length > 0 : pool(g, gc, sel).length >= (sel.upTo ? 1 : sel.n);

const ACTIONS = [
    // ---- "Target 1 X;" declares the target for the clauses that follow -----------------------------------
    [/^Target the attacking monster$/i, () => {
        const atk = (g, gc) => { const a = g.pendingAttack && g.pendingAttack.attacker; return a && a.owner !== gc.owner && a.location === "monster" ? [a] : []; };
        return { isTarget: true, custom: atk, sel: null, check: (g, gc) => atk(g, gc).length > 0, run: (g, gc, ctx, next) => { ctx.target = atk(g, gc); next(); } };
    }],
    [/^negate (?:that|the) attack$/i, () => ({ run: (g, gc, ctx, next) => { g.attackNegated = true; log(g, `${gc.card.name} negates the attack!`); next(); } })],
    [/^gain LP equal to (?:that target's|its) ATK$/i, () => ({ needsTarget: true, run: (g, gc, ctx, next) => { const t = (ctx.target || [])[0]; if (t) { const n = g.getAtk(t); gc.owner.lifePoints += n; log(g, `${gc.owner.name} gains ${n} LP.`); } next(); } })],
    [/^(?:Target|Select) (.+)$/i, (m) => {
        const sel = parseSel(m[1]); if (!sel || sel.all) return null;
        return {
            isTarget: true, sel,
            check: (g, gc) => pool(g, gc, sel).filter(c => targetable(g, gc, c)).length >= (sel.upTo ? 1 : sel.n),
            run: (g, gc, ctx, next) => resolveSel(g, gc, sel, { target: null }, "target", picked => { ctx.target = picked; next(); }, { fresh: true, optional: false })
        };
    }],
    [/^Destroy (all .+)$/i, (m) => { const sel = parseSel(m[1]); return sel && { check: (g, gc) => canSel(g, gc, sel), run: (g, gc, ctx, next) => { const c = pool(g, gc, sel); L.destroyAll(g, c); log(g, `${gc.card.name} destroys ${plural(c.length, "card")}.`); next(); } }; }],
    [/^Destroy (\d+|an?|up to \w+) (.+)$/i, (m) => { const sel = parseSel(m[1] + " " + m[2]); return sel && !sel.all && { check: (g, gc) => canSel(g, gc, sel), run: (g, gc, ctx, next) => resolveSel(g, gc, sel, ctx, "destroy", c => { c.forEach(x => { const n = x.card.name; if (L.destroy(g, x)) log(g, `${gc.card.name} destroys ${n}.`); }); next(); }) }; }],
    [/^(?:destroy|destroys) (?:that target|it|them|those targets)$/i, () => ({ needsTarget: true, run: (g, gc, ctx, next) => { (ctx.target || []).filter(t => t.location === "monster" || t.location === "spellTrap").forEach(t => { const n = t.card.name; if (L.destroy(g, t)) log(g, `${gc.card.name} destroys ${n}.`); }); next(); } })],
    [/^(?:banish) (that target|it|them|those targets)$/i, () => ({ needsTarget: true, run: (g, gc, ctx, next) => { (ctx.target || []).forEach(t => { if (t.location !== "banished") { L.send(t, "banished"); log(g, `${gc.card.name} banishes ${t.card.name}.`); } }); next(); } })],
    [/^Banish (all .+|\d+ .+)$/i, (m) => { const sel = parseSel(m[1]); return sel && { check: (g, gc) => canSel(g, gc, sel), run: (g, gc, ctx, next) => resolveSel(g, gc, sel, ctx, "banish", c => { c.forEach(x => L.send(x, "banished")); log(g, `${gc.card.name} banishes ${plural(c.length, "card")}.`); next(); }) }; }],
    [/^(?:return|returns) (?:that target|it|them|those targets) to the (?:hand|owner's hand)$/i, () => ({ needsTarget: true, run: (g, gc, ctx, next) => { (ctx.target || []).filter(t => ["monster", "spellTrap"].includes(t.location)).forEach(t => { t.owner.moveCard(t, t.location, "hand"); log(g, `${t.card.name} returns to the hand.`); }); next(); } })],
    [/^Return (\d+ .+) to the (?:hand|owner's hand)$/i, (m) => { const sel = parseSel(m[1]); return sel && sel.zone === "field" && { check: (g, gc) => canSel(g, gc, sel), run: (g, gc, ctx, next) => resolveSel(g, gc, sel, ctx, "return to the hand", c => { c.forEach(t => { t.owner.moveCard(t, t.location, "hand"); log(g, `${t.card.name} returns to the hand.`); }); next(); }) }; }],
    [/^Return (all .+) to the (?:hand|owner's hand)$/i, (m) => { const sel = parseSel(m[1]); return sel && sel.zone === "field" && { check: (g, gc) => canSel(g, gc, sel), run: (g, gc, ctx, next) => { pool(g, gc, sel).forEach(t => t.owner.moveCard(t, t.location, "hand")); log(g, `${gc.card.name} returns cards to the hand.`); next(); } }; }],

    // ---- Special Summon -------------------------------------------------------------------------------------------
    [/^Special Summon (?:that target|it|them|those targets)(?: in (Attack|Defense) Position)?$/i, (m) => ({ needsTarget: true, run: (g, gc, ctx, next) => {
        (ctx.target || []).forEach(t => { if (!["graveyard", "banished", "hand", "deck"].includes(t.location)) return; if (L.specialSummon(g, t, gc.owner, { position: m[1] ? m[1].toLowerCase() : "attack" })) log(g, `${gc.owner.name} Special Summons ${t.card.name}.`); });
        next(); } })],
    [/^Special Summon (\d+ .+?)(?: in (Attack|Defense) Position)?$/i, (m) => {
        const sel = parseSel(m[1]); if (!sel || sel.all || !["graveyard", "banished", "hand", "deck"].includes(sel.zone) || sel.noun !== "monster" && sel.noun !== "any") return null;
        if (sel.side !== "own") return null;
        return { check: (g, gc) => gc.owner.getFreeMonsterSlot() !== -1 && canSel(g, gc, sel), run: (g, gc, ctx, next) => resolveSel(g, gc, sel, ctx, "Special Summon", c => {
            c.forEach(t => { const z = t.location; if (L.specialSummon(g, t, gc.owner, { position: m[2] ? m[2].toLowerCase() : "attack" })) { log(g, `${gc.owner.name} Special Summons ${t.card.name}.`); if (z === "deck") gc.owner.shuffleDeck(); } }); next(); }, { optional: false, aiBad: true }) };
    }],

    // ---- search / recover / send -------------------------------------------------------------------------------
    [/^[Aa]dd (?:that target|it|them|those targets) to your hand$/i, () => ({ needsTarget: true, run: (g, gc, ctx, next) => { (ctx.target || []).forEach(t => { if (["graveyard", "banished", "deck"].includes(t.location)) { const z = t.location; t.owner.moveCard(t, z, "hand"); log(g, `${gc.owner.name} adds ${t.card.name} to their hand.`); } }); next(); } })],
    [/^Add (\d+ .+?) to your hand$/i, (m) => {
        const sel = parseSel(m[1]); if (!sel || sel.all || sel.side !== "own" || !["deck", "graveyard", "banished"].includes(sel.zone)) return null;
        return { check: (g, gc) => canSel(g, gc, sel), run: (g, gc, ctx, next) => resolveSel(g, gc, sel, ctx, "add to your hand", c => {
            c.forEach(t => { const z = t.location; gc.owner.moveCard(t, z, "hand"); log(g, `${gc.owner.name} adds ${t.card.name} to their hand.`); if (g.revealSearchedCard && z === "deck") g.revealSearchedCard(gc.owner, t); });
            if (sel.zone === "deck") gc.owner.shuffleDeck(); next(); }, { aiBad: true }) };
    }],
    [/^Send (\d+ .+?) to the (?:GY|Graveyard)$/i, (m) => {
        const sel = parseSel(m[1]); if (!sel || sel.all || sel.side !== "own" || !["deck", "hand"].includes(sel.zone)) return null;
        return { check: (g, gc) => canSel(g, gc, sel), run: (g, gc, ctx, next) => resolveSel(g, gc, sel, ctx, "send to the Graveyard", c => { c.forEach(t => L.send(t, "graveyard")); log(g, `${gc.card.name} sends ${plural(c.length, "card")} to the Graveyard.`); if (sel.zone === "deck") gc.owner.shuffleDeck(); next(); }, { aiBad: true }) };
    }],
    [/^change this card to face-down Defense Position$/i, () => ({ check: (g, gc) => gc.faceUp && gc.location === "monster", run: (g, gc, ctx, next) => { gc.faceUp = false; gc.position = "defense"; log(g, `${gc.card.name} is set face-down.`); next(); } })],
    [/^(?:Send|send) the top (\w+) cards? of your Deck to the (?:GY|Graveyard)$/i, (m) => { const n = NUM[m[1].toLowerCase()] || num(m[1]); return n && { run: (g, gc, ctx, next) => { const o = gc.owner; for (let i = 0; i < n && o.zone.deck.length; i++) L.send(o.zone.deck[0], "graveyard"); log(g, `${o.name} sends the top ${plural(n, "card")} of their Deck to the Graveyard.`); next(); } }; }],
    [/^[Tt]ake (\d[\d,]*) damage$/i, (m) => ({ run: (g, gc, ctx, next) => { gc.owner.dealDamage(num(m[1])); log(g, `${gc.owner.name} takes ${num(m[1])} damage.`); next(); } })],
    [/^(?:this card|it) gains (\d[\d,]*) (ATK|DEF)$/i, (m) => ({ run: (g, gc, ctx, next) => { if (gc.location === "monster") { gc.modifiers[m[2] === "ATK" ? "atk" : "def"] += num(m[1]); log(g, `${gc.card.name} gains ${num(m[1])} ${m[2]}.`); } next(); } })],
    [/^flip this card into face-down Defense Position$/i, () => ({ check: (g, gc) => gc.faceUp && gc.location === "monster", run: (g, gc, ctx, next) => { gc.faceUp = false; gc.position = "defense"; log(g, `${gc.card.name} is set face-down.`); next(); } })],
    [/^[Ll]ook at your opponent's hand$/i, () => ({ run: (g, gc, ctx, next) => { log(g, `${gc.owner.name} looks at the opponent's hand: ${L.opp(g, gc).zone.hand.map(c => c.card.name).join(", ") || "(empty)"}.`); next(); } })],
    [/^[Cc]hange (all .+) to (Attack|Defense) Position$/i, (m) => { const sel = parseSel(m[1]); return sel && sel.zone === "field" && { check: (g, gc) => canSel(g, gc, sel), run: (g, gc, ctx, next) => { pool(g, gc, sel).forEach(t => { t.position = m[2].toLowerCase(); }); log(g, `${gc.card.name} changes the battle position of monsters.`); next(); } }; }],
    [/^[Dd]estroy this card$/i, () => ({ run: (g, gc, ctx, next) => { L.destroy(g, gc); next(); } })],
    [/^[Ss]pecial [Ss]ummon this card$/i, () => ({ check: (g, gc) => gc.owner.getFreeMonsterSlot() !== -1 && ["hand", "graveyard", "banished"].includes(gc.location), run: (g, gc, ctx, next) => { if (L.specialSummon(g, gc, gc.owner)) log(g, `${gc.owner.name} Special Summons ${gc.card.name}.`); next(); } })],
    [/^[Ii]nflict (\d[\d,]*) damage to (?:both players|each player)$/i, (m) => ({ run: (g, gc, ctx, next) => { [g.player1, g.player2].forEach(p => p.dealDamage(num(m[1]))); log(g, `${gc.card.name} inflicts ${num(m[1])} damage to both players!`); next(); } })],
    [/^[Ss]huffle your Deck$/i, () => ({ run: (g, gc, ctx, next) => { gc.owner.shuffleDeck(); next(); } })],

    // ---- life points / hand ------------------------------------------------------------------------------------------
    [/^Draw (\w+) cards?$/i, (m) => { const n = NUM[m[1].toLowerCase()] || num(m[1]); return n && { check: (g, gc) => gc.owner.zone.deck.length >= n, run: (g, gc, ctx, next) => { gc.owner.drawCard(n); log(g, `${gc.owner.name} draws ${plural(n, "card")}.`); next(); } }; }],
    [/^[Ii]nflict (\d[\d,]*) damage to your opponent$/i, (m) => ({ run: (g, gc, ctx, next) => { L.opp(g, gc).dealDamage(num(m[1])); log(g, `${gc.card.name} inflicts ${num(m[1])} damage!`); next(); } })],
    [/^(?:[Yy]ou )?gain (\d[\d,]*) (?:Life Points|LP)$/i, (m) => ({ run: (g, gc, ctx, next) => { gc.owner.lifePoints += num(m[1]); log(g, `${gc.owner.name} gains ${num(m[1])} LP.`); next(); } })],
    [/^Your opponent (?:discards|must discard) (\w+) cards?$/i, (m) => { const n = NUM[m[1].toLowerCase()] || num(m[1]); return n && { run: (g, gc, ctx, next) => { const foe = L.opp(g, gc); const c = foe.zone.hand.slice().sort(() => Math.random() - .5).slice(0, n); c.forEach(x => L.send(x, "graveyard")); log(g, `${foe.name} discards ${plural(c.length, "card")}.`); next(); } }; }],

    // ---- stat changes ------------------------------------------------------------------------------------------------------
    [/^(?:that target|it|the target) gains (\d[\d,]*) (ATK|DEF)(?: and (\d[\d,]*) (DEF))? until the End Phase$/i, (m) => ({ needsTarget: true, run: (g, gc, ctx, next) => { (ctx.target || []).forEach(t => { if (t.location === "monster") L.tempStat(g, t, m[2] === "ATK" ? num(m[1]) : 0, m[2] === "DEF" ? num(m[1]) : (m[4] ? num(m[3]) : 0)); }); log(g, `${gc.card.name}: stats up until the End Phase.`); next(); } })],
    [/^(?:that target|it|the target) loses (\d[\d,]*) (ATK|DEF) until the End Phase$/i, (m) => ({ needsTarget: true, run: (g, gc, ctx, next) => { (ctx.target || []).forEach(t => { if (t.location === "monster") L.tempStat(g, t, m[2] === "ATK" ? -num(m[1]) : 0, m[2] === "DEF" ? -num(m[1]) : 0); }); log(g, `${gc.card.name}: stats down until the End Phase.`); next(); } })],
    [/^(?:that target|it|the target)'s (ATK|DEF) becomes 0 until the End Phase$/i, (m) => ({ needsTarget: true, run: (g, gc, ctx, next) => { (ctx.target || []).forEach(t => { if (t.location === "monster") L.tempStat(g, t, m[1] === "ATK" ? -g.getAtk(t) : 0, m[1] === "DEF" ? -g.getDef(t) : 0); }); next(); } })],
    [/^(?:Change|change) (?:that target|it) to (?:face-up )?(Attack|Defense) Position$/i, (m) => ({ needsTarget: true, run: (g, gc, ctx, next) => { (ctx.target || []).forEach(t => { if (t.location === "monster") { t.position = m[1].toLowerCase(); t.faceUp = true; } }); next(); } })],
    [/^(?:Change|change) (?:that target|it) to face-down Defense Position$/i, () => ({ needsTarget: true, run: (g, gc, ctx, next) => { (ctx.target || []).forEach(t => { if (t.location === "monster") { t.position = "defense"; t.faceUp = false; } }); next(); } })],
    [/^[Ii]nflict damage to your opponent equal to (?:that target's|its) (?:original )?ATK$/i, () => ({ needsTarget: true, run: (g, gc, ctx, next) => { const t = (ctx.target || [])[0]; if (t) { const n = t.card.atk || 0; L.opp(g, gc).dealDamage(n); log(g, `${gc.card.name} inflicts ${n} damage!`); } next(); } })]
];

// "Pay N Life Points", "discard N card(s)", "Tribute N X" appear before the effect as costs.
const COSTS = [
    [/^[Pp]ay (\d[\d,]*) (?:Life Points|LP)$/i, m => ({ lp: num(m[1]) })],
    [/^[Dd]iscard (\w+) cards?(?: from your hand)?$/i, m => ({ discard: NUM[m[1].toLowerCase()] || num(m[1]) })],
    [/^[Tt]ribute (\w+) monsters?$/i, m => ({ tribute: NUM[m[1].toLowerCase()] || num(m[1]) })],
    [/^[Dd]iscard (\w+) (?!cards?$)(.+?)(?: from your hand)?(?: to the (?:GY|Graveyard))?$/i, m => { const n = NUM[m[1].toLowerCase()] || num(m[1]); const sel = n && parseSel(`${n} ${m[2]} in your hand`); return sel ? { discardSel: sel } : null; }],
    [/^[Tt]ribute (\w+) ((?!monsters?$).+)$/i, m => { const n = NUM[m[1].toLowerCase()] || num(m[1]); const sel = n && parseSel(`${n} ${m[2]} you control`); return sel ? { tributeSel: sel } : null; }],
    [/^[Tt]ribute this card$/i, () => ({ tributeSelf: true })],
    [/^[Dd]iscard this card(?: to the (?:GY|Graveyard))?$/i, () => ({ discardSelf: true })]
];

function parseClause(c) {
    c = c.trim().replace(/^(?:Then|then|and if you do|and|If you do),? /, "").replace(/[.]$/, "");
    if (!c) return { skip: true };
    for (const [re, build] of ACTIONS) { const m = re.exec(c); if (m) { const a = build(m); if (a) return { action: a }; } }
    for (const [re, build] of COSTS) { const m = re.exec(c); if (m) { const k = build(m); if (k) return { cost: k }; } }
    return null;
}

/** Split a whole effect body into clauses on ";", sentence ends and ", then". */
function clauses(body) {
    return body.split(/;|(?<=[.])\s+|,\s*(?:and\s+if you do,?\s+|and\s+)?(?:then,?\s+)?(?=(?:negate|destroy|gain|draw|inflict|banish|add|return|special summon|target|select|send|discard|take|change|equip|shuffle)\b)/i).map(s => s.trim()).filter(Boolean);
}

/**
 * body -> { costs, acts, rest } or null.
 * Strict mode: ANY clause not understood => null. Partial mode: the longest understood PREFIX is kept and the
 * remaining clauses come back in `rest` (the card is then registered with R.partial and a note naming them).
 */
function compileBody(body, allowPartial = false) {
    const costs = [], acts = [], all = clauses(body);
    let i = 0;
    for (; i < all.length; i++) {
        const p = parseClause(all[i]);
        if (!p) break;
        if (p.skip) continue;
        if (p.cost && p.cost.discard !== undefined && acts.length) acts.push({ run: (g, gc, ctx, next) => { const o = gc.owner; L.choose(g, o, { prompt: `Discard ${plural(p.cost.discard, "card")}`, candidates: o.zone.hand.filter(x => x !== gc), min: p.cost.discard, max: p.cost.discard, alwaysAsk: true }, pk => { pk.forEach(x => L.send(x, "graveyard")); next(); }) || next(); } });
        else if (p.cost) costs.push(p.cost); else acts.push(p.action);
    }
    const rest = all.slice(i);
    if (rest.length && !allowPartial) return null;
    if (!acts.length) return null;
    const needsT = acts.some(a => a.needsTarget), hasT = acts.some(a => a.isTarget);
    if (needsT && !hasT) return null;                    // "destroy it" with nothing declared
    if (hasT && acts.findIndex(a => a.isTarget) !== 0) return null;
    return { costs, acts, rest };
}

// ---- costs ------------------------------------------------------------------------------------------------------------------
function costOk(g, gc, costs, selfInHand) {
    const o = gc.owner;
    return costs.every(c => (c.lp === undefined || o.lifePoints > c.lp)
        && (c.discard === undefined || o.zone.hand.filter(x => x !== gc).length >= c.discard)
        && (c.tribute === undefined || L.mons(o).filter(x => x !== gc).length >= c.tribute)
        && (!c.discardSel || pool(g, gc, c.discardSel).length >= c.discardSel.n)
        && (!c.tributeSel || pool(g, gc, c.tributeSel).length >= c.tributeSel.n));
}
function payCosts(g, gc, costs, done) {
    const o = gc.owner, sc = costs.find(x => x.discardSel || x.tributeSel);
    if (sc) { const sel = sc.discardSel || sc.tributeSel, rest = costs.filter(x => x !== sc);
        return L.choose(g, o, { prompt: `${sc.discardSel ? "Discard" : "Tribute"} ${plural(sel.n, "card")} (cost)`, candidates: pool(g, gc, sel), min: sel.n, max: sel.n, onField: !!sc.tributeSel, alwaysAsk: true, aiPick: (gm, cs) => pickBest(gm, gc, cs, sel.n, false) },
            p => { p.forEach(x => { if (sc.tributeSel) x._noReplace = true; L.send(x, "graveyard"); }); payCosts(g, gc, rest, done); }); }
    const c = costs.find(x => x.discard !== undefined || x.tribute !== undefined);
    costs.filter(x => x.lp !== undefined).forEach(x => { o.lifePoints -= x.lp; log(g, `${o.name} pays ${x.lp} LP.`); });
    costs.filter(x => x.tributeSelf).forEach(() => { gc._noReplace = true; L.send(gc, "graveyard"); log(g, `${o.name} Tributes ${gc.card.name}.`); });
    costs.filter(x => x.discardSelf).forEach(() => { L.send(gc, "graveyard"); log(g, `${o.name} discards ${gc.card.name}.`); });
    if (!c) return done();
    if (c.discard !== undefined) return L.choose(g, o, { prompt: `Discard ${plural(c.discard, "card")} (cost)`, candidates: o.zone.hand.filter(x => x !== gc), min: c.discard, max: c.discard, alwaysAsk: true }, p => { p.forEach(x => L.send(x, "graveyard")); done(); });
    return L.choose(g, o, { prompt: `Tribute ${plural(c.tribute, "monster")} (cost)`, candidates: L.mons(o).filter(x => x !== gc), min: c.tribute, max: c.tribute, onField: true, alwaysAsk: true,
        aiPick: (gm, cs) => pickBest(gm, gc, cs, c.tribute, false) }, p => { p.forEach(x => { x._noReplace = true; L.send(x, "graveyard"); }); done(); });
}

/** Chain the actions one after another (each may open a choice window). */
function runActs(g, gc, plan, ctx, i = 0) {
    if (i >= plan.acts.length) return;
    const a = plan.acts[i];
    if (!a.run) return runActs(g, gc, plan, ctx, i + 1);
    a.run(g, gc, ctx, () => runActs(g, gc, plan, ctx, i + 1));
}
const planOk = (g, gc, plan) => plan.acts.every(a => !a.check || a.check(g, gc, {})) && costOk(g, gc, plan.costs);
function execute(g, gc, plan, ctxIn) {
    const ctx = { target: ctxIn && ctxIn.target ? ctxIn.target : null };
    payCosts(g, gc, plan.costs, () => runActs(g, gc, plan, ctx));
}

// ===================================================================================================
// Card-level forms
// ===================================================================================================
function install(Effects) {
    const R = Effects.Registry;
    const stats = { spell: 0, trap: 0, equip: 0, field: 0, flip: 0, summon: 0, ignition: 0, graveyard: 0, standby: 0, handIgnition: 0, misc: 0, passive: 0, partial: 0, skipped: 0 };
    const has = n => Effects.scriptKinds(n).length > 0;
    const meta = (name, extra) => L.dbMeta(name, extra);
    const ok = (name, key) => { stats[key]++; };

    for (const r of LocalCards.all()) {
        const c = LocalCards.toApiShape(r), name = c.name;
        const t0 = r.metadata.type, shell = Effects.scriptKinds(name).every(k => ["fusion", "partial", "ritual-monster"].includes(k));
        if (has(name) && !((t0 & LocalCards.T.MONSTER) && shell)) continue;
        const text = clean(c.desc), t = r.metadata.type;
        if (!text) continue;
        try {
            // ---------------- Spells & Traps ----------------
            if (t & (LocalCards.T.SPELL | LocalCards.T.TRAP)) {
                const isTrap = !!(t & LocalCards.T.TRAP);
                const sub = c.race;
                // Equip: "Equip only to ... The equipped monster gains N ATK [and loses N DEF]."
                if (sub === "Equip" && !isTrap) { const e = compileEquip(text); if (e) { registerEquip(R, meta, name, e); if (e.rest) { R.partial(name, `The stat bonus works; not implemented: \"${e.rest.slice(0, 140)}\"`); stats.partial++; } else ok(name, "equip"); } continue; }
                // Field / Continuous stat auras: "All X monsters on the field gain N ATK."
                if (sub === "Field" || sub === "Continuous") { const a = compileAura(text); if (a) { registerAura(R, meta, name, a); ok(name, "field"); } continue; }
                if (sub !== "Normal" && sub !== "Quick-Play") continue;
                // Trap window: only "When an opponent's monster declares an attack:" is supported.
                let body = text, window;
                if (isTrap) {
                    const m = /^(?:When|If|Activate only when) (?:an|your) opponent's monster declares an attack[:.]\s*(.+)$/i.exec(text);
                    if (!m) { if (/^(?:When|If|Activate)/i.test(text)) continue; window = "anytime"; body = text; } else { window = "response"; body = m[1]; }
                } else if (sub === "Quick-Play") window = "anytime";
                const plan = compileBody(body, true);
                if (!plan) { stats.skipped++; continue; }
                const restNote = plan.rest.length ? plan.rest.join(" ") : null;
                const tgt = plan.acts.find(a => a.isTarget);
                const lp = plan.costs.find(x => x.lp !== undefined);
                const m = { aiUse: () => false, window: window || undefined, ...(lp ? { cost: { lp: lp.lp } } : {}) };
                if (!m.window) delete m.window;
                if (tgt && tgt.custom) Object.assign(m, { needsTarget: "custom", targets: tgt.custom, aiTarget: (g, gc) => tgt.custom(g, gc)[0] || null });
                else if (tgt) Object.assign(m, {
                    needsTarget: "custom", targets: (g, gc) => pool(g, gc, tgt.sel).filter(x => targetable(g, gc, x)),
                    aiTarget: (g, gc) => pickBest(g, gc, pool(g, gc, tgt.sel).filter(x => targetable(g, gc, x)), 1, hostileOf(gc, tgt.sel))[0] || null
                });
                m.condition = (g, gc) => planOk(g, gc, { ...plan, costs: plan.costs.filter(x => x.lp === undefined) }) && (!lp || gc.owner.lifePoints > lp.lp);
                R.spellTrap(name, meta(name, m), (g, gc, target) => execute(g, gc, { ...plan, costs: plan.costs.filter(x => x.lp === undefined) }, { target: tgt && target ? [target] : null }));
                if (restNote) { R.partial(name, `The effect works up to this point; not implemented: \"${restNote.slice(0, 140)}\"`); stats.partial++; } else ok(name, isTrap ? "trap" : "spell");
                continue;
            }
            // ---------------- Monsters ----------------
            if (!(t & LocalCards.T.MONSTER)) continue;
            compileMonsterCard(R, name, text, t, stats, ok);
        } catch (e) { stats.skipped++; }
    }
    install.stats = stats;
}


const SHELL_SENT = /^(?:Must be Fusion Summoned|This (?:monster|card) can only be (?:Special )?Summoned by|This (?:monster|card) cannot be Special Summoned except|A Fusion Summon of|Must first be Special Summoned|This card can only be Ritual Summoned|You can Ritual Summon this card|You must also)/i;
const STARTER = /^(?:FLIP:|When |If |During |Once per turn|You can|At the end)/i;
const ONCE_SENT = /^You can only use (?:this effect|each effect) of "[^"]+" once per turn\.?$/i;

function compileMonsterCard(R, name, text, t, stats, ok) {
    const ex = extractPassives(text);
    for (const p of ex.passives) {
        if (p.upkeep) R.standbyTrigger(name, (g, gc) => { if (gc.owner.lifePoints > p.upkeep) { gc.owner.lifePoints -= p.upkeep; log(g, `${gc.owner.name} pays ${p.upkeep} LP to keep ${gc.card.name}.`); } else { log(g, `${gc.card.name} is destroyed (LP not paid).`); L.destroy(g, gc); } });
        if (p.noNormal) { R.noNormalSummon(name); R.noSet(name); }
        if (p.noSpecial) R.noSpecialSummon(name);
        if (p.battleInd) R.battleIndestructible(name);
        if (p.direct) R.directAttackWhen(name, () => true);
        if (p.pierce) R.piercing(name);
        if (p.aura) R.continuous(name, (g, src, t) => { const a = p.aura; if (a.sel.side === "own" && t.owner !== src.owner) return null; if (a.sel.side === "opp" && t.owner === src.owner) return null; return a.sel.preds.every(f => f(t)) ? { atk: a.atk, def: a.def } : null; });
        if (p.noDefense) R.stateCheck(name, (g, gc) => { if (gc.location === "monster" && gc.faceUp && gc.position === "defense") { log(g, `${gc.card.name} is destroyed in face-up Defense Position.`); L.destroy(g, gc); } });
        stats.passive++;
    }
    let body = ex.text;
    const isShell = t & (LocalCards.T.FUSION | LocalCards.T.RITUAL);
    if (t & LocalCards.T.FUSION) body = body.replace(/^(?:"[^"]+"\s*\+\s*)+"[^"]+"\s*/, "");
    let sents = body.split(/(?<=[.])\s+/).map(x => x.trim()).filter(Boolean);
    if (isShell) sents = sents.filter(x => !SHELL_SENT.test(x));
    const cardOnce = sents.some(x => ONCE_SENT.test(x));
    sents = sents.filter(x => !ONCE_SENT.test(x));
    const blocks = [];
    for (const x of sents) { if (blocks.length && !STARTER.test(x) || /^If you do/i.test(x)) blocks[blocks.length - 1] += " " + x; else if (blocks.length && /^(?:When|If) /i.test(x) && /:$/.test(blocks[blocks.length - 1]) === false) blocks.push(x); else blocks.push(x); }
    const used = new Set(), notes = [];
    let done = 0;
    for (const blk of blocks) {
        const kind = compileMonster(blk, true);
        if (!kind || used.has(kind.when === "upkeep" ? "standby" : kind.when)) { notes.push(blk); continue; }
        used.add(kind.when === "upkeep" ? "standby" : kind.when);
        registerKind(R, name, kind, cardOnce, stats, ok);
        done++;
        if (kind.plan.rest && kind.plan.rest.length) notes.push(kind.plan.rest.join(" "));
    }
    if (!done) { if (ex.passives.length) { if (notes.length) { R.partial(name, `Implemented: ${ex.passives.length} passive clause(s). Not implemented: "${notes.join(" ").slice(0, 140)}"`); stats.partial++; } } else stats.skipped++; return; }
    if (notes.length) { if (isShell) R.unpartial(name); R.partial(name, `Implemented effects work; not implemented: "${notes.join(" ").slice(0, 140)}"`); stats.partial++; }
    else if (isShell) R.unpartial(name);
}

function registerKind(R, name, kind, cardOnce, stats, ok) {
    const plan = kind.plan, when = kind.when, once = kind.once || cardOnce;
    const guard = once ? (g, gc) => !(gc.state && gc.state.hasUsedEffectThisTurn) : () => true;
    if (when === "flip") { R.flip(name, (g, gc) => { if (planOk(g, gc, plan) || !kind.optional) execute(g, gc, plan); }); ok(name, "flip"); }
    else if (when === "normal" || when === "special" || when === "any" || when === "tribute") {
        const fn = (g, gc) => { const st = gc.state.summonType === "special" ? "special" : "normal"; if (when === "tribute" ? (st !== "normal" || !(gc.state.tributeCount > 0)) : (when !== "any" && st !== when)) return; if (!planOk(g, gc, plan)) return; execute(g, gc, plan); };
        if (when !== "normal") fn.anySummon = true;
        R.onSummon(name, fn); ok(name, "summon");
    } else if (when === "ignition") {
        R.ignition(name, { canActivate: (g, gc) => gc.faceUp && guard(g, gc) && planOk(g, gc, plan), activate: (g, gc) => { if (once) gc.state.hasUsedEffectThisTurn = true; execute(g, gc, plan); return true; } });
        ok(name, "ignition");
    } else if (when === "hand") {
        R.handIgnition(name, { canActivate: (g, gc) => planOk(g, gc, plan), activate: (g, gc) => { payCosts(g, gc, plan.costs, () => runActs(g, gc, plan, { target: null })); return true; } });
        ok(name, "handIgnition");
    } else if (when === "grave") {
        R.gyTrigger(name, (g, gc) => { if (kind.battleOnly && !gc._destroyedByBattle) return; if (planOk(g, gc, plan)) execute(g, gc, plan); }); ok(name, "graveyard");
    } else if (when === "upkeep") {
        R.standbyTrigger(name, (g, gc) => { if (gc.owner.lifePoints > kind.lp) { gc.owner.lifePoints -= kind.lp; log(g, `${gc.owner.name} pays ${kind.lp} LP to keep ${gc.card.name}.`); } else { log(g, `${gc.card.name} is destroyed (LP not paid).`); L.destroy(g, gc); } }); ok(name, "standby");
    } else if (when === "standby") { R.standbyTrigger(name, (g, gc) => { if (planOk(g, gc, plan)) execute(g, gc, plan); }); ok(name, "standby"); }
    else if (when === "end") { R.endPhaseTrigger(name, (g, gc) => { if (planOk(g, gc, plan)) execute(g, gc, plan); }); ok(name, "misc"); }
    else if (when === "battleDestroy") { R.battleDestroyTrigger(name, (g, gc) => { if (planOk(g, gc, plan)) execute(g, gc, plan); }); ok(name, "misc"); }
    else if (when === "battleDamage") { R.battleDamageTrigger(name, (g, gc, amount, victim) => { if (victim && victim === gc.owner) return; if (planOk(g, gc, plan)) execute(g, gc, plan); }); ok(name, "misc"); }
}

// ---- equip / aura -----------------------------------------------------------------------------------------------------------
function equipTest(s) {
    let m;
    if ((m = /^Equip only to (?:a |an )?"([^"]+)" monster\.?$/i.exec(s))) { const q = m[1].toLowerCase(); return g => g.card.name.toLowerCase().includes(q); }
    if ((m = /^Equip only to "([^"]+)"\.?$/i.exec(s))) { const q = m[1].toLowerCase(); return g => g.card.name.toLowerCase() === q; }
    if ((m = /^Equip only to (?:a |an )?(\w[\w -]*?) monster\.?$/i.exec(s))) {
        const w = m[1];
        const race = RACES.find(r => r.toLowerCase() === w.toLowerCase()), attr = ATTRS.find(a => a === w.toUpperCase());
        if (race) return g => g.card.race === race; if (attr) return g => g.card.attribute === attr;
    }
    if (/^Equip only to a monster\.?$/i.test(s)) return () => true;
    return null;
}
function statDelta(s) {
    let atk = 0, def = 0, m;
    if ((m = /^(?:The )?equipped monster gains (\d[\d,]*) ATK\/DEF\.?$/i.exec(s))) return { atk: num(m[1]), def: num(m[1]) };
    if ((m = /^(?:The )?equipped monster gains (\d[\d,]*) ATK(?: and (gains|loses) (\d[\d,]*) DEF)?\.?$/i.exec(s))) return { atk: num(m[1]), def: m[2] ? (m[2] === "gains" ? 1 : -1) * num(m[3]) : 0 };
    if ((m = /^(?:The )?equipped monster gains (\d[\d,]*) DEF\.?$/i.exec(s))) return { atk: 0, def: num(m[1]) };
    if ((m = /^(?:The )?equipped monster loses (\d[\d,]*) ATK\.?$/i.exec(s))) return { atk: -num(m[1]), def: 0 };
    return null;
}
function compileEquip(text) {
    const ss = text.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean);
    let test = equipTest(ss[0]), i = 1, d = null;
    if (!test) { d = statDelta(ss[0]); test = d ? (() => true) : null; i = 1; }
    if (!test) return null;
    if (!d) { d = statDelta((ss[1] || "").replace(/^It gains /i, "The equipped monster gains ")); i = 2; }
    return d ? { test, ...d, rest: ss.slice(i).join(" ") } : null;
}
function registerEquip(R, meta, name, e) {
    const faceUpMons = g => L.allMons(g).filter(m => m.faceUp && e.test(m));
    R.spellTrap(name, meta(name, { needsTarget: "custom", aiUse: () => true, targets: g => faceUpMons(g), aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(m => m.faceUp && e.test(m))) }),
        (g, gc, t) => { if (t && t.location === "monster") L.equip(g, gc, t, e.atk, e.def); });
}
/** "Increase the ATK of all FIRE monsters by 500 points and decrease their DEF by 400 points." -> { sel, atk, def } */
function parseAuraSentence(sent) {
    const m = /^(?:As long as this card remains face-up on the field, )?(Increase|Decrease|increase|decrease) the (ATK|DEF|ATK and DEF|ATK\/DEF) of all (?:face-up )?(.+?) monsters( on the field| you control| your opponent controls)? by (\d[\d,]*) points?(?: and (increase|decrease) their (ATK|DEF) by (\d[\d,]*) points?)?\.?$/.exec(sent.trim());
    if (!m) return null;
    const sel = parseSel(`all ${m[3]} monsters${m[4] || " on the field"}`); if (!sel) return null;
    const sgn = w => (/^inc/i.test(w) ? 1 : -1), v = num(m[5]) * sgn(m[1]);
    let atk = 0, def = 0;
    if (m[2] === "ATK") atk = v; else if (m[2] === "DEF") def = v; else { atk = v; def = v; }
    if (m[6]) { const w = sgn(m[6]) * num(m[8]); if (m[7] === "ATK") atk += w; else def += w; }
    return { sel, atk, def };
}
function compileAura(text) {
    const one = parseAuraSentence(text); if (one) return one;
    const ss = text.split(/(?<=\.)\s+/).map(s => s.trim()).filter(Boolean);
    if (ss.length !== 1) return null;
    const m = /^All (?:face-up )?(.+?) monsters (on the field|you control|your opponent controls) gain (\d[\d,]*) ATK(?:\/DEF|(?: and (gain|lose) (\d[\d,]*) DEF))?\.?$/i.exec(ss[0]) || null;
    const m2 = /^All (?:face-up )?(.+?) monsters (on the field|you control|your opponent controls) lose (\d[\d,]*) ATK(?: and (gain|lose) (\d[\d,]*) DEF)?\.?$/i.exec(ss[0]);
    const mm = m || m2; if (!mm) return null;
    const sel = parseSel(`all ${mm[1]} monsters ${mm[2]}`); if (!sel) return null;
    const slash = /\/DEF/.test(ss[0]);
    let atk = num(mm[3]) * (m2 ? -1 : 1), def = slash ? atk : mm[4] ? (mm[4] === "gain" ? 1 : -1) * num(mm[5]) : 0;
    return { sel, atk, def };
}
function registerAura(R, meta, name, a) {
    R.spellTrap(name, meta(name, { aiUse: () => true }), g => g.addLog(`${name} is now active.`));
    R.continuous(name, (g, src, t) => {
        if (a.sel.side === "own" && t.owner !== src.owner) return null;
        if (a.sel.side === "opp" && t.owner === src.owner) return null;
        return a.sel.preds.every(f => f(t)) ? { atk: a.atk, def: a.def } : null;
    });
}

// ---- monsters ---------------------------------------------------------------------------------------------------------------
let PARTIAL = false;
const PASSIVE_SENT = [
    [/^Once per turn, during your Standby Phase,? (?:you must )?pay (\d[\d,]*) (?:Life Points|LP)(?: \(this is not optional\))?,? or (?:this card is destroyed|destroy this card)\.?$/i, m => ({ upkeep: num(m[1]) })],
    [/^If this card is in face-up Defense Position, destroy it\.?$/i, () => ({ noDefense: true })],
    [/^(?:This (?:card|monster) )?[Cc]annot be Normal Summoned(?: or Set|\/Set)\.?$/, () => ({ noNormal: true })],
    [/^(?:This (?:card|monster) )?[Cc]annot be Special Summoned\.?$/, () => ({ noSpecial: true })],
    [/^(?:This (?:card|monster) )?[Cc]annot be destroyed by battle\.?$/, () => ({ battleInd: true })],
    [/^This (?:card|monster) can attack (?:your opponent's Life Points )?directly\.?$/i, () => ({ direct: true })],
    [/^If this card attacks a Defense Position monster, inflict piercing battle damage to your opponent\.?$/i, () => ({ pierce: true })],
    [/^Once per turn, during your Standby Phase, you must pay (\d[\d,]*) (?:Life Points|LP)\s*,?\s*or this card is destroyed\.?$/i, m => ({ upkeep: num(m[1]) })],
    [/^(?:As long as this card remains face-up on the field, )?[Ii]ncrease the .+ of all .+ monsters .*$/, m => { const a = parseAuraSentence(m[0]); return a ? { aura: a } : null; }]
];
/** Pull whole sentences with a fixed meaning out of the text; returns { text, passives }. */
function extractPassives(text) {
    const sents = text.split(/(?<=[.])\s+/), keep = [], found = [];
    for (const s of sents) { const p = PASSIVE_SENT.map(([re, f]) => { const m = re.exec(s.trim()); return m && f(m); }).find(Boolean); if (p) found.push(p); else keep.push(s); }
    return { text: keep.join(" ").trim(), passives: found };
}
function compileMonster(text, allowPartial = false) {
    PARTIAL = allowPartial;
    let m, body, out = { optional: false, once: false };
    const mk = (when, b, extra = {}) => { const plan = compileBody(b, PARTIAL); return plan ? { when, plan, ...out, ...extra } : null; };
    const unYou = s => { out.optional = /^You can /i.test(s); return s.replace(/^You can /i, ""); };
    const TRIG = [
        [/^FLIP:\s*(.+)$/i, "flip"],
        [/^(?:When|If) this card is (?:Normal Summoned|Summoned)(?: successfully)?:\s*(.+)$/i, "normal"],
        [/^(?:When|If) this card is Tribute Summoned:\s*(.+)$/i, "tribute"],
        [/^(?:When|If) this card is Special Summoned:\s*(.+)$/i, "special"],
        [/^(?:When|If) this card is Normal or Special Summoned:\s*(.+)$/i, "any"],
        [/^(?:When|If) this card is destroyed by battle(?: and sent to the (?:GY|Graveyard))?:\s*(.+)$/i, "grave", { battleOnly: true }],
        [/^(?:When|If) this card is sent from the field to the (?:GY|Graveyard):\s*(.+)$/i, "grave"],
        [/^(?:If|When) this card (?:destroys|destroyed) (?:a|an opponent's) monsters? (?:by battle|as a result of battle)(?: and sends it to the (?:GY|Graveyard))?:\s*(.+)$/i, "battleDestroy"],
        [/^(?:If|When) this card inflicts (?:battle )?damage to your opponent(?:'s Life Points)?(?: by battle)?:\s*(.+)$/i, "battleDamage"],
        [/^During (?:your|the|each of your) End Phases?:\s*(.+)$/i, "end"],
        [/^Once per turn, during your End Phase:\s*(.+)$/i, "end"],
        [/^(?:Once per turn, )?during your Standby Phase:\s*(.+)$/i, "standby"]
    ];
    for (const [re, when, extra] of TRIG) { if ((m = re.exec(text))) return mk(when, unYou(m[1]), extra || {}); }
    if ((m = /^You can discard this card to the (?:GY|Graveyard);\s*(.+)$/i.exec(text)) && !/If .* is not on the field/i.test(text)) return mk("hand", "Discard this card; " + m[1]);
    if ((m = /^Once per turn(?:, during your Main Phase)?:\s*You can (.+)$/i.exec(text)) || (m = /^Once per turn, you can (.+)$/i.exec(text))) { const k = mk("ignition", m[1], { once: true }); return k; }
    if ((m = /^You can (Tribute this card;.+)$/i.exec(text))) return mk("ignition", m[1]);
    if ((m = /^(?:During your Main Phase, )?[Yy]ou can ((?:pay|discard|tribute|banish|send|destroy|special summon|add|draw|target).+)$/i.exec(text))) return mk("ignition", m[1]);
    return null;
}

/** Diagnostics: the first piece of text the compiler cannot place (used by tools/diagnose.js). */
function firstUnknown(text, isMonster) {
    let body = text, m;
    if (isMonster) {
        const k = compileMonster(text, false); if (k) return "(compiles)";
        m = /^(?:FLIP:|When this card is [^:]+:|If this card is [^:]+:|During your Standby Phase:|Once per turn(?:, during your Main Phase)?:|You can discard this card to the (?:GY|Graveyard);)\s*(.+)$/i.exec(text);
        if (!m) return "[TRIGGER] " + text.slice(0, 90);
        body = m[1].replace(/^You can /i, "").replace(/^You can /i, "");
    } else {
        m = /^(?:When|If) an opponent's monster declares an attack:\s*(.+)$/i.exec(text); if (m) body = m[1];
        if (!m && /^(?:When|If|Activate|During|At)/i.test(text)) return "[TRIGGER] " + text.slice(0, 90);
    }
    for (const c of clauses(body)) { if (!parseClause(c)) return c; }
    return "(compiles)";
}
module.exports = { install, parseSel, compileBody, firstUnknown };
