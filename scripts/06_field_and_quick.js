/**
 * scripts/06_field_and_quick.js
 * Cards that needed new engine rules: Field Zone cards, Draw Phase triggers, and Quick Effects of
 * face-up Continuous Spell/Trap Cards.
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;

    // ======================= The Seal of Orichalcos (Field Spell) =======================
    const SEAL = "The Seal of Orichalcos";
    R.spellTrap(SEAL, {
        kind: "spell", subtype: "field", window: "main", aiUse: () => false,
        condition: (g, gc) => !gc.owner.sealActivated
    }, (g, gc) => {
        const o = gc.owner;
        o.sealActivated = true;                                   // "once per Duel"
        const ss = L.mons(o).filter(m => m.state.summonType === "special");
        L.destroyAll(g, ss);
        g.addLog(`The Seal of Orichalcos is activated: ${ss.length} Special Summoned monster(s) ${o.name} controls are destroyed. ${o.name} cannot Special Summon from the Extra Deck.`);
    });
    R.continuous(SEAL, (g, src, t) => (t.owner === src.owner ? { atk: 500 } : null));
    // "Once per turn, this card cannot be destroyed by card effects."
    R.destroyProtection(SEAL, (g, gc) => {
        if (gc.owner._sealShieldTurn === g.turn) return false;
        gc.owner._sealShieldTurn = g.turn;
        g.addLog("The Seal of Orichalcos cannot be destroyed by card effects this turn.");
        return true;
    });
    // "While you control 2 or more face-up Attack Position monsters, your opponent cannot target your monster(s) with the lowest ATK for an attack."
    R.attackShield(SEAL, (g, src, target) => {
        if (target.owner !== src.owner || target.location !== "monster") return false;
        const mine = L.mons(src.owner);
        if (mine.filter(m => m.faceUp && m.position === "attack").length < 2) return false;
        const low = Math.min(...mine.map(m => g.getAtk(m)));
        return g.getAtk(target) === low;
    });

    // ======================= Heart of the Underdog =======================
    const HEART = "Heart of the Underdog";
    R.spellTrap(HEART, { kind: "spell", subtype: "continuous", window: "main", aiUse: () => true },
        (g, gc) => g.addLog("Heart of the Underdog is active: Normal Monsters drawn in the Draw Phase draw an extra card."));
    const isNormalMonster = c => L.isMonster(c) && /Normal/.test(c.card.type) && !/Effect|Ritual|Fusion|Synchro|XYZ|Link/.test(c.card.type);
    R.drawPhaseTrigger(HEART, (g, gc, drawn) => {
        const p = gc.owner;
        if (!isNormalMonster(drawn) || p.zone.deck.length === 0 || drawn.location !== "hand") return;
        g.requestOption(p, {
            prompt: `Heart of the Underdog: reveal ${drawn.card.name} to draw 1 more card?`, cards: [drawn],
            options: [{ id: "yes", label: "Reveal it and draw 1 card" }, { id: "no", label: "No" }], aiPick: () => "yes",
            onChoose: id => {
                if (id !== "yes") return;
                g.addLog(`${p.name} reveals ${drawn.card.name} and draws 1 more card with Heart of the Underdog.`);
                p.drawCard(1);
                const hand = p.zone.hand;
                g.triggerDrawPhaseEffects(p, hand[hand.length - 1]);      // a second Normal Monster chains again
            }
        });
    });

    // ======================= Ultimate Offering =======================
    // Activating the Continuous Trap just turns it face-up; its effect is a separate Quick Effect.
    const UO = "Ultimate Offering";
    R.spellTrap(UO, { kind: "trap", subtype: "continuous", window: "anytime", aiUse: () => false },
        (g, gc) => g.addLog(`Ultimate Offering is active: ${gc.owner.name} can pay 500 LP to Normal Summon/Set an additional monster.`));

    /** Could `p` Normal Summon (or Set) `gc` right now as an effect-granted summon? */
    const canExtra = (g, p, gc) => {
        if (!L.isMonster(gc) || gc.location !== "hand") return false;
        const req = g.getRequiredTributesForSummon(p, gc);
        const pool = p.getMonstersOnField().filter(m => !m.cannotBeTributed);
        if (pool.length < req.required) return false;
        const asSummon = g.canNormalSummon(gc, false, p, true);
        const asSet = !Effects.noSetMonster(gc.card.name) && g.canNormalSummon(gc, true, p, true);
        return asSummon || asSet;
    };
    L.canExtraNormalSummon = canExtra;

    /** The whole "Normal Summon/Set 1 monster" flow, every decision made by the player (pick, Summon or Set, Tributes). */
    function extraNormalSummon(g, p) {
        const cands = p.zone.hand.filter(c => canExtra(g, p, c));
        if (!cands.length) { g.addLog("There is no monster that can be Normal Summoned or Set."); return; }
        L.choose(g, p, {
            prompt: "Ultimate Offering: choose 1 monster to Normal Summon/Set", candidates: cands, min: 1, max: 1, alwaysAsk: true,
            aiPick: (gm, cs) => [cs.slice().sort((a, b) => (b.card.atk || 0) - (a.card.atk || 0))[0]]
        }, ([c]) => {
            const req = g.getRequiredTributesForSummon(p, c);
            const canSummon = g.canNormalSummon(c, false, p, true);
            const canSet = !Effects.noSetMonster(c.card.name) && g.canNormalSummon(c, true, p, true);
            const proceed = asSet => {
                const go = idxs => (asSet ? g.setMonster(c, idxs, { player: p, free: true }) : g.normalSummon(c, idxs, { player: p, free: true }));
                if (req.required === 0) { go([]); return; }
                const pool = p.getMonstersOnField().filter(m => !m.cannotBeTributed);
                L.choose(g, p, {
                    prompt: `Select ${req.required} monster(s) to Tribute for ${c.card.name}`, candidates: pool, min: req.required, max: req.required, onField: true, alwaysAsk: true,
                    aiPick: (gm, cs) => cs.slice().sort((a, b) => gm.getAtk(a) - gm.getAtk(b)).slice(0, req.required)
                }, picked => go(picked.map(m => m.zoneIndex)));
            };
            if (canSummon && canSet) {
                g.requestOption(p, { prompt: `${c.card.name}: Normal Summon or Set?`, cards: [c], options: [{ id: "summon", label: "Normal Summon" }, { id: "set", label: "Set" }], aiPick: () => "summon", onChoose: id => proceed(id === "set") });
            } else proceed(!canSummon);
        });
    }
    L.extraNormalSummon = extraNormalSummon;

    R.quickEffect(UO, {
        cost: { lp: 500 },
        // "During your Main Phase or your opponent's Battle Phase"
        timing: (g, gc, mode) => {
            if (mode === "idle") return g.currentPlayer === gc.owner && (g.phase === "m1" || g.phase === "m2");
            return g.currentPlayer !== gc.owner && g.phase === "battle";     // the attack window, the Battle Phase windows, and chains inside them
        },
        canActivate: (g, gc) => gc.owner.zone.hand.some(c => canExtra(g, gc.owner, c)),
        resolve: (g, gc) => extraNormalSummon(g, gc.owner)
    });
}
module.exports = { install };
