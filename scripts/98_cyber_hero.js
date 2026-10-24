/**
 * scripts/98_cyber_hero.js — Cyber Dragon and Elemental HERO cards that the generic text compiler cannot read.
 * Written from the card text; clauses the engine has no hook for are listed in R.partial notes.
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;
    const log = (g, m) => g.addLog(m);
    const foe = (g, gc) => L.opp(g, gc);
    const free = p => p.getFreeMonsterSlot() !== -1;
    const def = (name, extra, fn) => R.spellTrap(name, L.dbMeta(name, extra), fn);
    const isCyberDragon = c => L.isMonster(c) && L.is(c, "Cyber Dragon");
    const main = (g, gc) => g.currentPlayer === gc.owner && (g.phase === "m1" || g.phase === "m2");

    // ---- Cyber Dragon: Special Summon from hand if only the opponent controls a monster ----------------------------
    R.handIgnition("Cyber Dragon", {
        canActivate: (g, gc) => main(g, gc) && free(gc.owner) && L.mons(gc.owner).length === 0 && L.mons(foe(g, gc)).length > 0,
        activate: (g, gc) => { L.specialSummon(g, gc, gc.owner); log(g, `${gc.owner.name} Special Summons Cyber Dragon.`); return true; }
    });

    // ---- Photon Generator Unit / Attack Reflector Unit and the monsters they summon ---------------------------------
    def("Photon Generator Unit", {
        window: "anytime", aiUse: () => true,
        condition: (g, gc) => L.mons(gc.owner).filter(isCyberDragon).length >= 2 && [...gc.owner.zone.hand, ...gc.owner.zone.deck, ...gc.owner.zone.graveyard].some(c => L.is(c, "Cyber Laser Dragon"))
    }, (g, gc) => {
        const o = gc.owner;
        L.choose(g, o, { prompt: "Tribute 2 \"Cyber Dragon\"", candidates: L.mons(o).filter(isCyberDragon), min: 2, max: 2, onField: true, alwaysAsk: true, aiPick: (gm, c) => c.slice(0, 2) }, picked => {
            picked.forEach(c => { c._noReplace = true; L.send(c, "graveyard"); });
            const c = [...o.zone.hand, ...o.zone.deck, ...o.zone.graveyard].filter(x => L.is(x, "Cyber Laser Dragon"));
            if (c[0] && free(o)) { const z = c[0].location; L.specialSummon(g, c[0], o); if (z === "deck") o.shuffleDeck(); log(g, "Cyber Laser Dragon is Special Summoned!"); }
        });
    });
    def("Attack Reflector Unit", {
        aiUse: () => true,
        condition: (g, gc) => L.mons(gc.owner).some(isCyberDragon) && [...gc.owner.zone.hand, ...gc.owner.zone.deck].some(c => L.is(c, "Cyber Barrier Dragon"))
    }, (g, gc) => {
        const o = gc.owner;
        L.choose(g, o, { prompt: "Tribute 1 \"Cyber Dragon\"", candidates: L.mons(o).filter(isCyberDragon), min: 1, max: 1, onField: true, alwaysAsk: true }, ([t]) => {
            t._noReplace = true; L.send(t, "graveyard");
            const c = [...o.zone.hand, ...o.zone.deck].find(x => L.is(x, "Cyber Barrier Dragon"));
            if (c && free(o)) { const z = c.location; L.specialSummon(g, c, o); if (z === "deck") o.shuffleDeck(); log(g, "Cyber Barrier Dragon is Special Summoned!"); }
        });
    });
    R.noNormalSummon("Cyber Laser Dragon");
    R.ignition("Cyber Laser Dragon", {
        canActivate: (g, gc) => gc.faceUp && !gc.state.hasUsedEffectThisTurn && L.mons(foe(g, gc)).some(m => (m.card.atk || 0) >= g.getAtk(gc) || (m.card.def || 0) >= g.getAtk(gc)),
        activate: (g, gc) => {
            const c = L.mons(foe(g, gc)).filter(m => g.getAtk(m) >= g.getAtk(gc) || (m.card.def || 0) >= g.getAtk(gc));
            return L.choose(g, gc.owner, { prompt: "Destroy 1 monster with ATK or DEF equal to or higher than Cyber Laser Dragon's ATK", candidates: c, min: 1, max: 1, onField: true, alwaysAsk: true, aiPick: (gm, cs) => [L.best(gm, cs)] }, ([t]) => { gc.state.hasUsedEffectThisTurn = true; L.destroy(g, t); log(g, `Cyber Laser Dragon destroys ${t.card.name}.`); }) || true;
        }
    });
    R.partial("Cyber Laser Dragon", "Only \"Photon Generator Unit\" is meant to summon it; the engine's no-Normal-Summon rule stops other summons but a Special Summon by other effects is not blocked.");
    R.noNormalSummon("Cyber Barrier Dragon");
    R.attackHook("Cyber Barrier Dragon", (g, src, attacker) => {
        if (attacker.owner === src.owner || src.position !== "attack" || !src.faceUp || src.state._barrierTurn === g.turn) return;
        src.state._barrierTurn = g.turn; g.attackNegated = true; log(g, "Cyber Barrier Dragon negates the attack!");
    });
    R.partial("Cyber Barrier Dragon", "Negates the opponent's first attack each turn; other Special Summons are not blocked.");

    // ---- Small effects --------------------------------------------------------------------------------------------------------------
    R.directAttackWhen("Cyber Tutu", (g, gc) => { const m = L.mons(foe(g, gc)); return m.length > 0 && m.every(x => g.getAtk(x) > g.getAtk(gc)); });
    R.endPhaseTrigger("Cyber Archfiend", (g, gc) => { if (g.currentPlayer === gc.owner && gc.owner.zone.hand.length > 0) { log(g, "Cyber Archfiend is destroyed (cards in hand)."); L.destroy(g, gc); } });
    R.drawPhaseTrigger("Cyber Archfiend", (g, gc) => { if (g.currentPlayer === gc.owner && gc.owner.zone.hand.length <= 1 && gc.owner.zone.hand.length === 1) { /* hand had to be empty before the draw */ } });
    R.partial("Cyber Archfiend", "The End Phase destruction works; the extra Draw Phase draw when your hand is empty is not implemented.");

    def("HERO's Bond", {
        aiUse: () => true,
        condition: (g, gc) => L.allMons(g).some(m => m.faceUp && /hero/i.test(m.card.name)) && gc.owner.zone.hand.filter(c => c !== gc && L.isMonster(c) && /^elemental hero/i.test(c.card.name) && (c.card.level || 9) <= 4).length >= 1 && free(gc.owner)
    }, (g, gc) => {
        const o = gc.owner, c = o.zone.hand.filter(x => x !== gc && L.isMonster(x) && /^elemental hero/i.test(x.card.name) && (x.card.level || 9) <= 4);
        const n = Math.min(2, c.length, 5 - L.mons(o).length);
        L.choose(g, o, { prompt: "Special Summon 2 Level 4 or lower \"Elemental HERO\" monsters from your hand", candidates: c, min: n, max: n, alwaysAsk: true, aiPick: (gm, cs) => cs.slice(0, n) }, picked => picked.forEach(x => L.specialSummon(g, x, o)));
    });

    R.onSummon("Cyber Raider", Object.assign((g, gc) => {
        const eq = L.allSTs(g).filter(c => c.faceUp && c.equippedTo);
        if (!eq.length) return;
        L.choose(g, gc.owner, { prompt: "Cyber Raider: destroy 1 Equip Card on the field", candidates: eq, min: 1, max: 1, onField: true, alwaysAsk: true, aiPick: (gm, c) => [c.find(x => x.owner !== gc.owner) || c[0]] }, ([t]) => { L.destroy(g, t); log(g, `Cyber Raider destroys ${t.card.name}.`); });
    }, { anySummon: true }));
    R.partial("Cyber Raider", "Only the 'destroy an Equip Card' option is implemented (always chosen); equipping it to Cyber Raider is not.");

    R.noNormalSummon("Elemental HERO Neo Bubbleman");
    R.handIgnition("Elemental HERO Neo Bubbleman", {
        canActivate: (g, gc) => main(g, gc) && free(gc.owner) && L.mons(gc.owner).some(m => L.is(m, "Elemental HERO Bubbleman")) && gc.owner.zone.hand.some(c => L.is(c, "Metamorphosis")),
        activate: (g, gc) => {
            const o = gc.owner, b = L.mons(o).find(m => L.is(m, "Elemental HERO Bubbleman")), m = o.zone.hand.find(c => L.is(c, "Metamorphosis"));
            b._noReplace = true; L.send(b, "graveyard"); L.send(m, "graveyard");
            L.specialSummon(g, gc, o); log(g, "Elemental HERO Neo Bubbleman is Special Summoned!"); return true;
        }
    });
    R.partial("Elemental HERO Neo Bubbleman", "Summon condition works; destroying a monster that battles it at the end of the Damage Step and the Bubbleman name alias are not implemented.");
}
module.exports = { install };
