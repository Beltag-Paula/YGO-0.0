/**
 * scripts/99_deck_polish.js — closes the "not implemented" gaps in the cards of the shipped decks, using the
 * engine hooks added for it (graveEndPhase, onAnySummon, noGraveSummon, tributeFree).
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;
    const log = (g, m) => g.addLog(m);
    const foe = (g, gc) => L.opp(g, gc);

    // ---- Kaiba: the Cannons cannot be Special Summoned from the GY -------------------------------------------------
    ["XYZ-Dragon Cannon", "XY-Dragon Cannon", "XZ-Tank Cannon", "YZ-Tank Dragon"].forEach(n => { R.noGraveSummon(n); R.unpartial(n); });

    // ---- Slifer / Obelisk: End Phase self-send when Special Summoned; Slifer's -2000 ATK on summons ---------------
    ["Slifer the Sky Dragon", "Obelisk the Tormentor"].forEach(n => R.endPhaseTrigger(n, (g, gc) => {
        if (gc.state.summonType === "special" && g.currentPlayer === gc.owner) { log(g, `${gc.card.name} is sent to the Graveyard (it was Special Summoned).`); gc._noReplace = true; L.send(gc, "graveyard"); }
    }));
    R.unpartial("Obelisk the Tormentor");
    R.onAnySummon("Slifer the Sky Dragon", (g, src, summoned) => {
        if (summoned.owner === src.owner || summoned.position !== "attack") return;
        summoned.modifiers.atk -= 2000; log(g, `Slifer the Sky Dragon: ${summoned.card.name} loses 2000 ATK.`);
        if (g.getAtk(summoned) <= 0) { log(g, `${summoned.card.name}'s ATK is 0 — destroyed.`); L.destroy(g, summoned); }
    });
    R.unpartial("Slifer the Sky Dragon");

    // ---- Mai: Harpie Harpist / Hysteric Sign / Hunting Ground / Pet Baby Dragon / Harpie Lady 2 ---------------------
    R.graveEndPhase("Harpie Harpist", (g, gc, o) => {
        if (!o.sentThisTurn || gc.state.harpistUsed === g.turn) return;
        const me = gc.owner, c = me.zone.deck.filter(x => L.isMonster(x) && x.card.race === "Winged Beast" && x.card.level === 4 && (x.card.atk || 0) <= 1500);
        if (!c.length) return;
        L.choose(g, me, { prompt: "Harpie Harpist: add 1 Level 4 Winged Beast with 1500 or less ATK from your Deck to your hand", candidates: c, min: 1, max: 1, optional: true, alwaysAsk: true }, ([x]) => { if (x.location !== "deck") return; gc.state.harpistUsed = g.turn; me.moveCard(x, "deck", "hand"); me.shuffleDeck(); log(g, `Harpie Harpist adds ${x.card.name} to ${me.name}'s hand.`); });
    });
    R.unpartial("Harpie Harpist");
    R.graveEndPhase("Hysteric Sign", (g, gc, o) => {
        if (!o.sentThisTurn || gc.state.hystericUsed === g.turn) return;
        const me = gc.owner, byName = new Map();
        me.zone.deck.filter(x => /harpie/i.test(x.card.name)).forEach(x => { if (!byName.has(x.card.name)) byName.set(x.card.name, x); });
        if (!byName.size) return;
        L.choose(g, me, { prompt: "Hysteric Sign: add up to 3 \"Harpie\" cards with different names from your Deck to your hand", candidates: [...byName.values()], min: 1, max: Math.min(3, byName.size), optional: true, alwaysAsk: true, aiPick: (gm, c) => c.slice(0, 3) },
            picked => { picked = picked.filter(x => x.location === "deck"); if (!picked.length) return; gc.state.hystericUsed = g.turn; picked.forEach(x => me.moveCard(x, "deck", "hand")); me.shuffleDeck(); log(g, `Hysteric Sign adds ${picked.map(x => x.card.name).join(", ")} to ${me.name}'s hand.`); });
    });
    R.unpartial("Hysteric Sign");
    R.onAnySummon("Harpies' Hunting Ground", (g, src, summoned) => {
        if (!(L.is(summoned, "Harpie Lady") || L.is(summoned, "Harpie Lady Sisters") || L.isHarpieLady(summoned))) return;
        const who = summoned.owner, t = L.allSTs(g).filter(c => c !== src);
        if (!t.length) return;
        L.choose(g, who, { prompt: "Harpies' Hunting Ground: destroy 1 Spell/Trap on the field", candidates: t, min: 1, max: 1, onField: true, alwaysAsk: true, aiPick: (gm, c) => [c.find(x => x.owner !== who) || c[0]] },
            ([x]) => { log(g, `Harpies' Hunting Ground destroys ${x.card.name}.`); L.destroy(g, x); });
    });
    R.unpartial("Harpies' Hunting Ground");
    const otherHarpies = gc => L.mons(gc.owner).filter(m => m !== gc && m.faceUp && L.isHarpie(m) && !L.is(m, "Harpie's Pet Baby Dragon")).length;
    R.attackShield("Harpie's Pet Baby Dragon", (g, src, target, attacker) => !!attacker && attacker.owner !== src.owner && target.owner === src.owner && target !== src && L.isHarpie(target) && !L.is(target, "Harpie's Pet Baby Dragon") && otherHarpies(src) >= 1);
    R.unpartial("Harpie's Pet Baby Dragon");
    R.attackHook("Harpie Lady 2", (g, src, attacker, target) => {
        if (attacker !== src || !target || target.faceUp) return;
        target.modifiers.effectsNegated = true; g.turnEffects.push(() => { if (target.modifiers) target.modifiers.effectsNegated = false; });
        log(g, "Harpie Lady 2 negates the effect of the Flip monster it attacks.");
    });
    R.unpartial("Harpie Lady 2");

    // ---- Fairy Box: a Continuous Trap — each attack declaration the owner calls heads/tails --------------------------
    const tossFairy = (g, box, attacker) => {
        const me = box.owner;
        if (!attacker || attacker.owner === me || attacker.location !== "monster") return;
        g.requestOption(me, {
            prompt: `Fairy Box: call the coin toss for ${attacker.card.name}'s attack`,
            options: [{ id: "heads", label: "Heads" }, { id: "tails", label: "Tails" }],
            aiPick: () => (Math.random() < 0.5 ? "heads" : "tails"),
            onChoose: call => {
                const result = L.coin() ? "heads" : "tails";
                if (result === call) {
                    const cut = g.getAtk(attacker); L.tempStat(g, attacker, -cut, 0);
                    log(g, `Fairy Box: the coin lands ${result} — ${me.name} called it right! ${attacker.card.name}'s ATK becomes 0 until the end of the Battle Phase.`);
                } else log(g, `Fairy Box: the coin lands ${result} — ${me.name} called it wrong. The attack goes on.`);
            }
        });
    };
    R.spellTrap("Fairy Box", L.dbMeta("Fairy Box", { window: "response", aiUse: () => true }), (g, gc) => {
        const a = g.pendingAttack && g.pendingAttack.attacker;
        gc.state.fairyBoxActive = true;                     // from now on it triggers on every attack declaration
        tossFairy(g, gc, a);
    });
    R.attackHook("Fairy Box", (g, src, attacker) => { if (src.faceUp && src.state.fairyBoxActive && !(g.resolvingChainFor === src)) tossFairy(g, src, attacker); });
    R.standbyTrigger("Fairy Box", (g, gc) => { if (g.currentPlayer !== gc.owner) return; if (gc.owner.lifePoints > 500) { gc.owner.lifePoints -= 500; log(g, `${gc.owner.name} pays 500 LP to keep Fairy Box.`); } else { log(g, "Fairy Box is destroyed (500 LP not paid)."); L.destroy(g, gc); } });
    R.unpartial("Fairy Box");

    // ---- Hero Mask: pick the HERO to send, the target takes its NAME until the End Phase ------------------------------
    const isEHm = c => L.isMonster(c) && /^elemental hero/i.test(c.card.name);
    R.spellTrap("Hero Mask", L.dbMeta("Hero Mask", {
        needsTarget: "custom", aiUse: () => true,
        targets: (g, gc) => L.mons(gc.owner).filter(m => m.faceUp),
        aiTarget: (g, gc) => L.mons(gc.owner).filter(m => m.faceUp)[0] || null,
        condition: (g, gc) => gc.owner.zone.deck.some(isEHm) && L.mons(gc.owner).some(m => m.faceUp)
    }), (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        const o = gc.owner, byName = new Map();
        o.zone.deck.filter(isEHm).forEach(c => { if (!byName.has(c.card.name)) byName.set(c.card.name, c); });
        L.choose(g, o, { prompt: `Hero Mask: choose the "Elemental HERO" to send to the Graveyard — ${t.card.name} will take its name`, candidates: [...byName.values()], min: 1, max: 1, alwaysAsk: true,
            aiPick: (gm, c) => [c.find(x => /neos|wingman|avian|burstinatrix|bubbleman|sparkman|clayman|wildheart|bladedge/i.test(x.card.name)) || c[0]] }, ([x]) => {
            const newName = x.card.name; L.send(x, "graveyard");
            if (t.location !== "monster") return;
            const original = t.card;
            t._nameBackup = t._nameBackup || original;
            t.card = Object.assign(Object.create(Object.getPrototypeOf(original)), original, { name: newName });
            g.turnEffects.push(() => { if (t._nameBackup) { t.card = t._nameBackup; delete t._nameBackup; } });
            log(g, `Hero Mask: ${original.name}'s name becomes "${newName}" until the End Phase — it counts as that card for Fusion Materials and "Elemental HERO" effects.`);
        });
    });
    R.partial("Hero Mask", "The name change works (and counts for Fusion Materials / HERO checks), but the engine also reads card EFFECTS by name, so the monster briefly gains the new name's scripted effects too.");

    // ---- Bubbleman: say why the draw can't happen ---------------------------------------------------------------------
    const bubbleDraw = (g, gc) => {
        const o = gc.owner, others = L.mons(o).concat(L.sts(o)).filter(c => c !== gc).length + (o.zone.field ? 1 : 0);
        if (o.zone.hand.length > 0) return log(g, `Elemental HERO Bubbleman: no draw — ${o.name} still has ${o.zone.hand.length} card(s) in hand (the hand must be empty).`);
        if (others > 0) return log(g, `Elemental HERO Bubbleman: no draw — ${o.name} controls ${others} other card(s) (Bubbleman must be the only card you control).`);
    };
    const prevBubble = Effects.getOnSummon("Elemental HERO Bubbleman");
    const wrapped = (g, gc) => { bubbleDraw(g, gc); prevBubble(g, gc); };
    wrapped.anySummon = true; R.onSummon("Elemental HERO Bubbleman", wrapped);

    // ===================================================================================================================
    // GEMINI monsters (Normal Monsters until Gemini Summoned — see MainGame.geminiSummon). Written from the ● effect text.
    // ===================================================================================================================
    const free2 = p => p.getFreeMonsterSlot() !== -1;
    const once = (gc, g) => gc.state.geminiUsed !== g.turn;
    R.gemini("Goggle Golem", (g, gc) => { gc.modifiers.atk += 2100 - (gc.card.atk || 0); log(g, "Goggle Golem's ATK becomes 2100."); });
    R.gemini("Dawnbreak Gardna", (g, gc) => { gc.modifiers.def += 2300 - (gc.card.def || 0); log(g, "Dawnbreak Gardna's DEF becomes 2300."); });
    R.gemini("Phantom Dragonray Bronto", (g, gc) => { gc.modifiers.atk += 2300 - (gc.card.atk || 0); log(g, "Phantom Dragonray Bronto's ATK becomes 2300."); });
    R.attackHook("Phantom Dragonray Bronto", (g, src, attacker) => {
        if (attacker !== src || !src.state.geminiActive) return;
        g.turnEffects.push(() => { if (src.location === "monster" && src.faceUp) src.position = "defense"; });
    });
    R.partial("Phantom Dragonray Bronto", "ATK 2300 and the switch to Defense Position after attacking work (at the End Phase); the lock on changing its battle position is not implemented.");
    R.piercing("Gemini Lancer"); R.gemini("Gemini Lancer");
    R.secondAttack("Chthonian Emperor Dragon"); R.gemini("Chthonian Emperor Dragon");
    R.gemini("Aquarian Alessa");
    R.battleDestroyTrigger("Aquarian Alessa", (g, gc) => {
        if (!gc.state.geminiActive) return; const f = foe(g, gc), c = f.zone.hand[Math.floor(Math.random() * f.zone.hand.length)];
        if (c) { L.send(c, "graveyard"); log(g, `Aquarian Alessa: ${f.name} discards ${c.card.name} at random.`); }
    });
    R.gemini("Lucky Pied Piper");
    R.battleDestroyTrigger("Lucky Pied Piper", (g, gc) => { if (gc.state.geminiActive) { gc.owner.drawCard(1); log(g, `Lucky Pied Piper: ${gc.owner.name} draws 1 card.`); } });
    R.gemini("Infinity Dark");
    R.attackHook("Infinity Dark", (g, src, attacker) => {
        if (attacker !== src || !src.state.geminiActive) return;
        const c = L.mons(foe(g, src)).filter(m => m.faceUp); if (!c.length) return;
        L.choose(g, src.owner, { prompt: "Infinity Dark: change the battle position of 1 face-up monster your opponent controls", candidates: c, min: 1, max: 1, onField: true, optional: true, alwaysAsk: true, aiPick: (gm, cs) => [L.best(gm, cs)] },
            ([t]) => { t.position = t.position === "attack" ? "defense" : "attack"; log(g, `Infinity Dark changes ${t.card.name} to ${t.position} position.`); });
    });
    R.gemini("Ancient Gear Knight");
    R.partial("Ancient Gear Knight", "Registered as a Gemini monster; blocking the opponent's Spell/Trap Cards during its attack is not implemented.");
    R.gemini("Magical Reflect Slime");
    R.battleDamageReducer("Magical Reflect Slime", (g, src, player, amount) => {
        const b = g.currentBattle; if (!src.state.geminiActive || !b || !(b.attacker === src || b.target === src) || player !== src.owner) return amount;
        foe(g, src).dealDamage(amount); log(g, `Magical Reflect Slime: ${foe(g, src).name} takes the ${amount} battle damage instead!`); return 0;
    });
    R.gemini("Elemental HERO Neos Alius", (g, gc) => {
        const o = gc.card; gc._nameBackup2 = o;
        gc.card = Object.assign(Object.create(Object.getPrototypeOf(o)), o, { name: "Elemental HERO Neos" });
        log(g, "Elemental HERO Neos Alius's name becomes \"Elemental HERO Neos\" while on the field.");
    });
    R.partial("Elemental HERO Neos Alius", "The name change works; the engine then reads effects by the new name (Neos has none), and the original name is not restored when it leaves the field.");
    const summonFrom = (name, test, zonesOf, tie) => {
        R.gemini(name);
        R.ignition(name, {
            canActivate: (g, gc) => gc.faceUp && gc.state.geminiActive && once(gc, g) && free2(gc.owner) && zonesOf(g, gc).some(test),
            activate: (g, gc) => L.choose(g, gc.owner, { prompt: `${name}: Special Summon 1 monster`, candidates: zonesOf(g, gc).filter(test), min: 1, max: 1, alwaysAsk: true, aiPick: (gm, cs) => [L.best(gm, cs)] }, ([t]) => {
                gc.state.geminiUsed = g.turn; L.specialSummon(g, t, gc.owner); log(g, `${name} Special Summons ${t.card.name}.`);
                if (tie) { gc.state.summoned = (gc.state.summoned || []).concat(t); gc.linkedRevert = () => { (gc.state.summoned || []).forEach(m => { if (m.location === "monster") L.destroy(g, m); }); log(g, `${name} left the field — the monsters it summoned are destroyed.`); gc.state.summoned = []; }; }
            }) || true
        });
    };
    summonFrom("Gigaplant", m => L.isMonster(m) && (m.card.race === "Insect" || m.card.race === "Plant"), (g, gc) => [...gc.owner.zone.hand, ...gc.owner.zone.graveyard], false);
    summonFrom("Il Blud", m => L.isMonster(m) && m.card.race === "Zombie", (g, gc) => [...gc.owner.zone.hand, ...gc.owner.zone.graveyard, ...foe(g, gc).zone.graveyard], true);
    summonFrom("Doom Shaman", m => L.isMonster(m) && m.card.race === "Fiend", (g, gc) => [...gc.owner.zone.hand, ...gc.owner.zone.graveyard, ...foe(g, gc).zone.graveyard], true);
    R.gemini("Future Samurai");
    R.ignition("Future Samurai", {
        canActivate: (g, gc) => gc.faceUp && gc.state.geminiActive && once(gc, g) && gc.owner.zone.graveyard.some(L.isMonster) && L.allMons(g).some(m => m.faceUp && m !== gc),
        activate: (g, gc) => L.choose(g, gc.owner, { prompt: "Future Samurai: banish 1 monster from your Graveyard", candidates: gc.owner.zone.graveyard.filter(L.isMonster), min: 1, max: 1, alwaysAsk: true, aiPick: (gm, c) => [L.worst(gm, c)] }, ([cost]) => {
            const t = L.allMons(g).filter(m => m.faceUp && m !== gc && !Effects.isUntargetable(m.card.name));
            L.choose(g, gc.owner, { prompt: "Future Samurai: destroy 1 face-up monster", candidates: t, min: 1, max: 1, onField: true, alwaysAsk: true, aiPick: (gm, c) => [L.best(gm, c.filter(x => x.owner !== gc.owner)) || c[0]] }, ([x]) => { gc.state.geminiUsed = g.turn; L.send(cost, "banished"); L.destroy(g, x); log(g, `Future Samurai destroys ${x.card.name}.`); });
        }) || true
    });
    R.gemini("Blazewing Butterfly");
    R.ignition("Blazewing Butterfly", {
        canActivate: (g, gc) => gc.faceUp && gc.state.geminiActive && gc.owner.zone.graveyard.some(m => L.isMonster(m) && /Gemini/.test(m.card.type) && !L.is(m, "Blazewing Butterfly")),
        activate: (g, gc) => L.choose(g, gc.owner, { prompt: "Blazewing Butterfly: Special Summon 1 Gemini monster from your Graveyard", candidates: gc.owner.zone.graveyard.filter(m => L.isMonster(m) && /Gemini/.test(m.card.type) && !L.is(m, "Blazewing Butterfly")), min: 1, max: 1, alwaysAsk: true, aiPick: (gm, c) => [L.best(gm, c)] }, ([t]) => {
            gc._noReplace = true; L.send(gc, "graveyard"); log(g, "Blazewing Butterfly is Tributed.");
            if (L.specialSummon(g, t, gc.owner)) { Effects.geminiActivate(g, t); log(g, `${t.card.name} comes back as an Effect Monster.`); }
        }) || true
    });
    R.gemini("Dark Valkyria");
    R.partial("Dark Valkyria", "Registered as a Gemini monster only: its Spell Counter effects are not implemented (no Spell Counters in the engine yet).");
    R.gemini("Alien Hypno");
    R.partial("Alien Hypno", "Registered as a Gemini monster only: A-Counters and taking control are not implemented.");
}

/**
 * Fusion recipes for EVERY Fusion Monster whose text starts with named materials ("A" + "B" [+ "C"]) — including
 * the ones that already had a hand-written effect script (those were skipped by the generic recipe pass, so
 * Polymerization could not summon them: Flame Wingman, Wildedge, Mariner, Steam Healer ...) and Fusion
 * Monsters that only exist in the shipped decks (not in the card database).
 */
function installFusionRecipes(Effects) {
    const R = Effects.Registry, LocalCards = require("../LocalCards");
    const seen = new Map();
    for (const r of LocalCards.all()) { const c = LocalCards.toApiShape(r); if (/Fusion/.test(c.type)) seen.set(c.name, c.desc); }
    try {
        const D = require("../DeckInventory");
        for (const d of D.list()) { const dk = D.readDeck(d.id); for (const c of [...(dk.extraDeck || []), ...(dk.mainDeck || [])]) if (/Fusion/.test(c.type) && !seen.has(c.name)) seen.set(c.name, c.desc); }
    } catch (e) { /* no inventory yet */ }
    for (const [name, desc] of seen) {
        if (Effects.getFusionRecipe(name)) continue;
        const m = /^((?:"[^"]+"\s*\+\s*)+"[^"]+")/.exec((desc || "").trim());
        if (!m) continue;
        const materials = [...m[1].matchAll(/"([^"]+)"/g)].map(x => x[1]);
        R.fusion(name, { materials, method: "polymerization" });
        if (/cannot be Special Summoned by other ways/i.test(desc)) R.noSpecialSummon(name);
    }
}
module.exports = { install: e => { install(e); installFusionRecipes(e); } };
