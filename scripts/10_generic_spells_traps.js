/**
 * scripts/10_generic_spells_traps.js
 * Generic Spells/Traps used across several decks: removal, hand/deck
 * manipulation, stat tricks, simple equips.
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;
    const oppMons = (game, gc) => L.mons(L.opp(game, gc));

    // ---- Removal ----------------------------------------------------------
    R.spellTrap("Raigeki", {
        kind: "spell", subtype: "normal", window: "main",
        condition: (g, gc) => oppMons(g, gc).length > 0,
        aiUse: (g, gc) => oppMons(g, gc).length >= 1 && L.mons(gc.owner).length <= oppMons(g, gc).length + 1
    }, (game, gc) => {
        const foes = oppMons(game, gc);
        L.destroyAll(game, foes);
        game.addLog(`Raigeki destroys all ${foes.length} monster(s) ${L.opp(game, gc).name} controls!`);
    });

    R.spellTrap("Harpie's Feather Duster", {
        kind: "spell", subtype: "normal", window: "main",
        condition: (g, gc) => L.sts(L.opp(g, gc)).length > 0,
        aiUse: (g, gc) => L.sts(L.opp(g, gc)).length >= 1
    }, (game, gc) => {
        const foes = L.sts(L.opp(game, gc));
        L.destroyAll(game, foes);
        game.addLog(`Harpie's Feather Duster destroys all ${foes.length} Spell/Trap Card(s) the opponent controls!`);
    });

    R.spellTrap("Tribute to the Doomed", {
        kind: "spell", subtype: "normal", window: "main", needsTarget: "custom",
        targets: (g, gc) => L.allMons(g),
        condition: (g, gc) => gc.owner.zone.hand.filter(c => c !== gc).length >= 1 && L.allMons(g).length > 0,
        aiTarget: (g, gc) => L.best(g, oppMons(g, gc)),
        aiUse: (g, gc) => oppMons(g, gc).length > 0 && gc.owner.zone.hand.filter(c => c !== gc).length >= 2
    }, (game, gc, target) => {
        const owner = gc.owner;
        L.choose(game, owner, { prompt: "Discard 1 card (cost)", candidates: owner.zone.hand.slice(), min: 1, max: 1 }, ([cost]) => {
            owner.moveCard(cost, "hand", "graveyard");
            game.addLog(`${owner.name} discards ${cost.card.name} to Tribute to the Doomed.`);
            if (target && target.location === "monster") {
                const n = target.card.name;
                L.destroy(game, target);
                game.addLog(`Tribute to the Doomed destroys ${n}!`);
            }
        });
    });

    R.spellTrap("Twister", {
        kind: "spell", subtype: "quickplay", window: "anytime", needsTarget: "custom", cost: { lp: 500 },
        targets: (g, gc) => L.allSTs(g).filter(c => c.faceUp && c !== gc),
        aiTarget: (g, gc) => L.sts(L.opp(g, gc)).find(c => c.faceUp) || null,
        aiUse: () => true
    }, (game, gc, target) => {
        if (!target || target.location !== "spellTrap") return;
        const n = target.card.name;
        L.destroy(game, target);
        game.addLog(`Twister destroys ${n}!`);
    });

    // ---- Deck / hand manipulation ------------------------------------------
    R.spellTrap("Foolish Burial", {
        kind: "spell", subtype: "normal", window: "main",
        condition: (g, gc) => gc.owner.zone.deck.some(c => L.isMonster(c)),
        aiUse: () => true
    }, (game, gc) => {
        const o = gc.owner;
        L.choose(game, o, { prompt: "Send 1 monster from your Deck to the Graveyard", candidates: o.zone.deck.filter(c => L.isMonster(c)), min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            o.moveCard(c, "deck", "graveyard");
            game.addLog(`${o.name} sends ${c.card.name} from the Deck to the Graveyard.`);
        });
    });

    R.spellTrap("Hand Destruction", {
        kind: "spell", subtype: "normal", window: "main",
        condition: (g, gc) => gc.owner.zone.hand.filter(c => c !== gc).length >= 2,
        aiUse: (g, gc) => gc.owner.zone.hand.filter(c => c !== gc).length >= 3 && gc.owner.zone.deck.length > 6
    }, (game, gc) => {
        const me = gc.owner, foe = L.opp(game, gc);
        const discardFor = (p, then) => {
            const n = Math.min(2, p.zone.hand.length);
            if (n === 0) return then();
            L.choose(game, p, { prompt: `Send ${n} card(s) from your hand to the Graveyard`, candidates: p.zone.hand.slice(), min: n, max: n, alwaysAsk: true }, picked => {
                picked.forEach(c => p.moveCard(c, "hand", "graveyard"));
                game.addLog(`${p.name} sends ${picked.map(c => c.card.name).join(", ")} to the Graveyard.`);
                const drawn = picked.length;
                p._hdDraw = drawn;
                then();
            });
        };
        discardFor(me, () => discardFor(foe, () => {
            [me, foe].forEach(p => { const n = p._hdDraw || 0; p._hdDraw = 0; if (n) p.drawCard(n); });
            game.addLog("Each player draws as many cards as they sent.");
        }));
    });

    R.spellTrap("Elegant Egotist", {
        kind: "spell", subtype: "normal", window: "main",
        condition: (g, gc) => L.mons(gc.owner).some(m => m.faceUp && L.isHarpieLady(m)) && gc.owner.getFreeMonsterSlot() !== -1 &&
            [...gc.owner.zone.hand, ...gc.owner.zone.deck].some(c => L.is(c, "Harpie Lady", "Harpie Lady Sisters")),
        aiUse: () => true
    }, (game, gc) => {
        const o = gc.owner;
        const cands = [...o.zone.hand.filter(c => c !== gc), ...o.zone.deck].filter(c => L.is(c, "Harpie Lady", "Harpie Lady Sisters"));
        L.choose(game, o, { prompt: "Special Summon 1 \"Harpie Lady\" or \"Harpie Lady Sisters\"", candidates: cands, min: 1, max: 1 }, ([c]) => {
            const from = c.location;
            L.specialSummon(game, c, o);
            if (from === "deck") o.shuffleDeck();
            game.addLog(`${o.name} Special Summons ${c.card.name} with Elegant Egotist!`);
        });
    });

    R.spellTrap("Hysteric Sign", {
        kind: "spell", subtype: "normal", window: "main", aiUse: () => true,
        condition: (g, gc) => [...gc.owner.zone.deck, ...gc.owner.zone.graveyard].some(c => L.is(c, "Elegant Egotist"))
    }, (game, gc) => {
        const o = gc.owner;
        const cands = [...o.zone.deck, ...o.zone.graveyard].filter(c => L.is(c, "Elegant Egotist"));
        L.choose(game, o, { prompt: "Add 1 \"Elegant Egotist\" to your hand", candidates: cands, min: 1, max: 1 }, ([c]) => {
            const from = c.location;
            o.moveCard(c, from, "hand");
            if (from === "deck") o.shuffleDeck();
            game.addLog(`${o.name} adds Elegant Egotist to their hand.`);
        });
    });
    R.partial("Hysteric Sign", "The End Phase effect (adding up to 3 Harpie cards when it is in the GY) is not implemented.");

    // ---- Summons ------------------------------------------------------------
    R.spellTrap("Double Summon", {
        kind: "spell", subtype: "normal", window: "main", aiUse: (g, gc) => gc.owner.zone.hand.filter(c => c !== gc && g.canNormalSummon(c)).length >= 2
    }, (game, gc) => {
        gc.owner.extraNormalSummons = (gc.owner.extraNormalSummons || 0) + 1;
        game.addLog(`${gc.owner.name} may conduct 1 additional Normal Summon/Set this turn!`);
    });

    R.spellTrap("Ancient Rules", {
        kind: "spell", subtype: "normal", window: "main", needsTarget: "custom",
        targets: (g, gc) => gc.owner.zone.hand.filter(c => c !== gc && L.isMonster(c) && /Normal/.test(c.card.type) && (c.card.level || 0) >= 5),
        condition: (g, gc) => gc.owner.getFreeMonsterSlot() !== -1,
        aiTarget: (g, gc) => L.best(g, gc.owner.zone.hand.filter(c => c !== gc && L.isMonster(c) && /Normal/.test(c.card.type) && (c.card.level || 0) >= 5)),
        aiUse: () => true
    }, (game, gc, target) => {
        if (!target || target.location !== "hand") return;
        L.specialSummon(game, target, gc.owner);
        game.addLog(`${gc.owner.name} Special Summons ${target.card.name} with Ancient Rules!`);
    });

    // ---- Stat tricks ----------------------------------------------------------
    R.spellTrap("Shield & Sword", { kind: "spell", subtype: "normal", window: "main", aiUse: () => false }, (game) => {
        L.allMons(game).filter(m => m.faceUp).forEach(m => {
            const a = m.card.atk || 0, d = m.card.def || 0;
            L.tempStat(game, m, d - a, a - d);
        });
        game.addLog("Shield & Sword switches the original ATK and DEF of every face-up monster until the end of this turn!");
    });

    R.spellTrap("Graceful Dice", { kind: "spell", subtype: "normal", window: "main", condition: (g, gc) => L.mons(gc.owner).length > 0,
        aiUse: (g, gc) => L.mons(gc.owner).length >= 1 && gc.owner.zone.hand.length > 0 }, (game, gc) => {
        const n = L.die(), bonus = n * 100;
        L.mons(gc.owner).forEach(m => L.tempStat(game, m, bonus, bonus));
        game.addLog(`Graceful Dice rolls a ${n}! ${gc.owner.name}'s monsters gain ${bonus} ATK/DEF until the end of this turn.`);
    });

    R.spellTrap("Skull Dice", { kind: "trap", subtype: "normal", window: "anytime", aiUse: (g, gc) => oppMons(g, gc).length > 0 }, (game, gc) => {
        const n = L.die(), pen = n * 100;
        oppMons(game, gc).forEach(m => L.tempStat(game, m, -pen, -pen));
        game.addLog(`Skull Dice rolls a ${n}! ${L.opp(game, gc).name}'s monsters lose ${pen} ATK/DEF until the end of this turn.`);
    });

    R.spellTrap("Torrential Tribute", { kind: "trap", subtype: "normal", window: "summon", aiUse: (g, gc) => L.mons(L.opp(g, gc)).length >= L.mons(gc.owner).length },
        (game, gc) => {
            const all = L.allMons(game);
            L.destroyAll(game, all);
            game.addLog(`Torrential Tribute destroys all ${all.length} monsters on the field!`);
        });

    // ---- Equips -----------------------------------------------------------------
    const equipSpell = (name, filter, atk, def, extra) => {
        R.spellTrap(name, {
            kind: "spell", subtype: "equip", window: "main", needsTarget: "custom", aiUse: () => true,
            targets: (g, gc) => L.allMons(g).filter(m => m.faceUp && filter(m)),
            aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(m => m.faceUp && filter(m)))
        }, (game, gc, target) => {
            if (!target || target.location !== "monster") return;
            if (L.equip(game, gc, target, atk, def) === false) return;
            if (extra) extra(game, gc, target);
        });
    };
    equipSpell("Salamandra", m => m.card.attribute === "FIRE", 700, 0);
    equipSpell("Lightning Blade", m => m.card.race === "Warrior", 800, 0);
    R.continuous("Lightning Blade", (g, src, t) => (t.card.attribute === "WATER" ? { atk: -500, def: 0 } : null));
    equipSpell("Cyber Shield", m => L.is(m, "Harpie Lady", "Harpie Lady Sisters") || L.isHarpieLady(m), 500, 0);

    // ---- Continuous / Field -----------------------------------------------------
    R.spellTrap("Rising Air Current", { kind: "spell", subtype: "field", window: "main", aiUse: () => true }, (game, gc) => {
        game.addLog("Rising Air Current is now active: WIND monsters gain 500 ATK and lose 400 DEF.");
    });
    R.continuous("Rising Air Current", (g, src, t) => (t.card.attribute === "WIND" ? { atk: 500, def: -400 } : null));

    R.spellTrap("Harpies' Hunting Ground", { kind: "spell", subtype: "field", window: "main", aiUse: () => true }, (game) => {
        game.addLog("Harpies' Hunting Ground is now active: Winged Beast monsters gain 200 ATK/DEF.");
    });
    R.continuous("Harpies' Hunting Ground", (g, src, t) => (t.card.race === "Winged Beast" ? { atk: 200, def: 200 } : null));
    R.partial("Harpies' Hunting Ground", "The ATK/DEF boost works; the 'destroy a Spell/Trap when a Harpie Lady is summoned' trigger is not implemented.");

    R.spellTrap("Triangle Ecstasy Spark", {
        kind: "spell", subtype: "normal", window: "main",
        condition: (g, gc) => L.allMons(g).some(m => m.faceUp && L.is(m, "Harpie Lady Sisters")),
        aiUse: (g, gc) => L.mons(gc.owner).some(m => L.is(m, "Harpie Lady Sisters")) && L.mons(L.opp(g, gc)).length > 0
    }, (game, gc) => {
        L.allMons(game).filter(m => m.faceUp && L.is(m, "Harpie Lady Sisters")).forEach(m => {
            L.tempStat(game, m, 2700 - game.getAtk(m), 0);
        });
        game.trapLockTurn = game.turn; game.trapLockedPlayer = L.opp(game, gc);
        game.addLog("Triangle Ecstasy Spark: Harpie Lady Sisters become 2700 ATK, and the opponent cannot activate Traps this turn!");
    });
    R.partial("Triangle Ecstasy Spark", "The opponent's face-up Trap effects already on the field are not negated.");

    R.spellTrap("Hysteric Party", {
        kind: "trap", subtype: "continuous", window: "main",
        condition: (g, gc) => gc.owner.zone.hand.length >= 1 && gc.owner.zone.graveyard.some(c => L.is(c, "Harpie Lady")) && gc.owner.getFreeMonsterSlot() !== -1
    }, (game, gc) => {
        const o = gc.owner;
        L.choose(game, o, { prompt: "Discard 1 card (cost)", candidates: o.zone.hand.slice(), min: 1, max: 1, alwaysAsk: true }, ([cost]) => {
            o.moveCard(cost, "hand", "graveyard");
            const revived = [];
            o.zone.graveyard.filter(c => L.is(c, "Harpie Lady")).forEach(c => { if (L.specialSummon(game, c, o)) revived.push(c); });
            game.addLog(`Hysteric Party Special Summons ${revived.length} Harpie Lady!`);
            gc.linkedRevert = () => {
                revived.forEach(m => { if (m.location === "monster") L.destroy(game, m); });
                game.addLog("Hysteric Party left the field — the monsters it summoned are destroyed.");
            };
        });
    });
}
module.exports = { install };
