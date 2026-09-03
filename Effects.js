/**
 * Effects.js
 * A small library mapping specific card names to real gameplay behavior.
 * Every Spell/Trap card that ISN'T listed here can still be Set, but can't
 * be activated (the engine logs that no effect is programmed for it yet).
 *
 * meta fields:
 *   kind:     'spell' | 'trap'
 *   subtype:  'normal' | 'quickplay' | 'continuous' | 'equip'
 *   window:   'main'      -> only during your own Main Phase (1 or 2)
 *             'response'  -> ONLY during the Battle Response Window (traps
 *                            that react to an attack, e.g. Mirror Force)
 *             'anytime'   -> your Main Phase OR as a Battle Response
 *   needsTarget: 'monster' | 'spellTrap' | 'graveyardMonster' | undefined
 *   cost:     { lp: number } optional Life Point cost to pay on activation
 */

function normalize(name) {
    return (name || "").trim().toLowerCase();
}

const SPELL_TRAP_META = {
    "dark hole": { kind: "spell", subtype: "normal", window: "main" },
    "monster reborn": { kind: "spell", subtype: "normal", window: "main", needsTarget: "graveyardMonster" },
    "mystical space typhoon": { kind: "spell", subtype: "quickplay", window: "anytime", needsTarget: "spellTrap" },
    "premature burial": { kind: "spell", subtype: "equip", window: "main", needsTarget: "graveyardMonster", cost: { lp: 800 } },
    "de-fusion": { kind: "spell", subtype: "quickplay", window: "anytime" },
    "burst stream of destruction": { kind: "spell", subtype: "normal", window: "main" },
    "pot of greed": { kind: "spell", subtype: "normal", window: "main" },
    "dian keto the cure master": { kind: "spell", subtype: "normal", window: "main" },
    "fissure": { kind: "spell", subtype: "normal", window: "main" },
    "remove trap": { kind: "spell", subtype: "normal", window: "main", needsTarget: "spellTrap" },
    "de-spell": { kind: "spell", subtype: "normal", window: "main", needsTarget: "spellTrap" },
    "graceful charity": { kind: "spell", subtype: "normal", window: "main" },
    "card destruction": { kind: "spell", subtype: "normal", window: "main" },
    "heavy storm": { kind: "spell", subtype: "normal", window: "main" },
    "change of heart": { kind: "spell", subtype: "normal", window: "main", needsTarget: "monster" },
    "brain control": { kind: "spell", subtype: "normal", window: "main", needsTarget: "monster", cost: { lp: 800 } },
    "horn of the unicorn": { kind: "spell", subtype: "equip", window: "main", needsTarget: "monster" },
    "book of secret arts": { kind: "spell", subtype: "equip", window: "main", needsTarget: "monster" },
    "shrink": { kind: "spell", subtype: "quickplay", window: "anytime", needsTarget: "monster" },

    "trap hole": { kind: "trap", subtype: "normal", window: "anytime", needsTarget: "monster" },
    "mirror force": { kind: "trap", subtype: "normal", window: "response" },
    "negate attack": { kind: "trap", subtype: "normal", window: "response" },
    "magic cylinder": { kind: "trap", subtype: "normal", window: "response" },
    "spellbinding circle": { kind: "trap", subtype: "continuous", window: "anytime", needsTarget: "monster" },
    "shadow spell": { kind: "trap", subtype: "continuous", window: "anytime", needsTarget: "monster" },
    "call of the haunted": { kind: "trap", subtype: "continuous", window: "anytime", needsTarget: "graveyardMonster" },
    "reinforcements": { kind: "trap", subtype: "normal", window: "anytime", needsTarget: "monster" },
    "waboku": { kind: "trap", subtype: "normal", window: "response" }
};

// Give a monster a temporary ATK/DEF delta that automatically reverts at
// the activating player's next End Phase.
function tempStatBoost(game, target, atkDelta, defDelta, label) {
    target.modifiers.atk += atkDelta;
    target.modifiers.def += defDelta;
    game.turnEffects.push(() => {
        target.modifiers.atk -= atkDelta;
        target.modifiers.def -= defDelta;
        game.addLog(`${label} on ${target.card.name} wears off.`);
    });
}

// Change of Heart / Brain Control: take control of a monster until the
// End Phase, then automatically return it.
function temporaryControl(game, gc, target) {
    const newController = gc.owner;
    const originalOwner = target.owner;
    if (newController.getFreeMonsterSlot() === -1) {
        game.addLog(`⚠️ No free Monster Zone — ${gc.card.name} fizzles.`);
        return;
    }
    game.transferCard(target, originalOwner, "monster", newController, "monster");
    target.faceUp = true;
    game.turnEffects.push(() => {
        if (target.location === "monster" && newController.getMonstersOnField().includes(target)) {
            game.transferCard(target, newController, "monster", originalOwner, "monster");
            game.addLog(`${target.card.name} returns to ${originalOwner.name}'s control.`);
        }
    });
    game.addLog(`🔄 ${newController.name} takes control of ${target.card.name} until the End Phase!`);
}

const HANDLERS = {
    "dark hole": (game) => {
        const p1Mons = game.player1.zone.monster.filter(m => m);
        const p2Mons = game.player2.zone.monster.filter(m => m);
        [...p1Mons].forEach(m => game.player1.moveCard(m, "monster", "graveyard"));
        [...p2Mons].forEach(m => game.player2.moveCard(m, "monster", "graveyard"));
        game.addLog("💥 Dark Hole destroys every monster on the field!");
    },

    "monster reborn": (game, gc, target) => {
        if (!target) return;
        const controller = gc.owner;
        if (controller.getFreeMonsterSlot() === -1) {
            game.addLog("⚠️ No free Monster Zone — Monster Reborn fizzles.");
            return;
        }
        game.transferCard(target, target.owner, "graveyard", controller, "monster");
        target.faceUp = true;
        target.position = "attack";
        target.state.hasBeenSummonedThisTurn = true;
        target.state.hasAttackedThisTurn = false;
        game.addLog(`✨ ${controller.name} Special Summons ${target.card.name} from the Graveyard with Monster Reborn!`);
    },

    "mystical space typhoon": (game, gc, target) => {
        if (!target) return;
        const name = target.card.name;
        target.owner.moveCard(target, "spellTrap", "graveyard");
        game.addLog(`🌪️ Mystical Space Typhoon destroys ${name}!`);
    },

    "premature burial": (game, gc, target) => {
        if (!target) return;
        const controller = gc.owner;
        if (controller.getFreeMonsterSlot() === -1) {
            game.addLog("⚠️ No free Monster Zone — Premature Burial fizzles.");
            return;
        }
        game.transferCard(target, target.owner, "graveyard", controller, "monster");
        target.faceUp = true;
        target.position = "attack";
        target.state.hasBeenSummonedThisTurn = true;
        gc.equippedTo = target.instanceId;
        game.addLog(`⚰️ ${controller.name} pays 800 LP to Special Summon ${target.card.name} with Premature Burial!`);
    },

    "de-fusion": (game) => {
        game.addLog("De-Fusion has no valid Fusion Monster to target and fizzles.");
    },

    "burst stream of destruction": (game, gc) => {
        const opponent = gc.owner === game.player1 ? game.player2 : game.player1;
        const mons = opponent.zone.monster.filter(m => m);
        [...mons].forEach(m => opponent.moveCard(m, "monster", "graveyard"));
        game.addLog(`🐉 Burst Stream of Destruction obliterates all of ${opponent.name}'s monsters!`);
    },

    "pot of greed": (game, gc) => {
        gc.owner.drawCard(2);
        game.addLog(`📗 ${gc.owner.name} draws 2 cards with Pot of Greed!`);
    },

    "dian keto the cure master": (game, gc) => {
        gc.owner.lifePoints += 1000;
        game.addLog(`❤️ ${gc.owner.name} gains 1000 Life Points! (LP: ${gc.owner.lifePoints})`);
    },

    "fissure": (game, gc) => {
        const opponent = gc.owner === game.player1 ? game.player2 : game.player1;
        const mons = opponent.getMonstersOnField();
        if (mons.length === 0) {
            game.addLog("⚠️ Fissure has no target and fizzles.");
            return;
        }
        const weakest = mons.reduce((a, b) => (game.getAtk(a) <= game.getAtk(b) ? a : b));
        const name = weakest.card.name;
        opponent.moveCard(weakest, "monster", "graveyard");
        game.addLog(`🕳️ Fissure destroys ${name} (the lowest ATK monster)!`);
    },

    "remove trap": (game, gc, target) => {
        if (!target) return;
        if (!target.faceUp || !target.card.type.includes("Trap")) {
            game.addLog("⚠️ Remove Trap can only target a face-up Trap Card.");
            return;
        }
        const name = target.card.name;
        target.owner.moveCard(target, "spellTrap", "graveyard");
        game.addLog(`🗑️ Remove Trap destroys ${name}!`);
    },

    "de-spell": (game, gc, target) => {
        if (!target) return;
        const name = target.card.name;
        const isSpell = target.card.type.includes("Spell");
        if (!isSpell) {
            game.addLog(`De-Spell reveals ${target.faceUp ? name : "a set card"} — it isn't a Spell, so nothing else happens.`);
            target.faceUp = true;
            return;
        }
        target.owner.moveCard(target, "spellTrap", "graveyard");
        game.addLog(`🗑️ De-Spell destroys ${name}!`);
    },

    "graceful charity": (game, gc) => {
        const p = gc.owner;
        p.drawCard(3);
        const discarded = [];
        for (let i = 0; i < 2 && p.zone.hand.length > 0; i++) {
            const card = p.zone.hand[p.zone.hand.length - 1];
            discarded.push(card.card.name);
            p.moveCard(card, "hand", "graveyard");
        }
        game.addLog(`📗 ${p.name} draws 3 with Graceful Charity, then discards ${discarded.join(", ") || "nothing"}.`);
    },

    "card destruction": (game) => {
        [game.player1, game.player2].forEach(p => {
            const count = p.zone.hand.length;
            [...p.zone.hand].forEach(card => p.moveCard(card, "hand", "graveyard"));
            p.drawCard(count);
        });
        game.addLog("🔄 Card Destruction — both players discard their hands and draw back up!");
    },

    "heavy storm": (game) => {
        const p1ST = game.player1.getSpellTrapsOnField();
        const p2ST = game.player2.getSpellTrapsOnField();
        [...p1ST].forEach(c => game.player1.moveCard(c, "spellTrap", "graveyard"));
        [...p2ST].forEach(c => game.player2.moveCard(c, "spellTrap", "graveyard"));
        game.addLog("🌪️ Heavy Storm destroys every Spell/Trap Card on the field!");
    },

    "change of heart": (game, gc, target) => {
        if (!target) return;
        temporaryControl(game, gc, target);
    },

    "brain control": (game, gc, target) => {
        if (!target) return;
        temporaryControl(game, gc, target);
    },

    "horn of the unicorn": (game, gc, target) => {
        if (!target) return;
        tempStatBoostPermanent(game, target, 700, 700);
        gc.equippedTo = target.instanceId;
        game.addLog(`🦄 Horn of the Unicorn equips to ${target.card.name} (+700 ATK/DEF)!`);
    },

    "book of secret arts": (game, gc, target) => {
        if (!target) return;
        tempStatBoostPermanent(game, target, 300, 300);
        gc.equippedTo = target.instanceId;
        game.addLog(`📘 Book of Secret Arts equips to ${target.card.name} (+300 ATK/DEF)!`);
    },

    "shrink": (game, gc, target) => {
        if (!target) return;
        const half = -Math.floor(game.getAtk(target) / 2);
        tempStatBoost(game, target, half, 0, "Shrink");
        game.addLog(`📉 Shrink halves ${target.card.name}'s ATK until the End Phase!`);
    },

    "reinforcements": (game, gc, target) => {
        if (!target) return;
        tempStatBoost(game, target, 500, 0, "Reinforcements");
        game.addLog(`💪 Reinforcements gives ${target.card.name} +500 ATK until the End Phase!`);
    },

    "trap hole": (game, gc, target) => {
        if (!target) return;
        const name = target.card.name;
        target.owner.moveCard(target, "monster", "graveyard");
        game.addLog(`🕳️ Trap Hole swallows ${name}!`);
    },

    "mirror force": (game, gc) => {
        const attackingPlayer = game.pendingAttack.attacker.owner;
        const mons = attackingPlayer.zone.monster.filter(m => m && m.position === "attack");
        [...mons].forEach(m => attackingPlayer.moveCard(m, "monster", "graveyard"));
        game.addLog(`🛡️ Mirror Force destroys all of ${attackingPlayer.name}'s Attack Position monsters!`);
    },

    "negate attack": (game) => {
        game.attackNegated = true;
        game.forceEndBattlePhase = true;
        game.addLog("🚫 Negate Attack nullifies the attack and ends the Battle Phase!");
    },

    "magic cylinder": (game) => {
        game.attackNegated = true;
        game.reflectDamage = game.getAtk(game.pendingAttack.attacker);
        game.addLog("🔮 Magic Cylinder negates the attack and reflects its ATK back as damage!");
    },

    "waboku": (game, gc) => {
        game.preventBattleDamageFor = gc.owner;
        game.preventDestructionFor = gc.owner;
        game.addLog(`🙏 Waboku protects ${gc.owner.name} from all battle damage and destruction this turn!`);
    },

    "spellbinding circle": (game, gc, target) => {
        if (!target) return;
        target.modifiers.cannotAttack = true;
        target.modifiers.cannotChangePosition = true;
        gc.linkedTarget = target.instanceId;
        game.addLog(`🔗 Spellbinding Circle binds ${target.card.name} — it cannot attack or change position!`);
    },

    "shadow spell": (game, gc, target) => {
        if (!target) return;
        target.modifiers.atk -= 700;
        target.modifiers.def -= 700;
        target.modifiers.cannotAttack = true;
        target.modifiers.cannotChangePosition = true;
        gc.linkedTarget = target.instanceId;
        game.addLog(`⛓️ Shadow Spell chains down ${target.card.name} (-700 ATK/DEF) — it cannot attack or change position!`);
    },

    "call of the haunted": (game, gc, target) => {
        if (!target) return;
        const controller = gc.owner;
        if (controller.getFreeMonsterSlot() === -1) {
            game.addLog("⚠️ No free Monster Zone — Call of the Haunted fizzles.");
            return;
        }
        game.transferCard(target, target.owner, "graveyard", controller, "monster");
        target.faceUp = true;
        target.position = "attack";
        target.state.hasBeenSummonedThisTurn = true;
        gc.linkedTarget = target.instanceId;
        game.addLog(`👻 Call of the Haunted Special Summons ${target.card.name} from the Graveyard!`);
    }
};

// Permanent (equip-style) stat boost — no reversion, matches real Equip Spells.
function tempStatBoostPermanent(game, target, atkDelta, defDelta) {
    target.modifiers.atk += atkDelta;
    target.modifiers.def += defDelta;
}

function getMeta(cardName) {
    return SPELL_TRAP_META[normalize(cardName)] || null;
}

function activate(game, gc, target) {
    const handler = HANDLERS[normalize(gc.card.name)];
    if (!handler) {
        game.addLog(`${gc.card.name} activates, but has no programmed effect yet.`);
        return;
    }
    handler(game, gc, target);
}

module.exports = { getMeta, activate, normalize };
