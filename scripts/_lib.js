/**
 * scripts/_lib.js — helpers shared by the card scripts.
 * Keeps each script down to "what the card says", not zone bookkeeping.
 */
"use strict";
const Effects = require("../Effects");
const { Card, GameCard } = require("../CardLogic.js");

const norm = Effects.normalize;
const L = {
    norm,
    opp(game, gc) { return gc.owner === game.player1 ? game.player2 : game.player1; },
    otherPlayer(game, p) { return p === game.player1 ? game.player2 : game.player1; },
    both(game) { return [game.player1, game.player2]; },
    mons(p) { return p.getMonstersOnField(); },
    sts(p) { return p.getSpellTrapsOnField(); },
    allMons(game) { return [...game.player1.getMonstersOnField(), ...game.player2.getMonstersOnField()]; },
    allSTs(game) { return [...game.player1.getSpellTrapsOnField(), ...game.player2.getSpellTrapsOnField()]; },
    isMonster(gc) { return /Monster/.test(gc.card.type || ""); },
    isSpell(gc) { return /Spell/.test(gc.card.type || ""); },
    isTrap(gc) { return /Trap/.test(gc.card.type || ""); },
    is(gc, ...names) { const n = norm(gc.card.name); return names.some(x => norm(x) === n); },
    nameHas(gc, text) { return norm(gc.card.name).includes(norm(text)); },
    best(game, list) { return list.slice().sort((a, b) => game.getAtk(b) - game.getAtk(a))[0] || null; },
    worst(game, list) { return list.slice().sort((a, b) => game.getAtk(a) - game.getAtk(b))[0] || null; },

    /** Send any card on the field (monster / S/T / field) to its owner's Graveyard. */
    destroy(game, gc) {
        if (!gc || !["monster", "spellTrap", "field"].includes(gc.location)) return false;
        if (game.resolvingKind === "trap" && gc.location === "monster" && gc.faceUp && Effects.isTrapImmune(gc.card.name)) { game.addLog(`${gc.card.name} is unaffected by Trap effects.`); return false; }
        gc.owner.moveCard(gc, gc.location, "graveyard");
        return true;
    },
    destroyAll(game, cards) {
        let n = 0;
        cards.slice().forEach(c => { if (L.destroy(game, c)) n++; });
        return n;
    },
    /** Move a card from wherever it is to `zone` (hand / graveyard / banished / deck / extraDeck). */
    send(gc, zone) {
        if (arguments.length && L._game && L._game.resolvingKind === "trap" && gc.location === "monster" && gc.faceUp && Effects.isTrapImmune(gc.card.name)) return;
        gc.owner.moveCard(gc, gc.location, zone);
    },

    /** Special Summon `gc` (from any zone) to `controller`'s Monster Zone. */
    specialSummon(game, gc, controller, opts = {}) {
        if (controller.getFreeMonsterSlot() === -1) return false;
        if (controller.noSpecialSummonTurn === game.turn) { game.addLog(`${controller.name} cannot Special Summon monsters this turn.`); return false; }
        if (gc.location === "graveyard" && Effects.cannotSummonFromGrave(gc.card.name)) { game.addLog(`${gc.card.name} cannot be Special Summoned from the Graveyard.`); return false; }
        if (Effects.cannotBeSpecialSummoned(gc.card.name)) { game.addLog(`${gc.card.name} cannot be Special Summoned.`); return false; }
        if (gc.location === "extraDeck" && game.extraDeckLocked && game.extraDeckLocked(controller)) { game.addLog("You cannot Special Summon monsters from the Extra Deck."); return false; }
        const from = gc.location;
        if (gc.owner !== controller) game.transferCard(gc, gc.owner, from, controller, "monster");
        else controller.moveCard(gc, from, "monster");
        gc.faceUp = opts.faceUp !== false;
        gc.position = opts.position || "attack";
        gc.state.hasBeenSummonedThisTurn = true;
        gc.state.summonType = "special";
        gc.state.summonFrom = from;
        game.recordFieldEvent("summon", gc, { special: true });
        const onSummon = Effects.getOnSummon(gc.card.name);
        if (onSummon && onSummon.anySummon) onSummon(game, gc);
        return true;
    },

    /**
     * Let `player` pick `min..max` of `candidates`; then call onChoose(picked).
     * Auto-resolves when there is no real decision (one candidate, exact count).
     * Returns false (after logging) when there is nothing to pick.
     */
    choose(game, player, opts, onChoose) {
        const cands = (opts.candidates || []).filter(Boolean);
        if (cands.length === 0) { if (opts.empty) game.addLog(opts.empty); return false; }
        const min = opts.min === undefined ? 1 : opts.min, max = opts.max === undefined ? min : opts.max;
        if (cands.length <= min && min === max && !opts.alwaysAsk) { onChoose(cands.slice(0, min)); return true; }
        game.requestChoice(player, { prompt: opts.prompt, candidates: cands, min, max, optional: !!opts.optional, onField: !!opts.onField, aiPick: opts.aiPick, onChoose });
        return true;
    },

    /** Search `from` ("deck"|"graveyard") for a card matching `filter` and add it to hand. */
    addToHand(game, gc, filter, o = {}) {
        const owner = gc.owner, from = o.from || "deck";
        const cands = owner.zone[from].filter(filter);
        return L.choose(game, owner, { prompt: o.prompt || "Add 1 card to your hand", candidates: cands, min: 1, max: o.count || 1, empty: o.empty || `${gc.card.name}: no valid card to add.` }, picked => {
            picked.forEach(c => {
                owner.moveCard(c, from, "hand");
                if (game.revealSearchedCard) game.revealSearchedCard(owner, c);
                game.addLog(`${owner.name} adds ${c.card.name} from the ${from === "deck" ? "Deck" : "Graveyard"} to their hand.`);
            });
            if (from === "deck") owner.shuffleDeck();
        });
    },

    /** Equip Spell helper: permanent stat bonus + link, clears itself when the monster leaves. */
    equip(game, spell, target, atk, def) {
        target.modifiers.atk += atk; target.modifiers.def += def;
        spell.equippedTo = target.instanceId;
        spell._equipBonus = { atk, def };
        // When the Equip Card leaves the field, the bonus goes with it.
        spell.linkedRevert = () => {
            if (target.location === "monster") { target.modifiers.atk -= atk; target.modifiers.def -= def; }
        };
        // Gearfried the Iron Knight destroys any Equip Card equipped to it.
        if (L.is(target, "Gearfried the Iron Knight") && !(target.modifiers && target.modifiers.effectsNegated)) {
            game.addLog(`${target.card.name} destroys ${spell.card.name}!`);
            L.destroy(game, spell);
            return false;
        }
        game.addLog(`${spell.card.name} equips to ${target.card.name} (${atk >= 0 ? "+" : ""}${atk} ATK${def ? `, ${def >= 0 ? "+" : ""}${def} DEF` : ""}).`);
        return true;
    },

    /** Until-the-End-Phase stat change on one monster. */
    tempStat(game, target, atk, def, label) {
        if (!target || target.location !== "monster") return;
        target.modifiers.atk += atk; target.modifiers.def += def;
        game.turnEffects.push(() => {
            if (target.location !== "monster") return;
            target.modifiers.atk -= atk; target.modifiers.def -= def;
        });
    },

    /** Special Summon a Token (id/name/stats given) for `player`. Returns the token or null. */
    makeToken(game, player, spec) {
        if (player.getFreeMonsterSlot() === -1) return null;
        const card = new Card({
            id: `token_${spec.name.replace(/\W+/g, "")}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`,
            name: spec.name, type: "Monster Token", frameType: "token", humanReadableCardType: "Token",
            desc: spec.desc || `${spec.name} (Token)`, race: spec.race || "Fiend", atk: spec.atk || 0, def: spec.def || 0,
            level: spec.level || 1, attribute: spec.attribute || "DARK", card_images: []
        });
        const gc = new GameCard(card, player);
        player.addCard(gc, "monster");
        gc.faceUp = true; gc.position = spec.position || "attack"; gc.isToken = true;
        gc.state.hasBeenSummonedThisTurn = true;
        game.recordFieldEvent("summon", gc, { special: true });
        return gc;
    },

    die(n = 6) { return 1 + Math.floor(Math.random() * n); },
    coin() { return Math.random() < 0.5; }
};

// Meta (kind / subtype) read from the card database, so it can never disagree with the real card.
const LocalCards = require("../LocalCards");
L.dbMeta = (name, extra = {}) => {
    const row = LocalCards.rowByName(name);
    const sup = row ? null : LocalCards.supplementByName(name);
    if (!row && !sup) throw new Error(`"${name}" is not in the card database`);
    const card = row ? LocalCards.toApiShape(row) : sup, isTrap = /Trap/.test(card.type);
    const sub = { Normal: "normal", "Quick-Play": "quickplay", Continuous: "continuous", Equip: "equip", Field: "field", Counter: "counter", Ritual: "normal" }[card.race] || "normal";
    return { kind: isTrap ? "trap" : "spell", subtype: sub, window: extra.window || (isTrap || sub === "quickplay" ? "anytime" : "main"), ...extra };
};
module.exports = L;

// Cards that count as "Harpie Lady" (printed alias text or name-change effects).
const HARPIE_LADY_NAMES = ["Harpie Lady", "Cyber Harpie Lady", "Harpie Lady 2", "Harpie Queen", "Harpie Harpist", "Harpie Dancer"];
L.isHarpieLady = gc => HARPIE_LADY_NAMES.some(n => norm(n) === norm(gc.card.name));
L.isHarpieLadyOrSisters = gc => L.isHarpieLady(gc) || L.is(gc, "Harpie Lady Sisters");
L.isHarpie = gc => L.nameHas(gc, "harpie");
module.exports = L;
