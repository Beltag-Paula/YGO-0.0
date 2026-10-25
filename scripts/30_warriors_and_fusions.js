/**
 * scripts/30_warriors_and_fusions.js — Gilford / Jinzo / Time Wizard package.
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;

    // Gilford the Lightning: Tribute Summon with 3 (not Set); destroys all opposing monsters.
    R.altTributes("Gilford the Lightning", [3]);
    const gilford = (game, gc) => {
        if ((gc.state.tributeCount || 0) < 3) return;
        const foes = L.mons(L.opp(game, gc));
        L.destroyAll(game, foes);
        game.addLog(`Gilford the Lightning destroys all ${foes.length} monster(s) the opponent controls!`);
    };
    R.onSummon("Gilford the Lightning", gilford);

    R.trapNegater("Jinzo");

    // Panther Warrior: must Tribute 1 monster to declare an attack.
    R.attackCost("Panther Warrior", {
        canPay: (game, gc) => L.mons(gc.owner).some(m => m !== gc),
        pay: (game, gc) => {
            const t = L.worst(game, L.mons(gc.owner).filter(m => m !== gc));
            if (t) { L.destroy(game, t); game.addLog(`Panther Warrior Tributes ${t.card.name} to attack.`); game.cleanupOrphanedEquips(); }
        }
    });

    R.passive("Gearfried the Iron Knight", "Destroys any Equip Card equipped to it");
    R.partial("Gearfried the Iron Knight", "Works against Equip Spells with scripts; the older built-in equips (e.g. Horn of the Unicorn) are not covered.");

    R.secondAttack("Hayabusa Knight");

    // Time Wizard: coin toss (auto-called). Right: destroy opposing monsters. Wrong: destroy yours, take half their ATK.
    R.ignition("Time Wizard", {
        canActivate: (game, gc) => !gc.state.hasUsedEffectThisTurn,
        activate: (game, gc) => {
            gc.state.hasUsedEffectThisTurn = true;
            if (L.coin()) {
                const foes = L.mons(L.opp(game, gc));
                L.destroyAll(game, foes);
                game.addLog(`Time Wizard's coin toss: RIGHT! All ${foes.length} opposing monster(s) are destroyed!`);
            } else {
                const mine = L.mons(gc.owner);
                const total = mine.reduce((s, m) => s + game.getAtk(m), 0);
                L.destroyAll(game, mine);
                gc.owner.dealDamage(Math.floor(total / 2));
                game.addLog(`Time Wizard's coin toss: WRONG! ${gc.owner.name} loses their monsters and takes ${Math.floor(total / 2)} damage!`);
            }
            return true;
        }
    });

    // Cyber-Stein: pay 5000 LP, Special Summon a Fusion Monster from the Extra Deck.
    const fusionsIn = p => p.zone.extraDeck.filter(c => /Fusion/.test(c.card.type));
    R.ignition("Cyber-Stein", {
        canActivate: (game, gc) => gc.owner.lifePoints > 5000 && fusionsIn(gc.owner).length > 0 && gc.owner.getFreeMonsterSlot() !== -1,
        activate: (game, gc) => {
            const me = gc.owner;
            gc.owner.dealDamage(5000);
            game.addLog(`${me.name} pays 5000 LP to Cyber-Stein.`);
            L.choose(game, me, { prompt: "Special Summon 1 Fusion Monster from your Extra Deck", candidates: fusionsIn(me), min: 1, max: 1, alwaysAsk: true }, ([f]) => {
                L.specialSummon(game, f, me);
                game.addLog(`Cyber-Stein Special Summons ${f.card.name}!`);
            });
            return true;
        }
    });

    // Summoner of Illusions (Flip): Tribute 1 other monster, Special Summon a Fusion Monster, destroyed at End Phase.
    R.flip("Summoner of Illusions", (game, gc) => {
        const me = gc.owner;
        const others = L.mons(me).filter(m => m !== gc);
        if (!others.length || !fusionsIn(me).length) { game.addLog("Summoner of Illusions: nothing to Tribute or summon."); return; }
        L.choose(game, me, { prompt: "Tribute 1 other monster", candidates: others, min: 1, max: 1, alwaysAsk: true }, ([t]) => {
            L.destroy(game, t);
            L.choose(game, me, { prompt: "Special Summon 1 Fusion Monster", candidates: fusionsIn(me), min: 1, max: 1, alwaysAsk: true }, ([f]) => {
                if (!L.specialSummon(game, f, me)) return;
                game.addLog(`Summoner of Illusions Special Summons ${f.card.name}, but it will be destroyed at the End Phase.`);
                game.turnEffects.push(() => { if (f.location === "monster") { L.destroy(game, f); game.addLog(`${f.card.name} is destroyed.`); } });
            });
        });
    });

    // Fusion Monsters (Polymerization recipes)
    R.fusion("Black Skull Dragon", { materials: ["Summoned Skull", "Red-Eyes Black Dragon"], method: "polymerization" });
    R.fusion("Thousand Dragon", { materials: ["Time Wizard", "Baby Dragon"], method: "polymerization" });
    R.fusion("Giltia the D. Knight", { materials: ["Guardian of the Labyrinth", "Protector of the Throne"], method: "polymerization" });
    R.fusion("Flame Swordsman", { materials: ["Flame Manipulator", "Masaki the Legendary Swordsman"], method: "polymerization" });

    // Lord of D. is enforced inside Effects.isProtectedByLordOfD (used by every targeting check).
    R.passive("Lord of D.", "Neither player can target Dragon monsters on the field with card effects");

    // Grave Squirmer: destroyed by battle -> destroy 1 card on the field.
    R.gyTrigger("Grave Squirmer", (game, gc) => {
        if (!gc._destroyedByBattle) return;
        const cands = [...L.allMons(game), ...L.allSTs(game)];
        L.choose(game, gc.owner, { prompt: "Grave Squirmer: destroy 1 card on the field", candidates: cands, min: 1, max: 1, alwaysAsk: true }, ([t]) => {
            const n = t.card.name; L.destroy(game, t);
            game.addLog(`Grave Squirmer destroys ${n}!`);
        });
    });
}
module.exports = { install };
