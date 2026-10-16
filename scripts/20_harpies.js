/**
 * scripts/20_harpies.js — the Harpie Lady package.
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;
    const harpieLadiesOnField = game => L.allMons(game).filter(m => m.faceUp && L.isHarpieLady(m)).length;

    R.dynamic("Harpie's Pet Dragon", game => {
        const n = harpieLadiesOnField(game) * 300;
        return { atk: n, def: n };
    });

    R.noNormalSummon("Harpie Lady Sisters");

    R.passive("Cyber Harpie Lady", "Always treated as \"Harpie Lady\"");
    R.passive("Harpie Lady 2", "Always treated as \"Harpie Lady\"");
    R.partial("Harpie Lady 2", "The name alias works; negating the effects of Flip monsters it destroys is not implemented.");

    R.handIgnition("Harpie Queen", {
        canActivate: (game, gc) => gc.owner.zone.deck.some(c => L.is(c, "Harpies' Hunting Ground")),
        activate: (game, gc) => {
            gc.owner.moveCard(gc, "hand", "graveyard");
            game.addLog(`${gc.owner.name} discards Harpie Queen to add a card from their Deck.`);
            return L.addToHand(game, gc, c => L.is(c, "Harpies' Hunting Ground"), { prompt: "Add \"Harpies' Hunting Ground\" to your hand" });
        }
    });
    R.passive("Harpie Queen", "Name becomes \"Harpie Lady\" on the field/in the GY");

    // Harpie Harpist: when Normal Summoned, bounce 1 of your other Winged Beasts + 1 face-up opponent monster.
    const harpist = (game, gc) => {
        const me = gc.owner, foe = L.opp(game, gc);
        const mine = L.mons(me).filter(m => m !== gc && m.card.race === "Winged Beast");
        const theirs = L.mons(foe).filter(m => m.faceUp);
        if (!mine.length || !theirs.length) return;
        L.choose(game, me, { prompt: "Harpie Harpist: return 1 of your Winged Beasts to the hand", candidates: mine, min: 1, max: 1, optional: true, alwaysAsk: true }, ([a]) => {
            L.choose(game, me, { prompt: "Harpie Harpist: return 1 face-up opponent monster to the hand", candidates: theirs.filter(t => t.location === "monster"), min: 1, max: 1, alwaysAsk: true }, ([b]) => {
                L.send(a, "hand"); L.send(b, "hand");
                game.addLog(`Harpie Harpist returns ${a.card.name} and ${b.card.name} to the hand!`);
            });
        });
    };
    R.onSummon("Harpie Harpist", harpist);
    R.partial("Harpie Harpist", "The Normal Summon bounce works; the End Phase search from the Graveyard is not implemented.");

    // Harpie Dancer
    R.ignition("Harpie Dancer", {
        needsTarget: "custom",
        targets: (game, gc) => L.mons(gc.owner).filter(m => m.faceUp && m.card.attribute === "WIND"),
        canActivate: (game, gc) => !gc.state.hasUsedEffectThisTurn && L.mons(gc.owner).some(m => m.faceUp && m.card.attribute === "WIND"),
        activate: (game, gc, target) => {
            if (!target) return false;
            gc.state.hasUsedEffectThisTurn = true;
            const me = gc.owner;
            L.send(target, "hand");
            game.addLog(`Harpie Dancer returns ${target.card.name} to the hand.`);
            const mode = game.summonMode(me);
            if (mode) {
                const cands = me.zone.hand.filter(c => L.isMonster(c) && c.card.attribute === "WIND" && game.getRequiredTributesForSummon(me, c).required === 0 && game.canNormalSummon(c));
                L.choose(game, me, { prompt: "Normal Summon 1 WIND monster", candidates: cands, min: 1, max: 1, optional: true, alwaysAsk: true }, ([c]) => {
                    game.normalSummon(c, []);
                });
            }
            return true;
        }
    });

    // Harpie's Pet Baby Dragon
    const otherHarpies = (game, gc) => L.mons(gc.owner).filter(m => m !== gc && m.faceUp && L.isHarpie(m) && !L.is(m, "Harpie's Pet Baby Dragon")).length;
    R.dynamic("Harpie's Pet Baby Dragon", (game, gc) => (otherHarpies(game, gc) >= 2 ? { atk: gc.card.atk, def: gc.card.def } : { atk: 0, def: 0 }));
    R.ignition("Harpie's Pet Baby Dragon", {
        needsTarget: "custom",
        targets: (game, gc) => [...L.mons(L.opp(game, gc)), ...L.sts(L.opp(game, gc))],
        canActivate: (game, gc) => !gc.state.hasUsedEffectThisTurn && otherHarpies(game, gc) >= 3 && (L.mons(L.opp(game, gc)).length + L.sts(L.opp(game, gc)).length) > 0,
        activate: (game, gc, target) => {
            if (!target) return false;
            gc.state.hasUsedEffectThisTurn = true;
            const n = target.card.name; L.destroy(game, target);
            game.addLog(`Harpie's Pet Baby Dragon destroys ${n}!`);
            return true;
        }
    });
    R.partial("Harpie's Pet Baby Dragon", "The ATK/DEF doubling (2+) and destruction (3+) work; the 1+ rule restricting the opponent's attack targets is not implemented.");

    // Birdface
    R.gyTrigger("Birdface", (game, gc) => {
        if (!gc._destroyedByBattle) return;
        L.choose(game, gc.owner, { prompt: "Birdface: add 1 \"Harpie Lady\" from your Deck to your hand", candidates: gc.owner.zone.deck.filter(c => L.is(c, "Harpie Lady")), min: 1, max: 1, optional: true, alwaysAsk: true }, ([c]) => {
            gc.owner.moveCard(c, "deck", "hand"); gc.owner.shuffleDeck();
            game.addLog(`Birdface adds ${c.card.name} to ${gc.owner.name}'s hand.`);
        });
    });
}
module.exports = { install };
