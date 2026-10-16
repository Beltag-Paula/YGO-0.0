/**
 * scripts/05_yugi_kaiba_core.js
 *
 * The Spells, Traps and key monsters of the Yugi and Kaiba decks, written
 * against the card text in the database. These REPLACE the older
 * hand-written versions in Effects.js (the registry overwrites by name).
 *
 * Rules used throughout:
 *  - Anything the text says the player chooses (discard, Tribute, which Set
 *    card to look at...) goes through a choice window — never auto-picked.
 *  - Costs the player pays are `costChoice`s, paid at activation (before
 *    the opponent can respond); effects resolve when the Chain does.
 *  - A card that can't legally be activated is refused by checkActivation()
 *    (so the UI doesn't offer it): see each `condition`.
 */
"use strict";
const L = require("./_lib");

function install(Effects) {
    const R = Effects.Registry;
    const def = (name, kind, subtype, window, extra, handler) => R.spellTrap(name, { kind, subtype, window, ...extra }, handler);
    const foe = (g, gc) => L.opp(g, gc);
    const faceUp = c => c.faceUp;
    const stOnField = g => L.allSTs(g);

    /** Take control of `target` until the End Phase (it returns, or is destroyed if there is no room). */
    function takeControl(game, taker, target) {
        const original = target.owner;
        if (taker.getFreeMonsterSlot() === -1) return false;
        game.transferCard(target, original, "monster", taker, "monster");
        target.state.hasAttackedThisTurn = false;
        game.addLog(`${taker.name} takes control of ${target.card.name} until the End Phase.`);
        game.turnEffects.push(() => {
            if (target.location !== "monster" || target.owner !== taker) return;
            if (original.getFreeMonsterSlot() !== -1) game.transferCard(target, taker, "monster", original, "monster");
            else L.destroy(game, target);
        });
        return true;
    }
    const canBeNormalSummoned = c => L.isMonster(c) && !/Ritual|Fusion|Synchro|XYZ|Link|Token/.test(c.card.type) && !Effects.cannotBeNormalSummoned(c.card.name);

    // =================================================================================
    //  SPELLS
    // =================================================================================
    def("Dark Hole", "spell", "normal", "main", { condition: g => L.allMons(g).length > 0, aiUse: (g, gc) => L.mons(foe(g, gc)).length >= L.mons(gc.owner).length + 1 },
        (g) => { const all = L.allMons(g); L.destroyAll(g, all); g.addLog(`Dark Hole destroys all ${all.length} monsters on the field!`); });

    def("Pot of Greed", "spell", "normal", "main", { condition: (g, gc) => gc.owner.zone.deck.length >= 2, aiUse: () => true },
        (g, gc) => { gc.owner.drawCard(2); g.addLog(`${gc.owner.name} draws 2 cards.`); });

    def("Graceful Charity", "spell", "normal", "main", { condition: (g, gc) => gc.owner.zone.deck.length >= 3, aiUse: () => true }, (g, gc) => {
        const o = gc.owner;
        o.drawCard(3);
        g.addLog(`${o.name} draws 3 cards.`);
        const n = Math.min(2, o.zone.hand.length);
        L.choose(g, o, { prompt: "Graceful Charity: discard 2 cards", candidates: o.zone.hand.slice(), min: n, max: n, alwaysAsk: true }, picked => {
            picked.forEach(c => L.send(c, "graveyard"));
            g.addLog(`${o.name} discards ${picked.map(c => c.card.name).join(" and ")}.`);
        });
    });

    def("Card Destruction", "spell", "normal", "main", { aiUse: (g, gc) => gc.owner.zone.hand.length <= 2 && gc.owner.zone.hand.length < foe(g, gc).zone.hand.length + 1 }, (g, gc) => {
        const players = [gc.owner, foe(g, gc)], counts = new Map();
        players.forEach(p => { const n = p.zone.hand.length; counts.set(p, n); p.zone.hand.slice().forEach(c => p.moveCard(c, "hand", "graveyard")); });
        players.forEach(p => { const n = counts.get(p); if (n) p.drawCard(n); });
        g.addLog(`Both players discard their hands and draw the same number (${players.map(p => `${p.name}: ${counts.get(p)}`).join(", ")}).`);
    });

    def("Dian Keto the Cure Master", "spell", "normal", "main", { aiUse: () => true }, (g, gc) => { gc.owner.lifePoints += 1000; g.addLog(`${gc.owner.name} gains 1000 LP.`); });

    def("Heavy Storm", "spell", "normal", "main", { condition: (g, gc) => stOnField(g).some(c => c !== gc), aiUse: (g, gc) => L.sts(foe(g, gc)).length > L.sts(gc.owner).length },
        (g, gc) => { const t = stOnField(g).filter(c => c !== gc); L.destroyAll(g, t); g.addLog(`Heavy Storm destroys ${t.length} Spell/Trap Card(s)!`); });

    def("Mystical Space Typhoon", "spell", "quickplay", "anytime", {
        needsTarget: "custom", targets: (g, gc) => stOnField(g).filter(c => c !== gc),
        aiTarget: (g, gc) => L.sts(foe(g, gc))[0] || null, aiUse: (g, gc) => L.sts(foe(g, gc)).length > 0
    }, (g, gc, t) => { if (t && t.location === "spellTrap") { const n = t.card.name; L.destroy(g, t); g.addLog(`Mystical Space Typhoon destroys ${n}!`); } });

    def("Remove Trap", "spell", "normal", "main", {
        needsTarget: "custom", targets: g => stOnField(g).filter(c => c.faceUp && /Trap/.test(c.card.type)),
        aiTarget: (g, gc) => L.sts(foe(g, gc)).find(c => c.faceUp && /Trap/.test(c.card.type)) || null, aiUse: () => true
    }, (g, gc, t) => { if (t && t.location === "spellTrap") { const n = t.card.name; L.destroy(g, t); g.addLog(`Remove Trap destroys ${n}!`); } });

    def("De-Spell", "spell", "normal", "main", {
        needsTarget: "custom", targets: g => stOnField(g).filter(c => (c.faceUp && /Spell/.test(c.card.type)) || !c.faceUp),
        aiTarget: (g, gc) => L.sts(foe(g, gc)).find(c => c.faceUp ? /Spell/.test(c.card.type) : true) || null, aiUse: () => true
    }, (g, gc, t) => {
        if (!t || t.location !== "spellTrap") return;
        const wasSet = !t.faceUp;
        if (wasSet) { t.faceUp = true; g.recordFieldEvent("flip", t); g.addLog(`De-Spell reveals the Set card: ${t.card.name}.`); }
        if (/Spell/.test(t.card.type)) { L.destroy(g, t); g.addLog(`De-Spell destroys ${t.card.name}!`); }
        else if (wasSet) { t.faceUp = false; g.addLog(`${t.card.name} is not a Spell — it is returned to its Set position.`); }
    });

    def("Fissure", "spell", "normal", "main", {
        condition: (g, gc) => L.mons(foe(g, gc)).some(faceUp), aiUse: () => true
    }, (g, gc) => {
        const fo = L.mons(foe(g, gc)).filter(faceUp);
        if (!fo.length) return;
        const low = Math.min(...fo.map(m => g.getAtk(m)));
        const ties = fo.filter(m => g.getAtk(m) === low);
        L.choose(g, gc.owner, { prompt: "Fissure: destroy the face-up monster with the lowest ATK", candidates: ties, min: 1, max: 1, onField: true }, ([m]) => {
            const n = m.card.name; L.destroy(g, m); g.addLog(`Fissure destroys ${n}!`);
        });
    });

    def("Shrink", "spell", "normal", "main", {
        needsTarget: "custom", targets: g => L.allMons(g).filter(faceUp),
        aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc)).filter(faceUp)), aiUse: (g, gc) => L.mons(foe(g, gc)).some(faceUp)
    }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        const cut = Math.floor((t.card.atk || 0) / 2);
        L.tempStat(g, t, -cut, 0); g.addLog(`Shrink halves ${t.card.name}'s original ATK until the end of the turn (-${cut}).`);
    });

    // ---- control ------------------------------------------------------------------
    def("Change of Heart", "spell", "normal", "main", {
        needsTarget: "custom", targets: (g, gc) => L.mons(foe(g, gc)),
        condition: (g, gc) => gc.owner.getFreeMonsterSlot() !== -1 && L.mons(foe(g, gc)).length > 0,
        aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc))), aiUse: (g, gc) => L.mons(foe(g, gc)).some(m => g.getAtk(m) >= 1800)
    }, (g, gc, t) => { if (t && t.location === "monster" && t.owner !== gc.owner) takeControl(g, gc.owner, t); });

    def("Brain Control", "spell", "normal", "main", {
        needsTarget: "custom", cost: { lp: 800 }, targets: (g, gc) => L.mons(foe(g, gc)).filter(m => m.faceUp && canBeNormalSummoned(m)),
        condition: (g, gc) => gc.owner.getFreeMonsterSlot() !== -1,
        aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc)).filter(m => m.faceUp && canBeNormalSummoned(m))), aiUse: (g, gc) => gc.owner.lifePoints > 3000
    }, (g, gc, t) => { if (t && t.location === "monster" && t.owner !== gc.owner) takeControl(g, gc.owner, t); });

    def("Enemy Controller", "spell", "quickplay", "anytime", {
        condition: (g, gc) => L.mons(foe(g, gc)).some(faceUp), aiUse: (g, gc) => L.mons(foe(g, gc)).some(m => m.faceUp && g.getAtk(m) >= 1800)
    }, (g, gc) => {
        const me = gc.owner, fo = L.mons(foe(g, gc)).filter(faceUp);
        const opts = [{ id: "position", label: "Change the battle position of 1 face-up opposing monster" }];
        if (L.mons(me).length >= 1) opts.push({ id: "control", label: "Tribute 1 monster, then take control of 1 face-up opposing monster until the End Phase" });
        g.requestOption(me, { prompt: "Enemy Controller: choose 1 effect", options: opts, aiPick: () => (L.mons(me).length && fo.length ? "control" : "position"), onChoose: id => {
            if (id === "position") {
                L.choose(g, me, { prompt: "Change the battle position of which monster?", candidates: L.mons(foe(g, gc)).filter(faceUp), min: 1, max: 1, onField: true, alwaysAsk: true }, ([t]) => {
                    t.position = t.position === "attack" ? "defense" : "attack"; g.addLog(`Enemy Controller changes ${t.card.name} to ${t.position.toUpperCase()} Position.`);
                });
            } else {
                L.choose(g, me, { prompt: "Tribute 1 monster", candidates: L.mons(me), min: 1, max: 1, onField: true, alwaysAsk: true, aiPick: (gm, c) => [L.worst(gm, c)] }, ([cost]) => {
                    cost._noReplace = true; L.send(cost, "graveyard"); g.addLog(`${me.name} Tributes ${cost.card.name}.`);
                    L.choose(g, me, { prompt: "Take control of which face-up monster?", candidates: L.mons(foe(g, gc)).filter(m => m.faceUp && !Effects.isProtectedByLordOfD(g, m, me)), min: 1, max: 1, onField: true, alwaysAsk: true, aiPick: (gm, c) => [L.best(gm, c)] }, ([t]) => takeControl(g, me, t));
                });
            }
        } });
    });

    def("Soul Exchange", "spell", "normal", "main", {
        needsTarget: "custom", targets: (g, gc) => L.mons(foe(g, gc)), condition: (g, gc) => L.mons(foe(g, gc)).length > 0,
        aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc))), aiUse: (g, gc) => L.mons(foe(g, gc)).some(m => g.getAtk(m) >= 2000) && gc.owner.zone.hand.some(c => L.isMonster(c) && (c.card.level || 0) >= 5)
    }, (g, gc, t) => {
        const me = gc.owner;
        if (!t || t.location !== "monster") return;
        me.soulExchange = { target: t, turn: g.turn };      // see MainGame.getSoulExchangeTarget
        me.noBattleTurn = g.turn;                           // "You cannot conduct your Battle Phase the turn you activate this card."
        g.addLog(`Soul Exchange: if ${me.name} Tributes a monster this turn, ${t.card.name} must be Tributed. ${me.name} cannot conduct their Battle Phase this turn.`);
    });

    def("Scapegoat", "spell", "quickplay", "anytime", {
        summons: true,
        condition: (g, gc) => gc.owner.zone.monster.filter(z => !z).length >= 4,
        aiUse: (g, gc) => g.phase === "m1" && L.mons(gc.owner).length === 0 && L.mons(foe(g, gc)).length > 0
    }, (g, gc) => {
        const me = gc.owner; let n = 0;
        for (let i = 0; i < 4; i++) {
            const tk = L.makeToken(g, me, { name: "Sheep Token", race: "Beast", attribute: "EARTH", atk: 0, def: 0, level: 1, position: "defense", desc: "Special Summoned by Scapegoat. Cannot be Tributed for a Tribute Summon." });
            if (tk) { tk.cannotBeTributed = true; n++; }
        }
        me.summonLockTurn = g.turn;
        g.addLog(`Scapegoat Special Summons ${n} Sheep Tokens in Defense Position! ${me.name} cannot Summon other monsters this turn (Normal Set is still allowed).`);
    });

    def("Cost Down", "spell", "normal", "main", {
        costChoice: { prompt: "Cost Down: discard 1 card (cost)", min: 1, max: 1, alwaysAsk: true, candidates: (g, gc) => gc.owner.zone.hand.filter(c => c !== gc), pay: (g, gc, [c]) => { L.send(c, "graveyard"); g.addLog(`${gc.owner.name} discards ${c.card.name} to Cost Down.`); } },
        condition: (g, gc) => gc.owner.zone.hand.some(c => c !== gc && L.isMonster(c)), aiUse: (g, gc) => gc.owner.zone.hand.some(c => L.isMonster(c) && (c.card.level || 0) >= 5)
    }, (g, gc) => {
        const p = gc.owner;
        p.costDownActive = true;
        g.turnEffects.push(() => { p.costDownActive = false; });
        g.addLog(`${p.name}: the Levels of all monsters in their hand are reduced by 2 for the rest of this turn.`);
    });

    // ---- equips ---------------------------------------------------------------------
    const equipDef = (name, test, atk, def_, extra) => def(name, "spell", "equip", "main", {
        needsTarget: "custom", targets: g => L.allMons(g).filter(m => m.faceUp && test(m)), aiUse: () => true,
        aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(m => m.faceUp && test(m))), ...extra
    }, (g, gc, t) => { if (t && t.location === "monster" && L.equip(g, gc, t, atk, def_) !== false && extra && extra.after) extra.after(g, gc, t); });
    equipDef("Book of Secret Arts", m => m.card.race === "Spellcaster", 300, 300);
    equipDef("Horn of the Unicorn", () => true, 700, 700, {
        after: (g, gc) => {
            const base = gc.linkedRevert;
            gc.linkedRevert = () => {
                if (base) base();
                // "When this card is sent from the field to the Graveyard: Return it to the top of the Deck."
                g.postActions.push(() => {
                    if (gc.location !== "graveyard") return;
                    gc.owner.moveCard(gc, "graveyard", "deck");
                    gc.owner.zone.deck.splice(gc.owner.zone.deck.indexOf(gc), 1);
                    gc.owner.zone.deck.unshift(gc);
                    g.addLog("Horn of the Unicorn returns to the top of the Deck.");
                });
            };
        }
    });
    def("Megamorph", "spell", "equip", "main", {
        needsTarget: "custom", targets: g => L.allMons(g).filter(faceUp), aiUse: () => true,
        aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(faceUp))
    }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        gc.equippedTo = t.instanceId;
        gc.linkedRevert = () => {};
        g.addLog(`Megamorph equips to ${t.card.name}: its ATK doubles while its controller's LP is lower, and halves while higher.`);
    });
    R.continuous("Megamorph", (g, src, t) => {
        if (src.equippedTo !== t.instanceId) return null;
        const me = t.owner, you = L.otherPlayer(g, me), orig = t.card.atk || 0;
        if (me.lifePoints < you.lifePoints) return { atk: orig };
        if (me.lifePoints > you.lifePoints) return { atk: -Math.floor(orig / 2) };
        return null;
    });

    // ---- summoning --------------------------------------------------------------------
    def("Monster Reborn", "spell", "normal", "main", {
        summons: true, needsTarget: "custom",
        targets: g => [...g.player1.zone.graveyard, ...g.player2.zone.graveyard].filter(L.isMonster),
        condition: (g, gc) => gc.owner.getFreeMonsterSlot() !== -1,
        aiTarget: (g, gc) => [...g.player1.zone.graveyard, ...g.player2.zone.graveyard].filter(L.isMonster).sort((a, b) => (b.card.atk || 0) - (a.card.atk || 0))[0] || null, aiUse: () => true
    }, (g, gc, t) => {
        if (!t || t.location !== "graveyard") return;
        if (L.specialSummon(g, t, gc.owner)) g.addLog(`${gc.owner.name} Special Summons ${t.card.name} with Monster Reborn!`);
    });

    def("Premature Burial", "spell", "equip", "main", {
        summons: true, needsTarget: "custom", cost: { lp: 800 },
        targets: (g, gc) => gc.owner.zone.graveyard.filter(L.isMonster), condition: (g, gc) => gc.owner.getFreeMonsterSlot() !== -1,
        aiTarget: (g, gc) => gc.owner.zone.graveyard.filter(L.isMonster).sort((a, b) => (b.card.atk || 0) - (a.card.atk || 0))[0] || null, aiUse: (g, gc) => gc.owner.lifePoints > 2500
    }, (g, gc, t) => {
        if (!t || t.location !== "graveyard") return;
        if (!L.specialSummon(g, t, gc.owner)) return;
        gc.equippedTo = t.instanceId;
        gc.linkedRevert = () => { if (t.location === "monster") { L.destroy(g, t); g.addLog("Premature Burial was destroyed — its monster is destroyed too."); } };
        g.addLog(`Premature Burial revives ${t.card.name} and equips to it.`);
    });

    def("De-Fusion", "spell", "quickplay", "anytime", {
        needsTarget: "custom", targets: g => L.allMons(g).filter(m => m.faceUp && /Fusion/.test(m.card.type)),
        aiTarget: () => null
    }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        const o = t.owner, me = gc.owner;
        o.moveCard(t, "monster", "extraDeck");
        g.addLog(`De-Fusion returns ${t.card.name} to the Extra Deck.`);
        const recipe = Effects.getFusionRecipe(t.card.name);
        if (!recipe) return;
        const pool = me.zone.graveyard.slice(), mats = [];
        for (const n of recipe.materials) { const f = pool.find(c => Effects.normalize(c.card.name) === Effects.normalize(n) && !mats.includes(c)); if (!f) return; mats.push(f); }
        if (me.zone.monster.filter(z => !z).length < mats.length) return;
        mats.forEach(m => L.specialSummon(g, m, me));
        g.addLog(`De-Fusion Special Summons ${mats.map(m => m.card.name).join(", ")} from the Graveyard.`);
    });

    def("Burst Stream of Destruction", "spell", "normal", "main", {
        condition: (g, gc) => L.mons(gc.owner).some(m => m.faceUp && L.is(m, "Blue-Eyes White Dragon")) && L.mons(foe(g, gc)).length > 0,
        aiUse: () => true
    }, (g, gc) => {
        const fo = L.mons(foe(g, gc)); L.destroyAll(g, fo);
        L.mons(gc.owner).filter(m => L.is(m, "Blue-Eyes White Dragon")).forEach(m => {
            m.modifiers.cannotAttack = true;
            g.turnEffects.push(() => { m.modifiers.cannotAttack = false; });
        });
        g.addLog(`Burst Stream of Destruction destroys ${fo.length} monster(s)! "Blue-Eyes White Dragon" cannot attack this turn.`);
    });

    // =================================================================================
    //  TRAPS
    // =================================================================================
    const holdTarget = (g, gc, t, apply, revert) => {
        apply(t);
        gc.linkedTarget = t.instanceId;
        gc.linkedRevert = () => { if (t.location === "monster") revert(t); };
    };
    def("Spellbinding Circle", "trap", "continuous", "anytime", {
        needsTarget: "custom", targets: (g, gc) => L.mons(foe(g, gc)), aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc))), aiUse: (g, gc) => L.mons(foe(g, gc)).length > 0
    }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        holdTarget(g, gc, t, m => { m.modifiers.cannotAttack = true; m.modifiers.cannotChangePosition = true; }, m => { m.modifiers.cannotAttack = false; m.modifiers.cannotChangePosition = false; });
        g.addLog(`Spellbinding Circle: ${t.card.name} cannot attack or change its battle position.`);
    });
    def("Shadow Spell", "trap", "continuous", "anytime", {
        needsTarget: "custom", targets: (g, gc) => L.mons(foe(g, gc)).filter(faceUp), aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc)).filter(faceUp)), aiUse: (g, gc) => L.mons(foe(g, gc)).some(faceUp)
    }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        holdTarget(g, gc, t, m => { m.modifiers.atk -= 700; m.modifiers.cannotAttack = true; m.modifiers.cannotChangePosition = true; }, m => { m.modifiers.atk += 700; m.modifiers.cannotAttack = false; m.modifiers.cannotChangePosition = false; });
        g.addLog(`Shadow Spell: ${t.card.name} loses 700 ATK and cannot attack or change its battle position.`);
    });
    def("Fiendish Chain", "trap", "continuous", "anytime", {
        needsTarget: "custom", targets: g => L.allMons(g).filter(m => m.faceUp && /Effect/.test(m.card.type)),
        aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc)).filter(m => m.faceUp && /Effect/.test(m.card.type))), aiUse: (g, gc) => L.mons(foe(g, gc)).some(m => m.faceUp && /Effect/.test(m.card.type))
    }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        holdTarget(g, gc, t, m => { m.modifiers.effectsNegated = true; m.modifiers.cannotAttack = true; }, m => { m.modifiers.effectsNegated = false; m.modifiers.cannotAttack = false; });
        g.addLog(`Fiendish Chain negates ${t.card.name}'s effects and stops it from attacking.`);
    });
    def("Call of the Haunted", "trap", "continuous", "anytime", {
        summons: true, needsTarget: "custom", targets: (g, gc) => gc.owner.zone.graveyard.filter(L.isMonster), condition: (g, gc) => gc.owner.getFreeMonsterSlot() !== -1,
        aiTarget: (g, gc) => gc.owner.zone.graveyard.filter(L.isMonster).sort((a, b) => (b.card.atk || 0) - (a.card.atk || 0))[0] || null,
        aiUse: (g, gc) => g.phase === "m1" || g.phase === "m2"
    }, (g, gc, t) => {
        if (!t || t.location !== "graveyard") return;
        if (!L.specialSummon(g, t, gc.owner)) return;
        gc.linkedTarget = t.instanceId;
        gc.linkedRevert = () => { if (t.location === "monster") { L.destroy(g, t); g.addLog("Call of the Haunted left the field — its monster is destroyed."); } };
        g.addLog(`Call of the Haunted revives ${t.card.name}!`);
    });

    def("Trap Hole", "trap", "normal", "summon", {
        needsTarget: "monster",
        condition: g => !!(g.summonResponse && g.summonResponse.summonedGc && g.getAtk(g.summonResponse.summonedGc) >= 1000),
        aiUse: () => true
    }, (g, gc, t) => { if (t && t.location === "monster") { const n = t.card.name; L.destroy(g, t); g.addLog(`Trap Hole destroys ${n}!`); } });

    def("Mirror Force", "trap", "normal", "response", { aiUse: (g, gc) => L.mons(foe(g, gc)).some(m => m.position === "attack") }, (g, gc) => {
        const t = L.mons(foe(g, gc)).filter(m => m.position === "attack"); L.destroyAll(g, t);
        g.addLog(`Mirror Force destroys ${t.length} Attack Position monster(s)!`);
    });
    def("Magic Cylinder", "trap", "normal", "response", { aiUse: () => true }, (g, gc) => {
        const a = g.pendingAttack && g.pendingAttack.attacker; if (!a) return;
        g.attackNegated = true; g.reflectDamage = g.getAtk(a);
        g.addLog(`Magic Cylinder negates the attack and reflects ${g.reflectDamage} damage to ${a.owner.name}!`);
    });
    def("Negate Attack", "trap", "normal", "response", { aiUse: () => true }, (g, gc) => {
        g.attackNegated = true; g.battlePhaseEnded = true;
        g.addLog("Negate Attack negates the attack and ends the Battle Phase!");
    });
    def("Waboku", "trap", "normal", "response", { aiUse: () => true }, (g, gc) => {
        g.preventBattleDamageFor = gc.owner; g.preventDestructionFor = gc.owner;
        g.addLog(`Waboku: ${gc.owner.name} takes no battle damage and their monsters can't be destroyed by battle this turn.`);
    });
    def("Reinforcements", "trap", "normal", "anytime", {
        needsTarget: "custom", targets: g => L.allMons(g).filter(faceUp), aiTarget: (g, gc) => L.best(g, L.mons(gc.owner).filter(faceUp)), aiUse: (g, gc) => g.phase === "battle" && L.mons(gc.owner).some(faceUp)
    }, (g, gc, t) => { if (t && t.location === "monster") { L.tempStat(g, t, 500, 0); g.addLog(`Reinforcements: ${t.card.name} gains 500 ATK until the end of the turn.`); } });

    def("Ring of Destruction", "trap", "normal", "anytime", {
        needsTarget: "custom",
        targets: (g, gc) => L.mons(foe(g, gc)).filter(m => m.faceUp && g.getAtk(m) <= foe(g, gc).lifePoints),
        condition: (g, gc) => g.currentPlayer !== gc.owner && gc.owner._ringTurn !== g.turn,
        aiTarget: (g, gc) => L.best(g, L.mons(foe(g, gc)).filter(m => m.faceUp && g.getAtk(m) <= foe(g, gc).lifePoints)),
        aiUse: (g, gc) => gc.owner.lifePoints > 4000
    }, (g, gc, t) => {
        if (!t || t.location !== "monster") return;
        const me = gc.owner, you = foe(g, gc), dmg = t.card.atk || 0, name = t.card.name;
        me._ringTurn = g.turn;
        L.destroy(g, t);
        me.dealDamage(dmg); you.dealDamage(dmg);
        g.addLog(`Ring of Destruction destroys ${name}: both players take ${dmg} damage!`);
    });

    def("Crush Card Virus", "trap", "normal", "anytime", {
        costChoice: {
            prompt: "Crush Card Virus: Tribute 1 DARK monster with 1000 or less ATK", min: 1, max: 1, onField: true, alwaysAsk: true,
            candidates: (g, gc) => L.mons(gc.owner).filter(m => m.faceUp && m.card.attribute === "DARK" && g.getAtk(m) <= 1000),
            pay: (g, gc, [m]) => { m._noReplace = true; L.send(m, "graveyard"); g.addLog(`${gc.owner.name} Tributes ${m.card.name} for Crush Card Virus.`); }
        },
        aiUse: (g, gc) => L.mons(foe(g, gc)).some(m => g.getAtk(m) >= 1500) || foe(g, gc).zone.hand.some(c => L.isMonster(c) && (c.card.atk || 0) >= 1500)
    }, (g, gc) => {
        const me = gc.owner, you = foe(g, gc);
        g.noDamage = { player: you, untilTurn: g.turn + 1 };
        g.addLog(`${you.name} takes no damage until the end of the next turn.`);
        const shown = [...you.zone.hand, ...L.mons(you)];
        const strong = c => (c.location === "hand" ? (c.card.atk || 0) : g.getAtk(c)) >= 1500;
        const finish = () => {
            const doomed = [...you.zone.hand.filter(c => L.isMonster(c) && strong(c)), ...L.mons(you).filter(strong)];
            doomed.forEach(c => { if (c.location === "hand") you.moveCard(c, "hand", "graveyard"); else L.destroy(g, c); });
            g.addLog(`Crush Card Virus destroys ${doomed.length} monster(s) with 1500+ ATK${doomed.length ? ": " + doomed.map(c => c.card.name).join(", ") : ""}.`);
            const deckStrong = you.zone.deck.filter(c => L.isMonster(c) && (c.card.atk || 0) >= 1500);
            if (deckStrong.length) {
                g.requestChoice(you, { prompt: "Crush Card Virus: you may destroy up to 3 monsters with 1500+ ATK in your Deck", candidates: deckStrong, min: 0, max: 3, optional: true,
                    onChoose: picked => { picked.forEach(c => you.moveCard(c, "deck", "graveyard")); if (picked.length) g.addLog(`${you.name} destroys ${picked.map(c => c.card.name).join(", ")} from their Deck.`); } });
            }
        };
        if (shown.length) g.requestOption(me, { prompt: `Crush Card Virus: ${you.name}'s hand and monsters`, options: [{ id: "ok", label: "Destroy the monsters with 1500+ ATK" }], cards: shown, onChoose: finish, aiPick: () => "ok" });
        else finish();
    });

    // =================================================================================
    //  MONSTERS
    // =================================================================================
    R.flip("Trap Master", (g, gc) => {
        const cands = stOnField(g);
        if (!cands.length) { g.addLog("Trap Master's FLIP effect: there is no Spell/Trap Card on the field."); return; }
        L.choose(g, gc.owner, {
            prompt: "Trap Master: select 1 Trap Card on the field", candidates: cands, min: 1, max: 1, onField: true, alwaysAsk: true,
            aiPick: (gm, c) => [c.find(x => x.owner !== gc.owner && !x.faceUp) || c.find(x => x.owner !== gc.owner) || c[0]]
        }, ([t]) => {
            const wasSet = !t.faceUp;
            if (wasSet) { t.faceUp = true; g.recordFieldEvent("flip", t); g.addLog(`Trap Master: the selected card is revealed — ${t.card.name}.`); }
            if (/Trap/.test(t.card.type)) { L.destroy(g, t); g.addLog(`Trap Master destroys ${t.card.name}!`); }
            else if (wasSet) { t.faceUp = false; g.addLog(`${t.card.name} is a Spell — it is returned to its Set position.`); }
            else g.addLog(`${t.card.name} is not a Trap Card — nothing happens.`);
        });
    });

    R.flip("Man-Eater Bug", (g, gc) => {
        const cands = L.allMons(g);
        L.choose(g, gc.owner, { prompt: "Man-Eater Bug: target 1 monster on the field; destroy it", candidates: cands, min: 1, max: 1, onField: true, alwaysAsk: true,
            aiPick: (gm, c) => [L.best(gm, c.filter(x => x.owner !== gc.owner)) || L.worst(gm, c)] }, ([t]) => {
            if (Effects.isProtectedByLordOfD(g, t, gc.owner)) { g.addLog(`${t.card.name} cannot be targeted.`); return; }
            const n = t.card.name; L.destroy(g, t); g.addLog(`Man-Eater Bug destroys ${n}!`);
        });
    });

    const gyThinner = (name, stat, label) => R.gyTrigger(name, (g, gc) => {
        const o = gc.owner;
        if (o._sanganTurn && o._sanganTurn[name] === g.turn) return;       // once per turn
        const cands = o.zone.deck.filter(c => L.isMonster(c) && (c.card[stat] || 0) <= 1500);
        if (!cands.length) return;
        o._sanganTurn = o._sanganTurn || {}; o._sanganTurn[name] = g.turn;
        L.choose(g, o, { prompt: `${name}: add 1 monster with 1500 or less ${label} from your Deck to your hand`, candidates: cands, min: 1, max: 1, alwaysAsk: true }, ([c]) => {
            o.moveCard(c, "deck", "hand"); o.shuffleDeck();
            o.nameLock = { turn: g.turn, names: [...(o.nameLock && o.nameLock.turn === g.turn ? o.nameLock.names : []), c.card.name] };
            g.addLog(`${name} adds ${c.card.name} to ${o.name}'s hand (cards with that name can't be activated this turn).`);
        });
    });
    gyThinner("Sangan", "atk", "ATK");
    gyThinner("Witch of the Black Forest", "def", "DEF");

    // Slifer / Obelisk
    ["Slifer the Sky Dragon", "Obelisk the Tormentor"].forEach(n => { R.tributesRequired(n, 3); R.noSet(n); R.noSummonResponse(n); });
    R.dynamic("Slifer the Sky Dragon", (g, gc) => { const n = gc.owner.zone.hand.length * 1000; return { atk: n, def: n }; });
    R.partial("Slifer the Sky Dragon", "ATK/DEF per card in hand, 3 Tributes and an un-negatable Summon work; the -2000 ATK effect on monsters Summoned to the opponent's field is not implemented.");
    R.untargetable("Obelisk the Tormentor");
    R.ignition("Obelisk the Tormentor", {
        canActivate: (g, gc) => !gc.state.hasUsedEffectThisTurn && L.mons(gc.owner).filter(m => m !== gc).length >= 2 && L.mons(foe(g, gc)).length > 0,
        activate: (g, gc) => {
            gc.state.hasUsedEffectThisTurn = true;
            L.choose(g, gc.owner, { prompt: "Obelisk: Tribute 2 monsters", candidates: L.mons(gc.owner).filter(m => m !== gc), min: 2, max: 2, onField: true, alwaysAsk: true, aiPick: (gm, c) => c.slice().sort((a, b) => gm.getAtk(a) - gm.getAtk(b)).slice(0, 2) }, picked => {
                picked.forEach(m => { m._noReplace = true; L.send(m, "graveyard"); });
                const fo = L.mons(foe(g, gc)); L.destroyAll(g, fo);
                gc.modifiers.cannotAttack = true; g.turnEffects.push(() => { gc.modifiers.cannotAttack = false; });
                g.addLog(`Obelisk: ${gc.owner.name} Tributes ${picked.map(m => m.card.name).join(" and ")} — all ${fo.length} opposing monsters are destroyed! Obelisk cannot attack this turn.`);
            });
            return true;
        }
    });
    R.partial("Obelisk the Tormentor", "The Special-Summon End Phase clause is not implemented (it can't be Special Summoned in these decks).");

    // Dark Paladin: Quick Effect — negate a Spell and destroy it.
    R.dynamic("Dark Paladin", g => {
        const n = [...L.allMons(g).filter(m => m.faceUp), ...g.player1.zone.graveyard, ...g.player2.zone.graveyard].filter(c => c.card.race === "Dragon").length * 500;
        return { atk: n, def: 0 };
    });
    R.quickEffect("Dark Paladin", {
        canActivate: (g, gc, top) => !!top && !top.negated && top.meta && top.meta.kind === "spell" && gc.owner.zone.hand.length >= 1,
        costChoice: { prompt: "Dark Paladin: discard 1 card (cost)", min: 1, max: 1, alwaysAsk: true, candidates: (g, gc) => gc.owner.zone.hand.slice(), pay: (g, gc, [c]) => { L.send(c, "graveyard"); g.addLog(`${gc.owner.name} discards ${c.card.name} to Dark Paladin.`); } },
        resolve: (g, gc, link) => {
            const t = link.respondsTo;
            if (!t) return;
            t.negated = true;
            g.addLog(`Dark Paladin negates ${t.gc.card.name}'s activation!`);
            if (["spellTrap"].includes(t.gc.location)) L.destroy(g, t.gc);
        }
    });
}
module.exports = { install };
