/**
 * scripts/40_crystal_beasts.js — the Crystal Beast package.
 *
 * Core mechanic: a destroyed face-up Crystal Beast is placed in its
 * owner's Spell & Trap Zone as a Continuous Spell instead of going to the
 * Graveyard (Effects.Registry.destroyReplacement), and other cards then
 * pick those "Crystal Beast cards" back out of the S/T Zone.
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;

    const isCB = gc => L.isMonster(gc) && L.nameHas(gc, "crystal beast") && !L.nameHas(gc, "advanced crystal beast");
    const isCBCard = gc => isCB(gc);
    const cbInST = p => L.sts(p).filter(isCB);
    const BASE = ["Sapphire Pegasus", "Amethyst Cat", "Emerald Tortoise", "Topaz Tiger", "Ruby Carbuncle", "Amber Mammoth", "Cobalt Eagle"];

    /** Place `gc` face-up in its owner's Spell & Trap Zone as a Continuous Spell. */
    function place(game, gc, owner) {
        owner = owner || gc.owner;
        if (owner.getFreeSpellTrapSlot() === -1) return false;
        const from = gc.location;
        owner.moveCard(gc, from, "spellTrap");
        gc.faceUp = true; gc.position = null;
        gc.modifiers.atk = 0; gc.modifiers.def = 0;
        gc.turnSet = null;
        game.recordFieldEvent("spell-activate", gc, { staysOnField: true, placed: true });
        game.addLog(`${owner.name} places ${gc.card.name} in the Spell & Trap Zone as a Continuous Spell.`);
        return true;
    }
    L.placeCB = place;

    const replace = (game, gc) => {
        const o = gc.owner;
        if (o.getFreeSpellTrapSlot() === -1) return false;
        game.addLog(`${gc.card.name} is destroyed — it is placed in the Spell & Trap Zone instead of the Graveyard.`);
        return place(game, gc, o);
    };
    BASE.forEach(n => R.destroyReplacement("Crystal Beast " + n, replace));
    R.destroyReplacement("Crystal Beast Rainbow Dragon", replace);

    // ---- Monsters ----------------------------------------------------------
    const sapphire = (game, gc) => {
        const o = gc.owner;
        const cands = [...o.zone.hand, ...o.zone.deck, ...o.zone.graveyard].filter(c => c !== gc && isCB(c));
        if (!cands.length || o.getFreeSpellTrapSlot() === -1) return;
        L.choose(game, o, { prompt: "Place 1 \"Crystal Beast\" in your Spell & Trap Zone", candidates: cands, min: 1, max: 1, optional: true, alwaysAsk: true }, ([c]) => {
            const from = c.location; place(game, c, o); if (from === "deck") o.shuffleDeck();
        });
    };
    sapphire.anySummon = true;
    R.onSummon("Crystal Beast Sapphire Pegasus", sapphire);

    const ruby = (game, gc) => {
        if (gc.state.summonType !== "special") return;
        const o = gc.owner;
        let n = 0;
        cbInST(o).forEach(c => { if (L.specialSummon(game, c, o)) n++; });
        if (n) game.addLog(`Crystal Beast Ruby Carbuncle Special Summons ${n} Crystal Beast(s) from the Spell & Trap Zone!`);
    };
    ruby.anySummon = true;
    R.onSummon("Crystal Beast Ruby Carbuncle", ruby);

    R.ignition("Crystal Beast Cobalt Eagle", {
        needsTarget: "custom",
        targets: (game, gc) => [...L.mons(gc.owner), ...L.sts(gc.owner)].filter(c => c.faceUp && isCB(c)),
        canActivate: (game, gc) => !gc.state.hasUsedEffectThisTurn && [...L.mons(gc.owner), ...L.sts(gc.owner)].some(c => c.faceUp && isCB(c)),
        activate: (game, gc, target) => {
            if (!target) return false;
            gc.state.hasUsedEffectThisTurn = true;
            const n = target.card.name;
            gc.owner.moveCard(target, target.location, "deck");
            gc.owner.zone.deck.splice(gc.owner.zone.deck.indexOf(target), 1);
            gc.owner.zone.deck.unshift(target);
            game.addLog(`Cobalt Eagle returns ${n} to the top of the Deck.`);
            return true;
        }
    });

    R.dynamic("Crystal Beast Topaz Tiger", (game, gc) => {
        const b = game.currentBattle;
        return (b && b.attacker === gc && b.target) ? { atk: 400, def: 0 } : { atk: 0, def: 0 };
    });

    R.ignition("Crystal Beast Emerald Tortoise", {
        needsTarget: "custom",
        targets: (game, gc) => L.mons(gc.owner).filter(m => m.state.hasAttackedThisTurn && m.position === "attack"),
        canActivate: (game, gc) => !gc.state.hasUsedEffectThisTurn && L.mons(gc.owner).some(m => m.state.hasAttackedThisTurn && m.position === "attack"),
        activate: (game, gc, target) => {
            if (!target) return false;
            gc.state.hasUsedEffectThisTurn = true;
            target.position = "defense";
            game.addLog(`Emerald Tortoise changes ${target.card.name} to Defense Position.`);
            return true;
        }
    });

    R.directAttacker("Crystal Beast Amethyst Cat", { halve: true });
    ["Amber Mammoth"].forEach(n => R.partial("Crystal Beast " + n, "The destruction replacement works; the attack-redirect effect is not implemented."));

    // ---- Spells --------------------------------------------------------------
    R.spellTrap("Crystal Bond", {
        kind: "spell", subtype: "normal", window: "main", aiUse: () => true,
        condition: (g, gc) => !gc.owner._crystalBondTurn || gc.owner._crystalBondTurn !== g.turn
            ? gc.owner.zone.deck.filter(isCB).length >= 1 : false
    }, (game, gc) => {
        const o = gc.owner; o._crystalBondTurn = game.turn;
        L.choose(game, o, { prompt: "Add 1 \"Crystal Beast\" monster to your hand", candidates: o.zone.deck.filter(isCB), min: 1, max: 1, alwaysAsk: true }, ([a]) => {
            o.moveCard(a, "deck", "hand"); game.addLog(`${o.name} adds ${a.card.name} to their hand.`);
            const others = o.zone.deck.filter(c => isCB(c) && c.card.name !== a.card.name);
            L.choose(game, o, { prompt: "Place 1 \"Crystal Beast\" with a different name in your Spell & Trap Zone", candidates: others, min: 1, max: 1, alwaysAsk: true }, ([b]) => {
                place(game, b, o); o.shuffleDeck();
            });
        });
    });

    R.spellTrap("Crystal Blessing", {
        kind: "spell", subtype: "normal", window: "main", aiUse: () => true,
        condition: (g, gc) => gc.owner.zone.graveyard.some(isCB) && gc.owner.getFreeSpellTrapSlot() !== -1
    }, (game, gc) => {
        const o = gc.owner;
        const room = Math.min(2, o.getFreeSpellTrapSlot() === -1 ? 0 : 5 - o.getSpellTrapsOnField().length);
        L.choose(game, o, { prompt: "Place up to 2 \"Crystal Beast\" monsters from your Graveyard", candidates: o.zone.graveyard.filter(isCB), min: 1, max: Math.max(1, room), alwaysAsk: true }, picked => {
            picked.forEach(c => place(game, c, o));
        });
    });

    R.spellTrap("Crystal Promise", {
        kind: "spell", subtype: "normal", window: "main", needsTarget: "custom",
        targets: (g, gc) => cbInST(gc.owner),
        condition: (g, gc) => cbInST(gc.owner).length > 0 && gc.owner.getFreeMonsterSlot() !== -1,
        aiTarget: (g, gc) => L.best({ getAtk: c => c.card.atk || 0 }, cbInST(gc.owner)),
        aiUse: () => true
    }, (game, gc, target) => {
        if (!target || target.location !== "spellTrap") return;
        L.specialSummon(game, target, gc.owner);
        game.addLog(`Crystal Promise Special Summons ${target.card.name}!`);
    });

    R.spellTrap("Crystal Beacon", {
        kind: "spell", subtype: "normal", window: "main", aiUse: () => true,
        condition: (g, gc) => cbInST(gc.owner).length >= 2 && gc.owner.zone.deck.some(isCB) && gc.owner.getFreeMonsterSlot() !== -1
    }, (game, gc) => {
        const o = gc.owner;
        if (cbInST(o).length < 2) return;
        L.choose(game, o, { prompt: "Special Summon 1 \"Crystal Beast\" from your Deck", candidates: o.zone.deck.filter(isCB), min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            L.specialSummon(game, c, o); o.shuffleDeck();
            game.addLog(`Crystal Beacon Special Summons ${c.card.name}!`);
        });
    });

    R.spellTrap("Golden Rule", {
        kind: "spell", subtype: "equip", window: "main", aiUse: () => true,
        condition: (g, gc) => !gc.owner._goldenRuleTurn || gc.owner._goldenRuleTurn !== g.turn
            ? gc.owner.zone.deck.filter(isCB).length >= 1 && gc.owner.getFreeSpellTrapSlot() !== -1 : false
    }, (game, gc) => {
        const o = gc.owner; o._goldenRuleTurn = game.turn;
        const names = new Set();
        L.choose(game, o, { prompt: "Place up to 2 \"Crystal Beast\" monsters from your Deck", candidates: o.zone.deck.filter(isCB), min: 1, max: 2, alwaysAsk: true }, picked => {
            picked.forEach(c => { if (place(game, c, o)) names.add(c.card.name); });
            o.shuffleDeck();
            const cands = [...o.zone.hand, ...o.zone.graveyard].filter(c => isCB(c) && !names.has(c.card.name));
            L.choose(game, o, { prompt: "Special Summon 1 \"Crystal Beast\" (different name) from your hand or Graveyard", candidates: cands, min: 1, max: 1, optional: true, alwaysAsk: true }, ([m]) => {
                if (!L.specialSummon(game, m, o)) return;
                gc.equippedTo = m.instanceId;
                gc.linkedRevert = () => { if (m.location === "monster") { L.destroy(game, m); game.addLog("Golden Rule left the field — its monster is destroyed."); } };
                game.addLog(`Golden Rule equips to ${m.card.name}.`);
            });
        });
    });

    R.spellTrap("Crystal Release", {
        kind: "spell", subtype: "equip", window: "main", needsTarget: "custom", aiUse: () => true,
        targets: (g, gc) => L.allMons(g).filter(m => m.faceUp && isCB(m)),
        aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(m => m.faceUp && isCB(m)))
    }, (game, gc, target) => {
        if (!target || target.location !== "monster") return;
        L.equip(game, gc, target, 800, 0);
    });
    R.partial("Crystal Release", "The +800 ATK equip works; placing a Crystal Beast when it is sent to the Graveyard is not implemented.");

    R.spellTrap("Rare Value", {
        kind: "spell", subtype: "normal", window: "main", aiUse: () => true,
        condition: (g, gc) => cbInST(gc.owner).length >= 2 && gc.owner.zone.deck.length >= 2
    }, (game, gc) => {
        const o = gc.owner, foe = L.opp(game, gc);
        // The OPPONENT picks which Crystal Beast card gets sent.
        L.choose(game, foe, { prompt: "Choose 1 of your opponent's \"Crystal Beast\" cards in their Spell & Trap Zone", candidates: cbInST(o), min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            L.send(c, "graveyard");
            game.addLog(`${o.name} sends ${c.card.name} to the Graveyard and draws 2 cards.`);
            o.drawCard(2);
        });
    });

    // ---- Traps ----------------------------------------------------------------
    R.spellTrap("Crystal Raigeki", {
        kind: "trap", subtype: "normal", window: "anytime", needsTarget: "custom",
        targets: (g, gc) => [...L.mons(L.opp(g, gc)), ...L.sts(L.opp(g, gc))],
        condition: (g, gc) => cbInST(gc.owner).length > 0,
        aiTarget: (g, gc) => L.best(g, L.mons(L.opp(g, gc))) || L.sts(L.opp(g, gc))[0] || null,
        aiUse: () => true
    }, (game, gc, target) => {
        const o = gc.owner;
        L.choose(game, o, { prompt: "Send 1 \"Crystal Beast\" card from your Spell & Trap Zone to the Graveyard", candidates: cbInST(o), min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            L.send(c, "graveyard");
            if (target && ["monster", "spellTrap"].includes(target.location)) {
                const n = target.card.name; L.destroy(game, target);
                game.addLog(`Crystal Raigeki destroys ${n}!`);
            }
        });
    });

    R.spellTrap("Crystal Boon", {
        kind: "trap", subtype: "normal", window: "anytime", aiUse: () => true,
        condition: (g, gc) => cbInST(gc.owner).length > 0 && gc.owner.getFreeMonsterSlot() !== -1
    }, (game, gc) => {
        const o = gc.owner;
        L.choose(game, o, { prompt: "Special Summon up to 2 \"Crystal Beast\" from your Spell & Trap Zone", candidates: cbInST(o), min: 1, max: Math.min(2, cbInST(o).length), alwaysAsk: true }, picked => {
            let gain = 0;
            picked.forEach(c => { const atk = c.card.atk || 0; if (L.specialSummon(game, c, o)) gain += atk; });
            if (gain) { o.lifePoints += gain; game.addLog(`Crystal Boon: ${o.name} gains ${gain} LP.`); }
        });
    });
    R.partial("Crystal Boon", "Special Summon + LP gain work; the Graveyard-banish excavation effect is not implemented.");

    R.spellTrap("Rainbow Life", {
        kind: "trap", subtype: "normal", window: "anytime", aiUse: (g, gc) => gc.owner.zone.hand.length > 0 && gc.owner.lifePoints <= 4000,
        condition: (g, gc) => gc.owner.zone.hand.length >= 1
    }, (game, gc) => {
        const o = gc.owner;
        L.choose(game, o, { prompt: "Discard 1 card", candidates: o.zone.hand.slice(), min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            L.send(c, "graveyard");
            game.lifeGainInstead = o; game.lifeGainTurn = game.turn;
            game.addLog(`Rainbow Life: this turn, ${o.name} gains Life Points instead of taking damage!`);
        });
    });

    // ---- Rainbow Dragon: Special Summoned from the hand with 7 different Crystal Beasts ----
    R.noNormalSummon("Rainbow Dragon");
    const distinctCB = p => new Set([...L.mons(p), ...L.sts(p), ...p.zone.graveyard].filter(isCB).map(c => c.card.name));
    R.handIgnition("Rainbow Dragon", {
        canActivate: (game, gc) => distinctCB(gc.owner).size >= 7 && gc.owner.getFreeMonsterSlot() !== -1,
        activate: (game, gc) => {
            L.specialSummon(game, gc, gc.owner);
            game.addLog(`${gc.owner.name} Special Summons Rainbow Dragon by gathering 7 different Crystal Beasts!`);
            gc.state.turnSummoned = game.turn;
            return true;
        }
    });
    R.ignition("Rainbow Dragon", {
        canActivate: (game, gc) => gc.state.turnSummoned !== game.turn && !gc.state.hasUsedEffectThisTurn && L.mons(gc.owner).some(m => m !== gc && m.faceUp && isCB(m)),
        activate: (game, gc) => {
            const cb = L.mons(gc.owner).filter(m => m !== gc && m.faceUp && isCB(m));
            gc.state.hasUsedEffectThisTurn = true;
            cb.forEach(m => { m._noReplace = true; L.send(m, "graveyard"); });
            gc.modifiers.atk += cb.length * 1000;
            game.addLog(`Rainbow Dragon sends ${cb.length} Crystal Beast(s) to the Graveyard and gains ${cb.length * 1000} ATK!`);
            return true;
        }
    });
    R.partial("Rainbow Dragon", "Summon condition and the ATK-gain effect work; the 'banish all Crystal Beasts to reset the field' effect is not implemented.");
}
module.exports = { install };
