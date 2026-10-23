/**
 * scripts/45_crystal_beasts_full.js — finishes the Crystal Beast archetype from the database text.
 * (Loaded after 40_crystal_beasts.js, so these definitions replace the earlier partial ones.)
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;
    const isCB = gc => L.isMonster(gc) && L.nameHas(gc, "crystal beast") && !L.nameHas(gc, "advanced crystal beast");
    const cbInST = p => L.sts(p).filter(isCB);
    const foe = (g, gc) => L.opp(g, gc);
    const turnPlayerMain = (g, gc) => g.currentPlayer === gc.owner && (g.phase === "m1" || g.phase === "m2");
    const ULTIMATE = ["Rainbow Dragon", "Rainbow Dark Dragon"];
    const distinctCB = p => new Set([...L.mons(p), ...L.sts(p), ...p.zone.graveyard].filter(isCB).map(c => c.card.name));
    const def = (name, extra, fn) => R.spellTrap(name, L.dbMeta(name, extra), fn);

    /** Return a card to its owner's Deck (Tokens simply cease to exist) — the caller shuffles. */
    const intoDeck = c => { if (c.isToken) c.owner.removeCard(c, c.location); else c.owner.moveCard(c, c.location, "deck"); };

    // ---- Crystal Tree: counts every placement in EITHER Spell & Trap Zone --------------------------
    L.countCrystalPlaced = game => {
        L.allSTs(game).filter(c => c.faceUp && Effects.normalize(c.card.name) === "crystal tree").forEach(t => { t._crystalCounters = (t._crystalCounters || 0) + 1; });
    };
    def("Crystal Tree", { aiUse: () => true }, (g, gc) => { gc._crystalCounters = 0; g.addLog("Crystal Tree is active: it gains a Crystal Counter each time a Crystal Beast is placed in a Spell & Trap Zone."); });
    R.quickEffect("Crystal Tree", {
        resolveEvenIfGone: true,           // it sends itself to the Graveyard as the cost
        timing: (g, gc, mode) => mode === "idle" && turnPlayerMain(g, gc),
        canActivate: (g, gc) => (gc._crystalCounters || 0) > 0 && gc.owner.zone.deck.some(isCB) && gc.owner.getFreeSpellTrapSlot() !== -1,
        costChoice: { prompt: "Crystal Tree: send it to the Graveyard (cost)", min: 1, max: 1, candidates: (g, gc) => [gc], pay: (g, gc) => { gc._lastCounters = gc._crystalCounters || 0; gc._noReplace = true; L.send(gc, "graveyard"); g.addLog(`Crystal Tree is sent to the Graveyard with ${gc._lastCounters} Crystal Counter(s).`); } },
        resolve: (g, gc) => {
            const o = gc.owner, free = 5 - o.getSpellTrapsOnField().filter(c => c.location === "spellTrap").length;
            const cands = o.zone.deck.filter(isCB), n = Math.min(gc._lastCounters || 0, cands.length, free);
            if (n <= 0) return;
            L.choose(g, o, { prompt: `Crystal Tree: take ${n} "Crystal Beast" monster(s) from your Deck and place them in your Spell & Trap Zone`, candidates: cands, min: n, max: n, alwaysAsk: true }, picked => {
                picked.forEach(c => L.placeCB(g, c, o)); o.shuffleDeck();
            });
        }
    });

    // ---- Rainbow Dragon: exactly 7 names to Summon, a real Quick Effect, and the second effect --------
    R.noNormalSummon("Rainbow Dragon");
    R.handIgnition("Rainbow Dragon", {
        canActivate: (g, gc) => distinctCB(gc.owner).size === 7 && gc.owner.getFreeMonsterSlot() !== -1,
        activate: (g, gc) => { L.specialSummon(g, gc, gc.owner); g.addLog(`${gc.owner.name} Special Summons Rainbow Dragon with 7 different Crystal Beasts!`); return true; }
    });
    R.quickEffect("Rainbow Dragon", {
        timing: (g, gc, mode) => (mode === "idle" ? g.currentPlayer === gc.owner && ["m1", "battle", "m2"].includes(g.phase) : true),
        canActivate: (g, gc) => !gc.state.hasBeenSummonedThisTurn && L.mons(gc.owner).some(m => isCB(m)),
        resolve: (g, gc) => {
            const cb = L.mons(gc.owner).filter(isCB);
            cb.forEach(m => { m._noReplace = true; L.send(m, "graveyard"); });
            gc.modifiers.atk += 1000 * cb.length;
            g.addLog(`Rainbow Dragon sends ${cb.length} Crystal Beast(s) to the Graveyard and gains ${1000 * cb.length} ATK!`);
        }
    });
    R.ignition("Rainbow Dragon", {
        canActivate: (g, gc) => !gc.state.hasBeenSummonedThisTurn && gc.owner.zone.graveyard.some(isCB),
        activate: (g, gc) => {
            gc.owner.zone.graveyard.filter(isCB).forEach(c => L.send(c, "banished"));
            const all = [...L.allMons(g), ...L.allSTs(g)];
            all.forEach(intoDeck); [g.player1, g.player2].forEach(p => p.shuffleDeck());
            g.addLog(`Rainbow Dragon banishes the Crystal Beasts in the Graveyard and shuffles all ${all.length} cards on the field into the Deck!`);
            return true;
        }
    });
    R.unpartial("Rainbow Dragon");

    // ---- Crystal Release: its Graveyard trigger ---------------------------------------------------
    def("Crystal Release", {
        needsTarget: "custom", aiUse: () => true, targets: g => L.allMons(g).filter(m => m.faceUp && isCB(m)),
        aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(m => m.faceUp && isCB(m)))
    }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        L.equip(g, gc, t, 800, 0);
        const base = gc.linkedRevert;
        gc.linkedRevert = () => {
            if (base) base();
            g.postActions.push(() => {
                if (gc.location !== "graveyard") return;
                const o = gc.owner;
                if (o.getFreeSpellTrapSlot() === -1 || !o.zone.deck.some(isCB)) return;
                g.requestChoice(o, { prompt: "Crystal Release: place 1 \"Crystal Beast\" monster from your Deck in your Spell & Trap Zone?", candidates: o.zone.deck.filter(isCB), min: 0, max: 1, optional: true,
                    onChoose: ([c]) => { if (c) { L.placeCB(g, c, o); o.shuffleDeck(); } } });
            });
        };
    });
    R.unpartial("Crystal Release");

    // ---- Crystal Beast Amber Mammoth: redirect an attack on another Crystal Beast -------------------
    R.quickEffect("Crystal Beast Amber Mammoth", {
        timing: (g, gc, mode) => mode === "battle",
        canActivate: (g, gc) => {
            const pa = g.pendingAttack;
            return !!pa && pa.target && pa.target !== gc && pa.target.owner === gc.owner && isCB(pa.target) && pa.attacker.owner !== gc.owner;
        },
        resolve: (g, gc) => {
            if (!g.pendingAttack) return;
            g.pendingAttack.target = gc;
            g.addLog(`Crystal Beast Amber Mammoth becomes the new attack target!`);
        }
    });
    R.unpartial("Crystal Beast Amber Mammoth");

    // ---- Rainbow Path -----------------------------------------------------------------------------------
    def("Rainbow Path", {
        window: "response", aiUse: () => true,
        condition: (g, gc) => !!g.pendingAttack && g.pendingAttack.attacker.owner !== gc.owner,
        costChoice: { prompt: "Rainbow Path: send 1 \"Crystal Beast\" card from your Spell & Trap Zone to the Graveyard", min: 1, max: 1, onField: true, alwaysAsk: true,
            candidates: (g, gc) => cbInST(gc.owner), pay: (g, gc, [c]) => { L.send(c, "graveyard"); g.addLog(`${gc.owner.name} sends ${c.card.name} to the Graveyard.`); } }
    }, (g, gc) => {
        g.attackNegated = true; g.addLog("Rainbow Path negates the attack!");
        const o = gc.owner, c = [...o.zone.deck].filter(x => ULTIMATE.includes(x.card.name));
        if (c.length) g.requestChoice(o, { prompt: "Rainbow Path: add \"Rainbow Dragon\" or \"Rainbow Dark Dragon\" from your Deck to your hand?", candidates: c, min: 0, max: 1, optional: true,
            onChoose: ([x]) => { if (x) { o.moveCard(x, "deck", "hand"); o.shuffleDeck(); g.addLog(`${o.name} adds ${x.card.name} to their hand.`); } } });
    });

    // ---- Rainbow Veil -------------------------------------------------------------------------------------
    def("Rainbow Veil", { needsTarget: "custom", aiUse: () => true, targets: g => L.allMons(g).filter(m => m.faceUp), aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(m => m.faceUp)) },
        (g, gc, t) => { if (t && t.location === "monster") L.equip(g, gc, t, 0, 0); });
    R.attackHook("Rainbow Veil", (g, src, attacker, target) => {
        const eq = [...L.allMons(g)].find(m => m.instanceId === src.equippedTo);
        if (!eq || !target) return;
        const other = eq === attacker ? target : eq === target ? attacker : null;
        if (!other || !other.faceUp) return;
        other.modifiers.effectsNegated = true;
        g.addLog(`Rainbow Veil negates ${other.card.name}'s effects during the Battle Phase.`);
        g.battlePhaseEndEffects.push(() => { if (other.location === "monster") other.modifiers.effectsNegated = false; });
    });

    // ---- Crystal Pair ---------------------------------------------------------------------------------------
    def("Crystal Pair", {
        condition: (g, gc) => gc.owner.zone.graveyard.some(c => isCB(c) && c._gyTurn === g.turn && c._gyByBattle) && gc.owner.zone.deck.some(isCB) && gc.owner.getFreeSpellTrapSlot() !== -1,
        aiUse: () => true
    }, (g, gc) => {
        const o = gc.owner;
        L.choose(g, o, { prompt: "Crystal Pair: place 1 \"Crystal Beast\" monster from your Deck face-up in your Spell & Trap Zone", candidates: o.zone.deck.filter(isCB), min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            L.placeCB(g, c, o); o.shuffleDeck();
            g.preventBattleDamageFor = o; g.addLog(`${o.name} takes no battle damage for the rest of this turn.`);
        });
    });
    R.partial("Crystal Pair", "Works, but it can be activated at any later point of the turn in which the Crystal Beast was destroyed by battle and sent to the GY, not only immediately.");

    // ---- Rainbow Gravity ---------------------------------------------------------------------------------------
    def("Rainbow Gravity", {
        summons: true, aiUse: () => true,
        condition: (g, gc) => distinctCB(gc.owner).size >= 7 && gc.owner.getFreeMonsterSlot() !== -1 && [...gc.owner.zone.deck, ...gc.owner.zone.graveyard].some(c => ULTIMATE.includes(c.card.name))
    }, (g, gc) => {
        const o = gc.owner;
        L.choose(g, o, { prompt: "Rainbow Gravity: Special Summon 1 \"Ultimate Crystal\" monster from your Deck or Graveyard", candidates: [...o.zone.deck, ...o.zone.graveyard].filter(c => ULTIMATE.includes(c.card.name)), min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            const from = c.location; L.specialSummon(g, c, o); if (from === "deck") o.shuffleDeck();
            g.addLog(`Rainbow Gravity Special Summons ${c.card.name}, ignoring its Summoning conditions!`);
        });
    });

    // ---- Crystal Abundance --------------------------------------------------------------------------------------
    def("Crystal Abundance", {
        summons: true, aiUse: (g, gc) => cbInST(gc.owner).length >= 4 && L.mons(foe(g, gc)).length >= 3,
        costChoice: { prompt: "Crystal Abundance: send 4 \"Crystal Beast\" cards from your Spell & Trap Zone to the Graveyard", min: 4, max: 4, onField: true, alwaysAsk: true,
            candidates: (g, gc) => cbInST(gc.owner), pay: (g, gc, picked) => { picked.forEach(c => L.send(c, "graveyard")); g.addLog(`${gc.owner.name} sends 4 Crystal Beast cards to the Graveyard.`); } }
    }, (g, gc) => {
        const o = gc.owner, you = foe(g, gc);
        const mine = [...L.allMons(g), ...L.allSTs(g)].filter(c => c.owner === o && c !== gc), theirs = [...L.mons(you), ...L.sts(you)];
        [...mine, ...theirs].forEach(c => { c._noReplace = true; L.send(c, "graveyard"); });
        g.addLog(`Crystal Abundance sends ${mine.length + theirs.length} card(s) on the field to the Graveyard (${theirs.length} from the opponent's field).`);
        const cands = o.zone.graveyard.filter(isCB).filter(c => L.isMonster(c)), free = o.zone.monster.filter(z => !z).length;
        const n = Math.min(theirs.length, cands.length, free);
        if (n > 0) L.choose(g, o, { prompt: `Crystal Abundance: Special Summon ${n} "Crystal Beast" monster(s) from your Graveyard`, candidates: cands, min: n, max: n, alwaysAsk: true }, picked => picked.forEach(c => L.specialSummon(g, c, o)));
    });

    // ---- Rainbow Dark Dragon ---------------------------------------------------------------------------------------
    R.noNormalSummon("Rainbow Dark Dragon");
    const darkNames = p => { const m = new Map(); p.zone.graveyard.filter(c => L.isMonster(c) && c.card.attribute === "DARK").forEach(c => { if (!m.has(c.card.name)) m.set(c.card.name, c); }); return m; };
    R.handIgnition("Rainbow Dark Dragon", {
        canActivate: (g, gc) => darkNames(gc.owner).size >= 7 && gc.owner.getFreeMonsterSlot() !== -1,
        activate: (g, gc) => {
            const o = gc.owner;
            L.choose(g, o, { prompt: "Rainbow Dark Dragon: banish 7 DARK monsters with different names from your Graveyard", candidates: [...darkNames(o).values()], min: 7, max: 7, alwaysAsk: true }, picked => {
                picked.forEach(c => L.send(c, "banished")); L.specialSummon(g, gc, o);
                g.addLog(`${o.name} Special Summons Rainbow Dark Dragon by banishing 7 DARK monsters!`);
            });
            return true;
        }
    });
    R.ignition("Rainbow Dark Dragon", {
        canActivate: (g, gc) => [...L.mons(gc.owner).filter(m => m !== gc), ...gc.owner.zone.graveyard].some(c => L.isMonster(c) && c.card.attribute === "DARK"),
        activate: (g, gc) => {
            const o = gc.owner, dark = [...L.mons(o).filter(m => m !== gc && m.card.attribute === "DARK"), ...o.zone.graveyard.filter(c => L.isMonster(c) && c.card.attribute === "DARK")];
            dark.forEach(c => L.send(c, "banished")); gc.modifiers.atk += 500 * dark.length;
            g.addLog(`Rainbow Dark Dragon banishes ${dark.length} DARK monster(s) and gains ${500 * dark.length} ATK!`);
            return true;
        }
    });

    // ---- Crystal Seer ---------------------------------------------------------------------------------------------------
    R.flip("Crystal Seer", (g, gc) => {
        const o = gc.owner, top = o.zone.deck.slice(0, 2);
        if (!top.length) return;
        g.addLog(`Crystal Seer excavates ${top.map(c => c.card.name).join(" and ")}.`);
        L.choose(g, o, { prompt: "Crystal Seer: add 1 of the excavated cards to your hand (the other goes to the bottom of the Deck)", candidates: top, min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            o.moveCard(c, "deck", "hand");
            top.filter(x => x !== c).forEach(x => { o.zone.deck.splice(o.zone.deck.indexOf(x), 1); o.zone.deck.push(x); });
            g.addLog(`${o.name} adds ${c.card.name} to their hand and puts the other card at the bottom of the Deck.`);
        });
    });

    // ---- Ancient City - Rainbow Ruins ---------------------------------------------------------------------------------------
    const CITY = "Ancient City - Rainbow Ruins";
    def(CITY, { aiUse: () => true }, (g, gc) => g.addLog("Ancient City - Rainbow Ruins is active: its effects grow with the number of Crystal Beast cards in your Spell & Trap Zone."));
    R.destroyProtection(CITY, (g, gc) => cbInST(gc.owner).length >= 1);
    R.battleDamageReducer(CITY, (g, src, player, amount) => {
        if (player !== src.owner || cbInST(src.owner).length < 2 || src._halvedTurn === g.turn) return amount;
        src._halvedTurn = g.turn; g.addLog("Ancient City - Rainbow Ruins halves the battle damage."); return Math.floor(amount / 2);
    });
    R.quickEffect(CITY, {
        timing: (g, gc, mode) => (mode === "idle" ? turnPlayerMain(g, gc) : mode === "chain"),
        canActivate: (g, gc, top) => {
            const n = cbInST(gc.owner).length;
            if (top) return n >= 3 && !top.negated && top.meta && (top.meta.kind === "spell" || top.meta.kind === "trap") && L.mons(gc.owner).some(isCB);
            return (n >= 4 && gc._drawTurn !== g.turn && gc.owner.zone.deck.length > 0) || (n >= 5 && gc._summonTurn !== g.turn && gc.owner.getFreeMonsterSlot() !== -1);
        },
        costChoice: (g, gc, mode) => (mode === "chain" ? { prompt: "Ancient City: send 1 \"Crystal Beast\" monster you control to the Graveyard", min: 1, max: 1, onField: true, alwaysAsk: true,
            candidates: (gm, c) => L.mons(c.owner).filter(isCB), pay: (gm, c, [m]) => { m._noReplace = true; L.send(m, "graveyard"); } } : null),
        resolve: (g, gc, link) => {
            if (link.mode === "chain") {
                const t = link.respondsTo; if (!t) return;
                t.negated = true; g.addLog(`Ancient City negates ${t.gc.card.name}'s activation!`);
                if (t.gc.location === "spellTrap" || t.gc.location === "field") L.destroy(g, t.gc);
                return;
            }
            const o = gc.owner, n = cbInST(o).length;
            const canDraw = n >= 4 && gc._drawTurn !== g.turn && o.zone.deck.length > 0;
            const canSS = n >= 5 && gc._summonTurn !== g.turn && o.getFreeMonsterSlot() !== -1;
            const doDraw = () => { gc._drawTurn = g.turn; o.drawCard(1); g.addLog(`${o.name} draws 1 card with Ancient City - Rainbow Ruins.`); };
            const doSS = () => L.choose(g, o, { prompt: "Ancient City: Special Summon 1 \"Crystal Beast\" card from your Spell & Trap Zone", candidates: cbInST(o), min: 1, max: 1, alwaysAsk: true }, ([c]) => { gc._summonTurn = g.turn; L.specialSummon(g, c, o); });
            if (canDraw && canSS) g.requestOption(o, { prompt: "Ancient City - Rainbow Ruins: choose an effect", options: [{ id: "draw", label: "Draw 1 card" }, { id: "ss", label: "Special Summon 1 Crystal Beast from your Spell & Trap Zone" }], aiPick: () => "ss", onChoose: id => (id === "draw" ? doDraw() : doSS()) });
            else if (canDraw) doDraw(); else if (canSS) doSS();
        }
    });

    // ---- Rainbow Neos (Fusion) ---------------------------------------------------------------------------------------------------
    R.fusion("Rainbow Neos", { materials: ["Elemental HERO Neos", ULTIMATE], method: "polymerization" });
    R.ignition("Rainbow Neos", {
        canActivate: (g, gc) => !gc.state.hasUsedEffectThisTurn,
        activate: (g, gc) => {
            const o = gc.owner, you = foe(g, gc), opts = [];
            if (L.mons(o).length && L.mons(you).length) opts.push({ id: "mon", label: "Send 1 monster you control to the GY; shuffle all monsters your opponent controls into the Deck" });
            if (L.sts(o).length && L.sts(you).length) opts.push({ id: "st", label: "Send 1 Spell/Trap you control to the GY; shuffle all Spells/Traps your opponent controls into the Deck" });
            if (o.zone.deck.length && you.zone.graveyard.length) opts.push({ id: "gy", label: "Send the top card of your Deck to the GY; shuffle your opponent's Graveyard into the Deck" });
            if (!opts.length) return false;
            gc.state.hasUsedEffectThisTurn = true;
            g.requestOption(o, { prompt: "Rainbow Neos: choose 1 effect", options: opts, aiPick: () => opts[0].id, onChoose: id => {
                const finish = () => { you.shuffleDeck(); };
                if (id === "mon") L.choose(g, o, { prompt: "Send 1 monster you control to the Graveyard", candidates: L.mons(o), min: 1, max: 1, onField: true, alwaysAsk: true, aiPick: (gm, c) => [L.worst(gm, c)] }, ([m]) => { L.send(m, "graveyard"); L.mons(you).forEach(intoDeck); finish(); });
                else if (id === "st") L.choose(g, o, { prompt: "Send 1 Spell/Trap you control to the Graveyard", candidates: L.sts(o), min: 1, max: 1, onField: true, alwaysAsk: true }, ([c]) => { L.send(c, "graveyard"); L.sts(you).forEach(intoDeck); finish(); });
                else { L.send(o.zone.deck[0], "graveyard"); you.zone.graveyard.slice().forEach(c => you.moveCard(c, "graveyard", "deck")); finish(); }
                g.addLog("Rainbow Neos shuffles cards into the opponent's Deck!");
            } });
            return true;
        }
    });
    R.unpartial("Rainbow Neos");
}
module.exports = { install };
