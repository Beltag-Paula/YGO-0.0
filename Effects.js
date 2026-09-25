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
 *   cost:     { lp: number } optional Life Point cost to pay on activation,
 *             or { tributeMinAtk: number } — activation requires tributing
 *             one of your own field monsters with at least that much ATK.
 */

const { Card, GameCard } = require("./CardLogic.js");

function normalize(name) {
    return (name || "").trim().toLowerCase();
}

const SPELL_TRAP_META = {
    "dark hole": { kind: "spell", subtype: "normal", window: "main" },
    "monster reborn": { kind: "spell", subtype: "normal", window: "main", needsTarget: "graveyardMonster" },
    "mystical space typhoon": { kind: "spell", subtype: "quickplay", window: "anytime", needsTarget: "spellTrap" },
    "premature burial": { kind: "spell", subtype: "equip", window: "main", needsTarget: "graveyardMonster", cost: { lp: 800 } },
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

    "trap hole": { kind: "trap", subtype: "normal", window: "summon", needsTarget: "monster" },
    "mirror force": { kind: "trap", subtype: "normal", window: "response" },
    "negate attack": { kind: "trap", subtype: "normal", window: "response" },
    "magic cylinder": { kind: "trap", subtype: "normal", window: "response" },
    "spellbinding circle": { kind: "trap", subtype: "continuous", window: "anytime", needsTarget: "monster" },
    "shadow spell": { kind: "trap", subtype: "continuous", window: "anytime", needsTarget: "monster" },
    "call of the haunted": { kind: "trap", subtype: "continuous", window: "anytime", needsTarget: "graveyardMonster" },
    "reinforcements": { kind: "trap", subtype: "normal", window: "anytime", needsTarget: "monster" },
    "waboku": { kind: "trap", subtype: "normal", window: "response" },

    "polymerization": { kind: "spell", subtype: "normal", window: "main", needsTarget: "fusionMonster" },
    "de-fusion": { kind: "spell", subtype: "quickplay", window: "anytime", needsTarget: "monster" },
    "black luster ritual": { kind: "spell", subtype: "normal", window: "main", precheck: "ritual" },
    "black magic ritual": { kind: "spell", subtype: "normal", window: "main", precheck: "ritual" },
    "burst stream of destruction": { kind: "spell", subtype: "normal", window: "main", precheck: "controlsBlueEyes" },
    "ring of destruction": { kind: "trap", subtype: "normal", window: "anytime", needsTarget: "monster" },

    // --- Additional cards from the Yugi/Kaiba sample decks ---
    "dragon capture jar": { kind: "trap", subtype: "continuous", window: "anytime" },
    "ultimate offering": { kind: "trap", subtype: "continuous", window: "anytime" },
    "cost down": { kind: "spell", subtype: "normal", window: "main" },
    "enemy controller": { kind: "spell", subtype: "quickplay", window: "anytime", needsTarget: "monster" },
    "megamorph": { kind: "spell", subtype: "equip", window: "main", needsTarget: "monster" },
    "scapegoat": { kind: "spell", subtype: "normal", window: "main" },
    "soul exchange": { kind: "spell", subtype: "normal", window: "main", needsTarget: "monster" },
    "crush card virus": { kind: "trap", subtype: "normal", window: "anytime", cost: { tributeMinAtk: 1500 } },
    "fiendish chain": { kind: "trap", subtype: "continuous", window: "anytime", needsTarget: "monster" }
};

// Fusion Monster recipes actually present in the sample decks.
// method: 'polymerization' -> materials sent to GY when Polymerization resolves
//         'banish'         -> Special Summoned by banishing the materials directly (no Polymerization)
const FUSION_RECIPES = {
    "gaia the dragon champion": { materials: ["Gaia The Fierce Knight", "Curse of Dragon"], method: "polymerization" },
    "dark paladin": { materials: ["Dark Magician", "Buster Blader"], method: "polymerization" },
    "blue-eyes ultimate dragon": { materials: ["Blue-Eyes White Dragon", "Blue-Eyes White Dragon", "Blue-Eyes White Dragon"], method: "polymerization" },
    "rabid horseman": { materials: ["Battle Ox", "Mystic Horseman"], method: "polymerization" },
    "xyz-dragon cannon": { materials: ["X-Head Cannon", "Y-Dragon Head", "Z-Metal Tank"], method: "banish" },
    "xy-dragon cannon": { materials: ["X-Head Cannon", "Y-Dragon Head"], method: "banish" },
    "xz-tank cannon": { materials: ["X-Head Cannon", "Z-Metal Tank"], method: "banish" },
    "yz-tank dragon": { materials: ["Y-Dragon Head", "Z-Metal Tank"], method: "banish" }
};

// Ritual Monster recipes actually present in the sample decks.
const RITUAL_RECIPES = {
    "black luster ritual": { summons: "Black Luster Soldier", tributeLevel: 8 },
    "black magic ritual": { summons: "Magician of Black Chaos", tributeLevel: 8 }
};

// Give a monster a temporary ATK/DEF delta that automatically reverts at
// the activating player's next End Phase.
function tempStatBoost(game, target, atkDelta, defDelta, label) {
    target.modifiers.atk += atkDelta;
    target.modifiers.def += defDelta;
    game.turnEffects.push(() => {
        // BUGFIX: if `target` already left the Monster Zone before the
        // End Phase (destroyed in battle, tributed, etc.), Player.moveCard
        // already zeroed its modifiers out — subtracting this delta again
        // here would push it negative and leak a phantom debuff onto
        // whatever's now sitting in the Graveyard holding this same
        // GameCard object. Only revert while it's still the live thing
        // being boosted.
        if (target.location !== "monster") return;
        target.modifiers.atk -= atkDelta;
        target.modifiers.def -= defDelta;
        game.addLog(`${label} on ${target.card.name} wears off.`);
    });
}

// Change of Heart / Brain Control: take control of a monster until the
// End Phase, then automatically return it.
function temporaryControl(game, gc, target) {
    // BUGFIX: defensive guard matching the pattern used elsewhere in this
    // file (e.g. Trap Hole, Soul Exchange) — if whatever resolved
    // `target` handed back a card that isn't actually sitting in a
    // Monster Zone right now (already moved by an earlier step of this
    // same effect, or a stale reference), bail instead of crashing.
    if (!target || target.location !== "monster") {
        game.addLog(`${gc.card.name} has no valid monster to take control of and fizzles.`);
        return;
    }
    const newController = gc.owner;
    const originalOwner = target.owner;
    if (newController.getFreeMonsterSlot() === -1) {
        game.addLog(`No free Monster Zone — ${gc.card.name} fizzles.`);
        return;
    }
    game.transferCard(target, originalOwner, "monster", newController, "monster");
    target.faceUp = true;
    game.turnEffects.push(() => {
        if (target.location === "monster" && newController.getMonstersOnField().includes(target)) {
            // BUGFIX: the original owner's Monster Zone can fill up
            // between now and the End Phase (they can still Normal
            // Summon, Special Summon, etc. while this card is out of
            // their control) — transferCard would throw trying to add it
            // to a zone with no free slot. Real-rules-adjacent fallback:
            // if there's genuinely nowhere for it to go back to, it just
            // stays where it is under the current controller rather than
            // crashing the duel.
            if (originalOwner.getFreeMonsterSlot() === -1) {
                game.addLog(`${originalOwner.name} has no free Monster Zone — ${target.card.name} stays under ${newController.name}'s control.`);
                return;
            }
            game.transferCard(target, newController, "monster", originalOwner, "monster");
            game.addLog(`${target.card.name} returns to ${originalOwner.name}'s control.`);
        }
    });
    game.addLog(`${newController.name} takes control of ${target.card.name} until the End Phase!`);
}

const HANDLERS = {
    "dark hole": (game) => {
        const p1Mons = game.player1.zone.monster.filter(m => m);
        const p2Mons = game.player2.zone.monster.filter(m => m);
        [...p1Mons].forEach(m => game.player1.moveCard(m, "monster", "graveyard"));
        [...p2Mons].forEach(m => game.player2.moveCard(m, "monster", "graveyard"));
        game.addLog("Dark Hole destroys every monster on the field!");
    },

    "monster reborn": (game, gc, target) => {
        if (!target) return;
        const controller = gc.owner;
        if (controller.getFreeMonsterSlot() === -1) {
            game.addLog("No free Monster Zone — Monster Reborn fizzles.");
            return;
        }
        game.transferCard(target, target.owner, "graveyard", controller, "monster");
        target.faceUp = true;
        target.position = "attack";
        target.state.hasBeenSummonedThisTurn = true;
        target.state.hasAttackedThisTurn = false;
        game.addLog(`${controller.name} Special Summons ${target.card.name} from the Graveyard with Monster Reborn!`);
    },

    "mystical space typhoon": (game, gc, target) => {
        if (!target) return;
        const name = target.card.name;
        target.owner.moveCard(target, "spellTrap", "graveyard");
        game.addLog(`Mystical Space Typhoon destroys ${name}!`);
    },

    "premature burial": (game, gc, target) => {
        if (!target) return;
        const controller = gc.owner;
        if (controller.getFreeMonsterSlot() === -1) {
            game.addLog("No free Monster Zone — Premature Burial fizzles.");
            return;
        }
        game.transferCard(target, target.owner, "graveyard", controller, "monster");
        target.faceUp = true;
        target.position = "attack";
        target.state.hasBeenSummonedThisTurn = true;
        gc.equippedTo = target.instanceId;
        game.addLog(`${controller.name} pays 800 LP to Special Summon ${target.card.name} with Premature Burial!`);
    },

    "de-fusion": (game, gc, target) => {
        if (!target) return;
        if (!target.card.type.includes("Fusion")) {
            game.addLog("De-Fusion can only target a Fusion Monster.");
            return;
        }
        const owner = target.owner;
        const name = target.card.name;
        owner.moveCard(target, "monster", "extraDeck");
        game.addLog(`De-Fusion returns ${name} to the Extra Deck!`);
    },

    "polymerization": (game, gc, target) => {
        if (!target) return;
        const ok = game.fusionSummon(gc.owner, target.instanceId);
        if (!ok) game.addLog("Polymerization fizzles — the Fusion Summon failed.");
    },

    "black luster ritual": (game, gc) => {
        game.ritualSummon(gc.owner, gc);
    },

    "black magic ritual": (game, gc) => {
        game.ritualSummon(gc.owner, gc);
    },

    "pot of greed": (game, gc) => {
        gc.owner.drawCard(2);
        game.recordDraw([{ playerIsPlayer1: gc.owner === game.player1, count: 2 }]);
        game.addLog(`${gc.owner.name} draws 2 cards with Pot of Greed!`);
    },

    "dian keto the cure master": (game, gc) => {
        gc.owner.lifePoints += 1000;
        game.addLog(`${gc.owner.name} gains 1000 Life Points! (LP: ${gc.owner.lifePoints})`);
    },

    "fissure": (game, gc) => {
        const opponent = gc.owner === game.player1 ? game.player2 : game.player1;
        const mons = opponent.getMonstersOnField();
        if (mons.length === 0) {
            game.addLog("Fissure has no target and fizzles.");
            return;
        }
        const weakest = mons.reduce((a, b) => (game.getAtk(a) <= game.getAtk(b) ? a : b));
        const name = weakest.card.name;
        opponent.moveCard(weakest, "monster", "graveyard");
        game.addLog(`Fissure destroys ${name} (the lowest ATK monster)!`);
    },

    "remove trap": (game, gc, target) => {
        if (!target) return;
        if (!target.faceUp || !target.card.type.includes("Trap")) {
            game.addLog("Remove Trap can only target a face-up Trap Card.");
            return;
        }
        const name = target.card.name;
        target.owner.moveCard(target, "spellTrap", "graveyard");
        game.addLog(`Remove Trap destroys ${name}!`);
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
        game.addLog(`De-Spell destroys ${name}!`);
    },

    "graceful charity": (game, gc) => {
        const p = gc.owner;
        p.drawCard(3);
        game.recordDraw([{ playerIsPlayer1: p === game.player1, count: 3 }]);
        const discarded = [];
        for (let i = 0; i < 2 && p.zone.hand.length > 0; i++) {
            const card = p.zone.hand[p.zone.hand.length - 1];
            discarded.push(card.card.name);
            p.moveCard(card, "hand", "graveyard");
        }
        game.recordDiscard([{ playerIsPlayer1: p === game.player1, count: discarded.length }]);
        game.addLog(`${p.name} draws 3 with Graceful Charity, then discards ${discarded.join(", ") || "nothing"}.`);
    },

    "card destruction": (game) => {
        const discardEntries = [];
        const drawEntries = [];
        [game.player1, game.player2].forEach(p => {
            const count = p.zone.hand.length;
            [...p.zone.hand].forEach(card => p.moveCard(card, "hand", "graveyard"));
            discardEntries.push({ playerIsPlayer1: p === game.player1, count });
            p.drawCard(count);
            drawEntries.push({ playerIsPlayer1: p === game.player1, count });
        });
        game.recordDiscard(discardEntries);
        game.recordDraw(drawEntries);
        game.addLog("Card Destruction — both players discard their hands and draw back up!");
    },

    "heavy storm": (game, gc) => {
        // Exclude the Heavy Storm card itself — it's already sitting face-up
        // in the activator's Spell/Trap zone by the time this runs, and the
        // engine's own cleanup step sends it to the GY afterward.
        const p1ST = game.player1.getSpellTrapsOnField().filter(c => c.instanceId !== gc.instanceId);
        const p2ST = game.player2.getSpellTrapsOnField().filter(c => c.instanceId !== gc.instanceId);
        [...p1ST].forEach(c => game.player1.moveCard(c, "spellTrap", "graveyard"));
        [...p2ST].forEach(c => game.player2.moveCard(c, "spellTrap", "graveyard"));
        game.addLog("Heavy Storm destroys every Spell/Trap Card on the field!");
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
        game.addLog(`Horn of the Unicorn equips to ${target.card.name} (+700 ATK/DEF)!`);
    },

    "book of secret arts": (game, gc, target) => {
        if (!target) return;
        tempStatBoostPermanent(game, target, 300, 300);
        gc.equippedTo = target.instanceId;
        game.addLog(`Book of Secret Arts equips to ${target.card.name} (+300 ATK/DEF)!`);
    },

    "shrink": (game, gc, target) => {
        if (!target) return;
        const half = -Math.floor(game.getAtk(target) / 2);
        tempStatBoost(game, target, half, 0, "Shrink");
        game.addLog(`Shrink halves ${target.card.name}'s ATK until the End Phase!`);
    },

    "reinforcements": (game, gc, target) => {
        if (!target) return;
        tempStatBoost(game, target, 500, 0, "Reinforcements");
        game.addLog(`Reinforcements gives ${target.card.name} +500 ATK until the End Phase!`);
    },

    "trap hole": (game, gc, target) => {
        if (!target) { game.addLog(`Trap Hole has no valid target and fizzles.`); return; }
        if (game.getAtk(target) < 1000) {
            game.addLog(`Trap Hole cannot target ${target.card.name} (ATK below 1000) and fizzles.`);
            return;
        }
        const name = target.card.name;
        target.owner.moveCard(target, "monster", "graveyard");
        game.addLog(`Trap Hole swallows ${name}!`);
    },

    "mirror force": (game, gc) => {
        const attackingPlayer = game.pendingAttack.attacker.owner;
        const mons = attackingPlayer.zone.monster.filter(m => m && m.position === "attack");
        [...mons].forEach(m => attackingPlayer.moveCard(m, "monster", "graveyard"));
        game.addLog(`Mirror Force destroys all of ${attackingPlayer.name}'s Attack Position monsters!`);
    },

    "negate attack": (game) => {
        game.attackNegated = true;
        game.forceEndBattlePhase = true;
        game.addLog("Negate Attack nullifies the attack and ends the Battle Phase!");
    },

    "magic cylinder": (game) => {
        game.attackNegated = true;
        game.reflectDamage = game.getAtk(game.pendingAttack.attacker);
        game.addLog("Magic Cylinder negates the attack and reflects its ATK back as damage!");
    },

    "waboku": (game, gc) => {
        game.preventBattleDamageFor = gc.owner;
        game.preventDestructionFor = gc.owner;
        game.addLog(`Waboku protects ${gc.owner.name} from all battle damage and destruction this turn!`);
    },

    "spellbinding circle": (game, gc, target) => {
        if (!target) return;
        target.modifiers.cannotAttack = true;
        target.modifiers.cannotChangePosition = true;
        gc.linkedTarget = target.instanceId;
        // "When that monster is destroyed, destroy this card" is enforced
        // generically by MainGame.cleanupOrphanedBinds (it leaves via
        // linkedTarget going stale). The reverse — this card being
        // destroyed first (MST, Heavy Storm, ...) — needs its own
        // teardown so the monster doesn't stay bound forever; that's
        // what linkedRevert is for, fired once by Player.moveCard the
        // moment this card actually leaves the field.
        gc.linkedRevert = () => {
            if (target.location !== "monster") return; // already reset when IT left the field
            target.modifiers.cannotAttack = false;
            target.modifiers.cannotChangePosition = false;
        };
        game.addLog(`Spellbinding Circle binds ${target.card.name} — it cannot attack or change position!`);
    },

    "shadow spell": (game, gc, target) => {
        if (!target) return;
        target.modifiers.atk -= 700;
        target.modifiers.def -= 700;
        target.modifiers.cannotAttack = true;
        target.modifiers.cannotChangePosition = true;
        gc.linkedTarget = target.instanceId;
        gc.linkedRevert = () => {
            if (target.location !== "monster") return;
            target.modifiers.atk += 700;
            target.modifiers.def += 700;
            target.modifiers.cannotAttack = false;
            target.modifiers.cannotChangePosition = false;
        };
        game.addLog(`Shadow Spell chains down ${target.card.name} (-700 ATK/DEF) — it cannot attack or change position!`);
    },

    "call of the haunted": (game, gc, target) => {
        if (!target) return;
        const controller = gc.owner;
        if (controller.getFreeMonsterSlot() === -1) {
            game.addLog("No free Monster Zone — Call of the Haunted fizzles.");
            return;
        }
        game.transferCard(target, target.owner, "graveyard", controller, "monster");
        target.faceUp = true;
        target.position = "attack";
        target.state.hasBeenSummonedThisTurn = true;
        gc.linkedTarget = target.instanceId;
        // "When this card leaves the field, destroy that monster" — the
        // half of this card's text that was previously missing entirely.
        gc.linkedRevert = () => {
            if (target.location !== "monster") return;
            const owner = target.owner;
            const name = target.card.name;
            owner.moveCard(target, "monster", "graveyard");
            game.addLog(`${name} is destroyed — Call of the Haunted left the field.`);
        };
        game.addLog(`Call of the Haunted Special Summons ${target.card.name} from the Graveyard!`);
    },

    // --- Additional cards from the Yugi/Kaiba sample decks ---

    "dragon capture jar": (game, gc) => {
        let affected = 0;
        [game.player1, game.player2].forEach(p => {
            p.getMonstersOnField().filter(m => m.card.race === "Dragon").forEach(m => {
                m.position = "defense";
                m.modifiers.cannotChangePosition = true;
                affected++;
            });
        });
        game.addLog(`Dragon Capture Jar forces all Dragon-Type monsters into Defense Position${affected ? "" : " (none on the field yet)"}!`);
    },

    "ultimate offering": (game, gc) => {
        game.addLog("Ultimate Offering stays on the field — its controller may pay 500 LP for an extra Normal Summon/Set each turn.");
    },

    "cost down": (game, gc) => {
        const p = gc.owner;
        if (p.zone.hand.length === 0) {
            game.addLog("Cost Down has no card left to discard and fizzles.");
            return;
        }
        const discard = p.zone.hand[p.zone.hand.length - 1];
        p.moveCard(discard, "hand", "graveyard");
        game.recordDiscard([{ playerIsPlayer1: p === game.player1, count: 1 }]);
        p.costDownActive = true;
        game.turnEffects.push(() => { p.costDownActive = false; });
        game.addLog(`${p.name} discards ${discard.card.name} — monsters in hand are treated as Level 2 lower this turn!`);
    },

    "enemy controller": (game, gc, target) => {
        // BUGFIX: the real card only ever targets "1 face-up monster your
        // OPPONENT controls" — this check was missing entirely, so
        // targeting your own monster (nothing in SPELL_TRAP_META's
        // generic needsTarget:"monster" stops that) would let the
        // tribute step below remove the very card `target` still points
        // at, then crash trying to move it a second time.
        if (!target || target.owner === gc.owner) {
            game.addLog("Enemy Controller must target a monster your opponent controls.");
            return;
        }
        const p = gc.owner;
        const ownMonsters = p.getMonstersOnField().filter(m => m.instanceId !== gc.instanceId);
        if (ownMonsters.length > 0) {
            const tribute = ownMonsters.sort((a, b) => game.getAtk(a) - game.getAtk(b))[0];
            p.moveCard(tribute, "monster", "graveyard");
            temporaryControl(game, gc, target);
            game.addLog(`Enemy Controller Tributes ${tribute.card.name} to take control of ${target.card.name}!`);
        } else if (p.lifePoints > 800) {
            p.dealDamage(800);
            target.position = target.position === "attack" ? "defense" : "attack";
            game.addLog(`Enemy Controller pays 800 LP to switch ${target.card.name} to ${target.position.toUpperCase()} Position!`);
        } else {
            game.addLog("Enemy Controller has no monster to Tribute and not enough LP — it fizzles.");
        }
    },

    "megamorph": (game, gc, target) => {
        if (!target) return;
        const opp = gc.owner === game.player1 ? game.player2 : game.player1;
        const doubling = gc.owner.lifePoints < opp.lifePoints;
        const factor = doubling ? 1 : -0.5;
        const atkDelta = Math.floor(game.getAtk(target) * factor);
        const defDelta = Math.floor(game.getDef(target) * factor);
        tempStatBoostPermanent(game, target, atkDelta, defDelta);
        gc.equippedTo = target.instanceId;
        game.addLog(`Megamorph equips to ${target.card.name}, ${doubling ? "doubling" : "halving"} its ATK/DEF!`);
    },

    "scapegoat": (game, gc) => {
        const p = gc.owner;
        let made = 0;
        for (let i = 0; i < 4; i++) {
            if (p.getFreeMonsterSlot() === -1) break;
            const tokenCard = new Card({
                id: `token_${p.name}_${Date.now()}_${i}`,
                name: "Sheep Token",
                type: "Monster Token",
                frameType: "token",
                humanReadableCardType: "Token",
                desc: "A sheep token Special Summoned by Scapegoat.",
                race: "Fiend",
                atk: 0,
                def: 0,
                level: 1,
                attribute: "EARTH",
                card_images: [{ image_url_small: gc.card.image }]
            });
            const tokenGC = new GameCard(tokenCard, p);
            p.addCard(tokenGC, "monster");
            tokenGC.faceUp = true;
            tokenGC.position = "defense";
            tokenGC.isToken = true;
            made++;
        }
        game.addLog(`Scapegoat Special Summons ${made} Sheep Token(s) in Defense Position!`);
    },

    "soul exchange": (game, gc, target) => {
        if (!target || target.owner === gc.owner) {
            game.addLog("Soul Exchange must target an opponent's monster.");
            return;
        }
        const opp = target.owner;
        const name = target.card.name;
        opp.moveCard(target, "monster", "graveyard");
        gc.owner.soulExchangeCredits = (gc.owner.soulExchangeCredits || 0) + 1;
        game.turnEffects.push(() => { gc.owner.soulExchangeCredits = 0; });
        game.addLog(`Soul Exchange sends ${opp.name}'s ${name} to the Graveyard — ${gc.owner.name} may use it as a Tribute this turn!`);
    },

    "crush card virus": (game, gc) => {
        const opponent = gc.owner === game.player1 ? game.player2 : game.player1;
        const targets = opponent.getMonstersOnField().filter(m => game.getAtk(m) >= 1500);
        if (targets.length === 0) {
            game.addLog("Crush Card Virus finds no monster with 1500+ ATK to destroy.");
            return;
        }
        [...targets].forEach(m => opponent.moveCard(m, "monster", "graveyard"));
        game.addLog(`Crush Card Virus destroys every monster ${opponent.name} controls with 1500+ ATK!`);
    },

    "fiendish chain": (game, gc, target) => {
        if (!target) return;
        target.modifiers.cannotAttack = true;
        target.modifiers.cannotChangePosition = true;
        target.modifiers.effectsNegated = true;
        gc.linkedTarget = target.instanceId;
        gc.linkedRevert = () => {
            if (target.location !== "monster") return;
            target.modifiers.cannotAttack = false;
            target.modifiers.cannotChangePosition = false;
            target.modifiers.effectsNegated = false;
        };
        game.addLog(`Fiendish Chain negates ${target.card.name}'s effect and seals its attack/position change!`);
    },

    "burst stream of destruction": (game, gc) => {
        const owner = gc.owner;
        const opponent = owner === game.player1 ? game.player2 : game.player1;
        const targets = opponent.getMonstersOnField();
        if (targets.length > 0) {
            [...targets].forEach(m => opponent.moveCard(m, "monster", "graveyard"));
            game.addLog(`Burst Stream of Destruction destroys every monster ${opponent.name} controls!`);
        } else {
            game.addLog(`Burst Stream of Destruction resolves, but ${opponent.name} controls no monsters to destroy.`);
        }
        // "Blue-Eyes White Dragon" you control cannot attack the turn you
        // activate this card — restrict this turn only, revert at End Phase.
        const blueEyesOnField = owner.getMonstersOnField().filter(
            m => m.faceUp && normalize(m.card.name) === "blue-eyes white dragon"
        );
        blueEyesOnField.forEach(m => { m.modifiers.cannotAttack = true; });
        game.turnEffects.push(() => {
            blueEyesOnField.forEach(m => {
                if (m.location === "monster") m.modifiers.cannotAttack = false;
            });
        });
    },

    "ring of destruction": (game, gc, target) => {
        if (!target) { game.addLog("Ring of Destruction has no valid target and fizzles."); return; }
        const atk = game.getAtk(target);
        const name = target.card.name;
        target.owner.moveCard(target, "monster", "graveyard");
        game.addLog(`Ring of Destruction destroys ${name}!`);
        if (atk > 0) {
            game.player1.dealDamage(atk);
            game.player2.dealDamage(atk);
            game.addLog(`The explosion deals ${atk} damage to both players!`);
        }
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

function getFusionRecipe(cardName) {
    return FUSION_RECIPES[normalize(cardName)] || null;
}

function getRitualRecipe(cardName) {
    return RITUAL_RECIPES[normalize(cardName)] || null;
}

function activate(game, gc, target) {
    const handler = HANDLERS[normalize(gc.card.name)];
    if (!handler) {
        game.addLog(`${gc.card.name} activates, but has no programmed effect yet.`);
        return;
    }
    handler(game, gc, target);
}

// ------------------------------------------------------------------
// MONSTER FLIP EFFECTS — triggered when a face-down monster turns
// face-up, whether by being attacked or by a manual position change.
// This is the start of real monster-effect support (separate from the
// Spell/Trap library above); only a handful of cards are covered so far.
// ------------------------------------------------------------------
const FLIP_EFFECTS = {
    "man-eater bug": (game, gc) => {
        const owner = gc.owner;
        const opponent = owner === game.player1 ? game.player2 : game.player1;
        const enemyMonsters = opponent.getMonstersOnField();
        const ownMonsters = owner.getMonstersOnField().filter(m => m.instanceId !== gc.instanceId);

        // FLIP effect says "target 1 monster on the field" (either side);
        // heuristically prefer the opponent's strongest monster.
        const target = enemyMonsters.length > 0
            ? enemyMonsters.sort((a, b) => game.getAtk(b) - game.getAtk(a))[0]
            : ownMonsters[0];

        if (!target) {
            game.addLog(`${gc.card.name}'s FLIP effect has no target and fizzles.`);
            return;
        }

        const name = target.card.name;
        target.owner.moveCard(target, "monster", "graveyard");
        game.addLog(`${gc.card.name} FLIP: destroys ${name}!`);
    },

    "trap master": (game, gc) => {
        const owner = gc.owner;
        const opponent = owner === game.player1 ? game.player2 : game.player1;
        const oppSets = opponent.getSpellTrapsOnField().filter(c => !c.faceUp);
        const ownSets = owner.getSpellTrapsOnField().filter(c => !c.faceUp && c.instanceId !== gc.instanceId);
        const target = oppSets.length > 0 ? oppSets[0] : ownSets[0];

        if (!target) {
            game.addLog(`${gc.card.name}'s FLIP effect has no Set card to check and fizzles.`);
            return;
        }

        target.faceUp = true;
        if (target.card.type.includes("Trap")) {
            const name = target.card.name;
            target.owner.moveCard(target, "spellTrap", "graveyard");
            game.addLog(`${gc.card.name} FLIP: reveals and destroys the Trap Card ${name}!`);
        } else {
            game.addLog(`${gc.card.name} FLIP: reveals ${target.card.name} — it's a Spell, so it's returned face-down.`);
            target.faceUp = false;
        }
    },

    "morphing jar": (game, gc) => {
        const discardEntries = [];
        const drawEntries = [];
        [game.player1, game.player2].forEach(p => {
            const count = p.zone.hand.length;
            [...p.zone.hand].forEach(c => p.moveCard(c, "hand", "graveyard"));
            discardEntries.push({ playerIsPlayer1: p === game.player1, count });
            p.drawCard(5);
            drawEntries.push({ playerIsPlayer1: p === game.player1, count: 5 });
        });
        game.recordDiscard(discardEntries);
        game.recordDraw(drawEntries);
        game.addLog(`${gc.card.name} FLIP: both players discard their hands and draw 5 new cards!`);
    },

    "cyber jar": (game, gc) => {
        [game.player1, game.player2].forEach(p => {
            [...p.getMonstersOnField()].forEach(m => p.moveCard(m, "monster", "graveyard"));
        });
        game.addLog(`${gc.card.name} FLIP: destroys every monster on the field!`);

        [game.player1, game.player2].forEach(p => {
            const revealed = [];
            for (let i = 0; i < 5 && p.zone.deck.length > 0; i++) revealed.push(p.zone.deck.shift());

            const summoned = [];
            const toHand = [];
            revealed.forEach(c => {
                if (game.isMonster(c) && (c.card.level || 0) <= 4 && p.getFreeMonsterSlot() !== -1) {
                    p.addCard(c, "monster");
                    c.faceUp = true;
                    c.position = "attack";
                    c.state.hasBeenSummonedThisTurn = true;
                    summoned.push(c.card.name);
                } else {
                    p.addCard(c, "hand");
                    toHand.push(c.card.name);
                }
            });
            game.addLog(`${p.name} reveals: ${revealed.map(c => c.card.name).join(", ") || "nothing"}. Special Summons: ${summoned.join(", ") || "none"}. To hand: ${toHand.join(", ") || "none"}.`);
        });
    }
};

// ------------------------------------------------------------------
// ON-SUMMON TRIGGERS — fire immediately after a successful NORMAL
// Summon (not Set, not Special Summon) of a named monster.
// ------------------------------------------------------------------
const ON_SUMMON_EFFECTS = {
    "breaker the magical warrior": (game, gc) => {
        gc.hasSpellCounter = true;
        gc.modifiers.atk += 300;
        game.addLog(`${gc.card.name} is armed with a Spell Counter (+300 ATK)! Its effect can remove the counter to destroy a Spell/Trap.`);
    },
    "ancient lamp": (game, gc) => {
        const owner = gc.owner;
        const laJinn = owner.zone.hand.find(c => normalize(c.card.name) === "la jinn the mystical genie of the lamp");
        if (!laJinn) {
            game.addLog(`${gc.card.name}'s effect finds no La Jinn the Mystical Genie of the Lamp in hand.`);
            return;
        }
        if (owner.getFreeMonsterSlot() === -1) {
            game.addLog(`No free Monster Zone — ${gc.card.name}'s effect fizzles.`);
            return;
        }
        owner.moveCard(laJinn, "hand", "monster");
        laJinn.faceUp = true;
        laJinn.position = "attack";
        laJinn.state.hasBeenSummonedThisTurn = true;
        game.addLog(`${gc.card.name} Special Summons La Jinn the Mystical Genie of the Lamp from the hand!`);
    }
};

function getOnSummon(cardName) {
    return ON_SUMMON_EFFECTS[normalize(cardName)] || null;
}

function triggerOnSummon(game, gc) {
    const handler = getOnSummon(gc.card.name);
    if (!handler) return;
    handler(game, gc);
}

// ------------------------------------------------------------------
// UNION MONSTERS — data only (which cards, valid hosts, stat boost);
// the actual equip/unequip/protection mechanic lives once in
// MainGame.equipUnionMonster / unequipUnionMonster / Player.moveCard
// so any future Union Monster just adds an entry here.
// ------------------------------------------------------------------
const UNION_MONSTERS = {
    "y-dragon head": { hosts: ["x-head cannon"], atk: 400, def: 400 },
    "z-metal tank": { hosts: ["x-head cannon", "y-dragon head"], atk: 600, def: 600 }
};

function getUnionInfo(cardName) {
    return UNION_MONSTERS[normalize(cardName)] || null;
}

// A generic ignition definition shared by every Union Monster: target
// one of your own valid, not-already-equipped hosts and attach to it.
function unionIgnition(unionName) {
    const info = UNION_MONSTERS[unionName];
    const hasValidHost = (game, gc) =>
        gc.owner.getMonstersOnField().some(m => !m.equippedUnion && info.hosts.includes(normalize(m.card.name)));
    return {
        needsTarget: "monster",
        // Gating on "a valid host actually exists" (not just "haven't
        // used this yet") matters for more than tidiness: it's what
        // keeps the AI from ever choosing this as its action when it's
        // impossible to complete — see AIController's ignition step,
        // which only attempts activatable() ignitions in the first
        // place. Without this check the AI would pick this, fail to
        // find a same-side host, and retry forever.
        canActivate: (game, gc) => !gc.state.hasUsedEffectThisTurn && hasValidHost(game, gc),
        activate: (game, gc, target) => {
            const validHost = target && target.owner === gc.owner && !target.equippedUnion &&
                info.hosts.includes(normalize(target.card.name));
            if (!validHost) {
                game.addLog(`${gc.card.name} needs an unequipped "${info.hosts.join('" or "')}" you control to equip to.`);
                return false;
            }
            game.equipUnionMonster(gc, target, info.atk, info.def);
            return true;
        }
    };
}

// ------------------------------------------------------------------
// IGNITION EFFECTS — monster effects the controller can manually
// activate during their own Main Phase (once per turn per card, like
// a Spell Speed 1 effect). Shown to the UI via getIgnition().
// ------------------------------------------------------------------
const IGNITION_EFFECTS = {
    "breaker the magical warrior": {
        needsTarget: "spellTrap",
        canActivate: (game, gc) => !!gc.hasSpellCounter && !gc.state.hasUsedEffectThisTurn,
        activate: (game, gc, target) => {
            if (!target) { game.addLog("No Spell/Trap Card to destroy."); return false; }
            gc.hasSpellCounter = false;
            gc.modifiers.atk -= 300;
            gc.state.hasUsedEffectThisTurn = true;
            const name = target.card.name;
            target.owner.moveCard(target, "spellTrap", "graveyard");
            game.addLog(`${gc.card.name} removes its Spell Counter to destroy ${name}!`);
            return true;
        }
    },
    "rabid horseman": {
        needsTarget: "monster",
        canActivate: (game, gc) => !gc.state.hasUsedEffectThisTurn,
        activate: (game, gc, target) => {
            if (!target || target.owner === gc.owner) { game.addLog("Rabid Horseman needs an opposing monster to target."); return false; }
            gc.state.hasUsedEffectThisTurn = true;
            const name = target.card.name;
            target.owner.moveCard(target, "monster", "graveyard");
            game.addLog(`${gc.card.name} destroys ${name}!`);
            return true;
        }
    },
    "obelisk the tormentor": {
        needsTarget: null,
        canActivate: (game, gc) => !gc.state.hasUsedEffectThisTurn &&
            gc.owner.getMonstersOnField().filter(m => m.instanceId !== gc.instanceId).length >= 2,
        activate: (game, gc) => {
            const owner = gc.owner;
            const others = owner.getMonstersOnField().filter(m => m.instanceId !== gc.instanceId);
            if (others.length < 2) { game.addLog("Obelisk the Tormentor needs 2 other monsters to Tribute."); return false; }
            others.slice(0, 2).forEach(m => owner.moveCard(m, "monster", "graveyard"));
            const opponent = owner === game.player1 ? game.player2 : game.player1;
            [...game.player1.getMonstersOnField(), ...game.player2.getMonstersOnField()]
                .filter(m => m.instanceId !== gc.instanceId)
                .forEach(m => m.owner.moveCard(m, "monster", "graveyard"));
            opponent.dealDamage(4000);
            gc.state.hasUsedEffectThisTurn = true;
            game.addLog(`Obelisk the Tormentor Tributes 2 monsters, destroys every other monster on the field, and blasts ${opponent.name} for 4000 damage!`);
            return true;
        }
    },
    "y-dragon head": unionIgnition("y-dragon head"),
    "z-metal tank": unionIgnition("z-metal tank")
};

function getIgnition(cardName) {
    return IGNITION_EFFECTS[normalize(cardName)] || null;
}

// ------------------------------------------------------------------
// HAND-RESPONSE EFFECTS — activated straight from the hand during a
// Battle Response Window (Kuriboh-style "hand traps").
// ------------------------------------------------------------------
const HAND_RESPONSE_EFFECTS = {
    "kuriboh": {
        window: "response",
        activate: (game, gc) => {
            const owner = gc.owner;
            owner.moveCard(gc, "hand", "graveyard");
            game.preventBattleDamageFor = owner;
            game.addLog(`${owner.name} discards Kuriboh — Battle Damage from this attack becomes 0!`);
        }
    }
};

function getHandResponseEffect(cardName) {
    return HAND_RESPONSE_EFFECTS[normalize(cardName)] || null;
}

// Monsters whose battle damage pierces through Defense Position monsters.
const PIERCING_MONSTERS = new Set(["spear dragon"]);
function hasPiercing(cardName) {
    return PIERCING_MONSTERS.has(normalize(cardName));
}

// Monsters that cannot declare a direct attack even with an empty
// opposing field.
const NO_DIRECT_ATTACK_MONSTERS = new Set(["spear dragon"]);
function cannotAttackDirectly(cardName) {
    return NO_DIRECT_ATTACK_MONSTERS.has(normalize(cardName));
}

// Monsters forced into Defense Position at the End Phase of any turn
// they attacked in.
const FORCED_DEFENSE_AFTER_ATTACK = new Set(["spear dragon"]);
function forcedDefenseAfterAttack(cardName) {
    return FORCED_DEFENSE_AFTER_ATTACK.has(normalize(cardName));
}

// Monsters that get to make a second attack the same turn if their
// first attack destroys a monster by battle (once per turn).
const CHAIN_ATTACK_ON_DESTROY = new Set(["gaia the dragon champion"]);
function hasChainAttackOnDestroy(cardName) {
    return CHAIN_ATTACK_ON_DESTROY.has(normalize(cardName));
}

// Lord of D. protects Dragon-Type monsters its controller owns from
// being targeted by an OPPONENT's card (never its own controller's).
function isProtectedByLordOfD(game, target, activatingPlayer) {
    if (!target || (target.card.race || "") !== "Dragon") return false;
    if (!activatingPlayer || activatingPlayer === target.owner) return false;
    return target.owner.getSpellTrapsOnField().some(
        c => c.faceUp && normalize(c.card.name) === "lord of d."
    );
}

// ------------------------------------------------------------------
// DYNAMIC STATS — monsters whose real ATK/DEF depends on live game
// state rather than a fixed number (ygoprodeck lists these as -1/-1).
// Returns { atk, def } to ADD on top of the card's printed stats.
// ------------------------------------------------------------------
const DYNAMIC_STATS = {
    "slifer the sky dragon": (game, gc) => {
        const bonus = gc.owner.zone.hand.length * 1000;
        return { atk: bonus, def: bonus };
    },
    "blade knight": (game, gc) => {
        return { atk: gc.owner.zone.hand.length <= 1 ? 400 : 0, def: 0 };
    },
    "buster blader": (game, gc) => {
        const opponent = gc.owner === game.player1 ? game.player2 : game.player1;
        const onField = opponent.getMonstersOnField().filter(m => m.card.race === "Dragon").length;
        const inGY = opponent.zone.graveyard.filter(m => game.isMonster(m) && m.card.race === "Dragon").length;
        return { atk: (onField + inGY) * 500, def: 0 };
    },
    "dark magician girl": (game, gc) => {
        const count = gc.owner.zone.graveyard.filter(
            m => game.isMonster(m) && (m.card.name === "Dark Magician" || m.card.name === "Magician of Black Chaos")
        ).length;
        return { atk: count * 300, def: 0 };
    },
    "dark paladin": (game, gc) => {
        const dragonsOnField = [...game.player1.getMonstersOnField(), ...game.player2.getMonstersOnField()]
            .filter(m => m.card.race === "Dragon").length;
        const dragonsInGY = [...game.player1.zone.graveyard, ...game.player2.zone.graveyard]
            .filter(m => game.isMonster(m) && m.card.race === "Dragon").length;
        return { atk: (dragonsOnField + dragonsInGY) * 500, def: 0 };
    }
};

function getDynamicStats(game, gc) {
    const fn = DYNAMIC_STATS[normalize(gc.card.name)];
    return fn ? fn(game, gc) : null;
}

// ------------------------------------------------------------------
// GRAVEYARD-ARRIVAL (DEATH) TRIGGERS — "if this card is sent from the
// field to the GY: ..."
// ------------------------------------------------------------------
const GY_TRIGGER_EFFECTS = {
    "sangan": (game, gc) => {
        const owner = gc.owner;
        const candidates = owner.zone.deck.filter(c => game.isMonster(c) && (c.card.atk || 0) <= 1500);
        if (candidates.length === 0) {
            game.addLog(`${gc.card.name}'s effect finds no valid monster in the Deck.`);
            return;
        }
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        owner.moveCard(chosen, "deck", "hand");
        owner.shuffleDeck();
        game.revealSearchedCard(owner, chosen);
        game.addLog(`${gc.card.name}'s effect adds ${chosen.card.name} from the Deck to ${owner.name}'s hand!`);
    },
    "witch of the black forest": (game, gc) => {
        const owner = gc.owner;
        const candidates = owner.zone.deck.filter(c => game.isMonster(c) && (c.card.def || 0) <= 1500);
        if (candidates.length === 0) {
            game.addLog(`${gc.card.name}'s effect finds no valid monster in the Deck.`);
            return;
        }
        const chosen = candidates[Math.floor(Math.random() * candidates.length)];
        owner.moveCard(chosen, "deck", "hand");
        owner.shuffleDeck();
        game.revealSearchedCard(owner, chosen);
        game.addLog(`${gc.card.name}'s effect adds ${chosen.card.name} from the Deck to ${owner.name}'s hand!`);
    }
};

function triggerGYEffect(game, gc) {
    const handler = GY_TRIGGER_EFFECTS[normalize(gc.card.name)];
    if (!handler) return;
    handler(game, gc);
}

function getFlipEffect(cardName) {
    return FLIP_EFFECTS[normalize(cardName)] || null;
}

function triggerFlip(game, gc) {
    const handler = FLIP_EFFECTS[normalize(gc.card.name)];
    if (!handler) return;
    game.recordFieldEvent("flip", gc);
    handler(game, gc);
}

// ------------------------------------------------------------------
// EFFECT INFO — a single, human-readable answer to "what does this
// card actually DO in this engine, and how/when do I use it?" Pulled
// together from every effect table above so the UI can show it on
// every card (not just the ones currently activatable), rather than
// leaving the person to guess why a card did or didn't do anything.
// One card can genuinely have more than one entry (e.g. Breaker the
// Magical Warrior has both an on-Summon trigger AND a separate
// Ignition effect), so this returns an array plus a combined summary.
// ------------------------------------------------------------------
const SPELL_TRAP_WINDOW_NOTE = {
    response: "activates only in response to an attack",
    summon: "activates only in response to a Normal/Flip Summon",
    anytime: "can be activated any time you have priority (Quick Effect)",
    main: "activate during your own Main Phase"
};
const SPELL_TRAP_SUBTYPE_LABEL = {
    normal: "Normal", quickplay: "Quick-Play", continuous: "Continuous",
    equip: "Equip", counter: "Counter"
};

function getEffectInfo(cardName) {
    const tags = [];
    const meta = getMeta(cardName);
    if (meta) {
        const kindLabel = meta.kind === "spell" ? "Spell" : "Trap";
        const subtypeLabel = SPELL_TRAP_SUBTYPE_LABEL[meta.subtype] || meta.subtype;
        const windowNote = SPELL_TRAP_WINDOW_NOTE[meta.window] || "";
        tags.push({ kind: "spelltrap", tag: (subtypeLabel || "").slice(0, 4).toUpperCase(),
            label: `${subtypeLabel} ${kindLabel}${windowNote ? " — " + windowNote : ""}` });
    }
    if (getFlipEffect(cardName)) {
        tags.push({ kind: "flip", tag: "FLIP", label: "FLIP Effect — triggers the instant this card turns face-up (attacked while Set, or manually flipped)" });
    }
    if (getUnionInfo(cardName)) {
        tags.push({ kind: "union", tag: "UNION", label: "Union Monster — during your Main Phase, equip it onto a valid host for a stat boost; it's destroyed in the host's place" });
    }
    if (getIgnition(cardName)) {
        tags.push({ kind: "ignition", tag: "IGN", label: "Ignition Effect — activate it yourself, once per turn, during your own Main Phase (look for the FX badge)" });
    }
    if (getOnSummon(cardName)) {
        tags.push({ kind: "onsummon", tag: "SUM", label: "Triggers automatically the moment this card is Normal Summoned — no click needed" });
    }
    if (getHandResponseEffect(cardName)) {
        tags.push({ kind: "handresponse", tag: "HAND", label: "Can be activated straight from your hand during a Battle Response Window (a hand trap)" });
    }
    if (DYNAMIC_STATS[normalize(cardName)]) {
        tags.push({ kind: "dynamic", tag: "VAR", label: "This card's real ATK/DEF isn't the printed number — it's calculated live from the current board state" });
    }
    if (GY_TRIGGER_EFFECTS[normalize(cardName)]) {
        tags.push({ kind: "gytrigger", tag: "GY", label: "Triggers automatically if this card is destroyed and sent from the field to the Graveyard" });
    }
    if (getFusionRecipe(cardName)) {
        const recipe = getFusionRecipe(cardName);
        tags.push({ kind: "fusion", tag: "FUSE", label: `Fusion Monster — Special Summoned by ${recipe.method === "banish" ? "banishing" : "fusing"} ${recipe.materials.join(" + ")}` });
    }
    const asRitualSpell = getRitualRecipe(cardName);
    const asRitualMonster = Object.values(RITUAL_RECIPES).find(r => normalize(r.summons) === normalize(cardName));
    if (asRitualSpell) {
        tags.push({ kind: "ritual", tag: "RIT", label: `Ritual Spell — Tribute monsters totaling Level ${asRitualSpell.tributeLevel}+ from hand/field to Ritual Summon "${asRitualSpell.summons}"` });
    } else if (asRitualMonster) {
        tags.push({ kind: "ritual", tag: "RIT", label: "Ritual Monster — can only be Ritual Summoned with its matching Ritual Spell, never Normal Summoned" });
    }
    if (tags.length === 0) {
        return { tags: [], summary: "No programmed effect yet — plays as a plain stat stick with no activatable ability." };
    }
    return { tags, summary: tags.map(t => t.label).join(" · ") };
}

module.exports = {
    getMeta, getFusionRecipe, getRitualRecipe, activate, normalize,
    getFlipEffect, triggerFlip, getDynamicStats, triggerGYEffect,
    getOnSummon, triggerOnSummon, getIgnition,
    getHandResponseEffect, hasPiercing, cannotAttackDirectly,
    forcedDefenseAfterAttack, hasChainAttackOnDestroy, isProtectedByLordOfD,
    getUnionInfo, getEffectInfo
};
