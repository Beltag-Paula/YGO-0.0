/**
 * ChainEngine.js — card activation rules, Spell Speed and Chain Links.
 * Installed onto MainGame.prototype (see bottom of MainGame.js).
 *
 * One function decides whether a card may be activated RIGHT NOW:
 *
 *     game.checkActivation(card, mode, targetInstanceId) -> { ok, reason, ... }
 *
 * The engine uses it to accept/refuse an activation and DuelSession uses it
 * to decide which commands to offer — so the UI never shows "Activate" for a
 * card that would be refused.
 *
 * modes
 *   idle    the turn player, free to act (Main Phase, or Battle Phase for Spell Speed 2+)
 *   battle  the defender, in the window after an attack declaration
 *   summon  the defender, in the window after a Normal/Flip Summon
 *   chain   whoever currently has priority in an open Chain
 *
 * Chain rules implemented
 *   - Spell Speed 1 (Normal/Continuous/Equip/Field Spells, ignition effects),
 *     2 (Quick-Play Spells, Trap Cards), 3 (Counter Traps).
 *   - A response must have Spell Speed >= the last Chain Link.
 *   - After a card is activated the OTHER player gets priority; if they
 *     chain, priority passes back; when a player passes, the Chain resolves
 *     last-in-first-out.
 *   - A link whose target left the field/zone fizzles; a link can be negated.
 *   - Trap Cards and Quick-Play Spells can't be activated the turn they were Set.
 */
"use strict";
const Effects = require("./Effects");

const RACE_TO_SUBTYPE = {
    "Normal": "normal", "Quick-Play": "quickplay", "Continuous": "continuous",
    "Equip": "equip", "Field": "field", "Ritual": "normal", "Counter": "counter"
};

module.exports = function install(MainGame) {
    const P = MainGame.prototype;

    /** The registered meta, corrected by the card's REAL type (so e.g. a Quick-Play Spell is always treated as one). */
    P.metaFor = function (gc) {
        const base = Effects.getMeta(gc.card.name);
        if (!base) return null;
        const m = { ...base };
        const isTrap = /Trap/.test(gc.card.type || ""), isSpell = /Spell/.test(gc.card.type || "");
        if (isTrap) m.kind = "trap"; else if (isSpell) m.kind = "spell";
        const sub = RACE_TO_SUBTYPE[gc.card.race];
        if ((isTrap || isSpell) && sub) m.subtype = sub;
        if (m.kind === "spell" && m.subtype === "quickplay") m.window = "anytime";
        else if (m.kind === "spell" && m.window === "anytime") m.window = "main";
        return m;
    };

    P.spellSpeed = function (gc, meta) {
        meta = meta || this.metaFor(gc);
        if (!meta) return 1;
        if (meta.kind === "trap") return meta.subtype === "counter" ? 3 : 2;
        return meta.subtype === "quickplay" ? 2 : 1;
    };

    P.otherPlayer = function (p) { return p === this.player1 ? this.player2 : this.player1; };

    /** Legal targets for a targeting card (null when the card doesn't target). */
    P.getTargetCandidates = function (gc, meta) {
        meta = meta || this.metaFor(gc);
        if (!meta || !meta.needsTarget) return null;
        const mons = () => [...this.player1.getMonstersOnField(), ...this.player2.getMonstersOnField()];
        const sts = () => [...this.player1.getSpellTrapsOnField(), ...this.player2.getSpellTrapsOnField()].filter(c => c !== gc);
        let list = [];
        switch (meta.needsTarget) {
            case "monster": list = mons(); break;
            case "spellTrap": list = sts(); break;
            case "graveyardMonster": list = [...this.player1.zone.graveyard, ...this.player2.zone.graveyard].filter(c => this.isMonster(c)); break;
            case "fusionMonster": list = this.getAvailableFusions(gc.owner); break;
            case "custom": try { list = (meta.targets ? meta.targets(this, gc) : []) || []; } catch (e) { list = []; } break;
            default: list = [];
        }
        // Lord of D. & co.: protected monsters are not legal targets.
        const trapSrc = meta.kind === "trap";
        return list.filter(c => !(c.location === "monster" && trapSrc && c.faceUp && Effects.isTrapImmune(c.card.name)))
            .filter(c => !(c.location === "monster" && (Effects.isProtectedByLordOfD(this, c, gc.owner) || (c.faceUp && Effects.isUntargetable(c.card.name)))));
    };

    P._anyWindowOpen = function () {
        const s = this.state;
        return s.awaitingChoice || s.awaitingResponse || s.awaitingSummonResponse || s.awaitingDiscardChoice ||
            s.awaitingPositionChoice || s.awaitingRitualChoice || s.awaitingChain;
    };

    /**
     * May `gc` be activated now, in `mode`? Never changes game state.
     * On success: { ok: true, meta, speed, targets, target, fromHand }.
     */
    P.checkActivation = function (gc, mode = "idle", targetInstanceId = null) {
        const fail = reason => ({ ok: false, reason });
        if (!gc || this.gameOver) return fail("The duel is over.");
        const name = gc.card.name, owner = gc.owner;
        if (gc.location === "monster" || (gc.faceUp && (gc.location === "spellTrap" || gc.location === "field") && Effects.getQuickEffect(name))) return this._checkQuickEffect(gc, mode);
        const meta = this.metaFor(gc);
        if (!meta) return fail(`${name} has no programmed effect and cannot be activated.`);

        const fromHand = gc.location === "hand";
        const isSet = (gc.location === "spellTrap" || gc.location === "field") && !gc.faceUp;
        const isFieldSpell = this.isFieldSpell(gc);
        if (!fromHand && !isSet) return fail(`${name} cannot be activated from there.`);
        if (fromHand && !/Spell/.test(gc.card.type)) return fail(`${name} must be Set before it can be activated.`);

        const speed = this.spellSpeed(gc, meta);
        const turnPlayer = owner === this.currentPlayer;

        // ---- timing ---------------------------------------------------------------
        if (mode === "idle") {
            if (this._anyWindowOpen()) return fail("Finish the current action first.");
            if (!turnPlayer) return fail(`${name} can only be activated during your own turn.`);
            if (this.phase === "m1" || this.phase === "m2") { /* ok */ }
            else if (this.phase === "battle") {
                if (speed < 2 || meta.window === "main") return fail(`${name} can only be activated during a Main Phase.`);
            } else return fail(`${name} cannot be activated in the ${this.phase} phase.`);
            if (meta.window === "response") return fail(`${name} can only be activated in response to an attack.`);
            if (meta.window === "summon") return fail(`${name} can only be activated in response to a Normal or Flip Summon.`);
        } else if (mode === "battle") {
            if (!this.battleResponse || owner !== this.battleResponse.defender) return fail("Not your response window.");
            if (!isSet) return fail("Only Set cards can respond to an attack.");
            if (meta.window !== "response" && meta.window !== "anytime") return fail(`${name} cannot be activated in response to an attack.`);
        } else if (mode === "summon") {
            if (!this.summonResponse || owner !== this.summonResponse.defender) return fail("Not your response window.");
            if (!isSet) return fail("Only Set cards can respond to a Summon.");
            if (meta.window !== "summon" && meta.window !== "anytime") return fail(`${name} cannot be activated in response to a Summon.`);
        } else if (mode === "chain") {
            const cw = this.chainWindow;
            if (!cw || owner !== cw.player) return fail("You don't have priority.");
            const top = this.chain[this.chain.length - 1];
            if (top && speed < top.speed) return fail(`${name} (Spell Speed ${speed}) cannot respond to a Spell Speed ${top.speed} effect.`);
            if (speed < 2) return fail(`${name} is not a Quick Effect and cannot be chained.`);
            if (fromHand && !(turnPlayer && meta.subtype === "quickplay")) return fail(`${name} must be Set before it can be activated on your opponent's turn.`);
            if (meta.kind === "trap" && meta.window !== "anytime") return fail(`${name} cannot be chained to this activation.`);
        } else return fail("Unknown activation mode.");

        // ---- set-turn / locks -------------------------------------------------------
        if (isSet && (meta.kind === "trap" || meta.subtype === "quickplay") && gc.turnSet === this.turn) {
            return fail(`${name} cannot be activated the turn it was Set.`);
        }
        if (meta.kind === "trap" && this.trapsLocked(gc)) return fail(`${name} cannot be activated — Trap Cards are negated.`);
        if (fromHand && !isFieldSpell && owner.getFreeSpellTrapSlot() === -1) return fail("Your Spell & Trap Zone is full.");
        if (meta.summons && this.summonLocked(owner, false)) return fail(`${name}: you cannot Summon monsters this turn.`);
        if (meta.needsTarget === "fusionMonster" && this.extraDeckLocked(owner)) return fail(`${name}: you cannot Special Summon monsters from the Extra Deck.`);

        // ---- costs / prerequisites ------------------------------------------------------
        if (meta.cost && meta.cost.lp && owner.lifePoints <= meta.cost.lp) return fail(`Not enough Life Points to activate ${name}.`);
        if (meta.precheck === "ritual" && !this.canRitualSummon(owner, gc)) return fail(`Cannot Ritual Summon with ${name} right now (need the matching Ritual Monster in hand and enough Tribute Levels).`);
        if (meta.precheck === "controlsBlueEyes" && !this.controlsCard(owner, "Blue-Eyes White Dragon")) return fail(`${name} requires you to control "Blue-Eyes White Dragon".`);
        if (meta.costChoice) {
            let cands = [];
            try { cands = meta.costChoice.candidates(this, gc) || []; } catch (e) { cands = []; }
            const need = meta.costChoice.min === undefined ? 1 : meta.costChoice.min;
            if (cands.length < need) return fail(`${name}: you cannot pay its cost.`);
        }
        if (owner.nameLock && owner.nameLock.turn === this.turn && owner.nameLock.names.includes(gc.card.name)) {
            return fail(`You cannot activate cards with the name "${gc.card.name}" for the rest of this turn.`);
        }
        if (meta.condition) {
            let ok = false;
            try { ok = !!meta.condition(this, gc); } catch (e) { ok = false; }
            if (!ok) return fail(`${name}'s activation condition is not met.`);
        }

        // ---- targets ---------------------------------------------------------------------
        let targets = null, target = null;
        if (meta.needsTarget) {
            if (mode === "summon" && meta.window === "summon") {
                // Trap Hole-style: the target is the monster that was just Summoned.
                target = this.summonResponse ? this.summonResponse.summonedGc : null;
                targets = target ? [target] : [];
                if (!target) return fail(`${name} has no valid target.`);
            } else {
                targets = this.getTargetCandidates(gc, meta) || [];
                if (targets.length === 0) return fail(`${name} has no valid target.`);
                if (targetInstanceId) {
                    target = targets.find(c => c.instanceId === targetInstanceId) || null;
                    if (!target) {
                        const raw = [...this.player1.getMonstersOnField(), ...this.player2.getMonstersOnField()].find(c => c.instanceId === targetInstanceId);
                        if (raw && Effects.isProtectedByLordOfD(this, raw, owner)) return fail(`Lord of D. negates the activation — ${raw.card.name} cannot be targeted!`);
                        return fail(`That is not a legal target for ${name}.`);
                    }
                }
            }
        }
        return { ok: true, meta, speed, targets, target, fromHand };
    };

    /**
     * A face-up card's Quick Effect: a monster's (Dark Paladin ...) or a Continuous Spell/Trap's
     * (Ultimate Offering). `q.timing(game, gc, mode)` can widen when it is usable (own Main Phase,
     * opponent's Battle Phase ...); without it the effect is chain-response only.
     */
    P._checkQuickEffect = function (gc, mode) {
        const fail = reason => ({ ok: false, reason });
        const name = gc.card.name, owner = gc.owner;
        const q = Effects.getQuickEffect(name);
        if (!q) return fail(`${name} has no Quick Effect.`);
        if (!gc.faceUp || (gc.modifiers && gc.modifiers.effectsNegated)) return fail(`${name} must be face-up with its effects active.`);
        if (q.timing) {
            let ok = false;
            try { ok = !!q.timing(this, gc, mode); } catch (e) { ok = false; }
            if (!ok) return fail(`${name}'s effect can't be used right now.`);
            if (mode === "idle" && (this._anyWindowOpen() || owner !== this.currentPlayer)) return fail("Finish the current action first.");
            if (mode === "battle" && (!this.battleResponse || owner !== this.battleResponse.defender)) return fail("Not your response window.");
            if (mode === "chain" && (!this.chainWindow || owner !== this.chainWindow.player)) return fail("You don't have priority.");
            if (mode === "summon") return fail(`${name} can't respond to a Summon.`);
        } else {
            if (mode !== "chain") return fail("Quick Effects can only be used in response to an activation.");
            const cw = this.chainWindow;
            if (!cw || owner !== cw.player) return fail("You don't have priority.");
        }
        const top = this.chain[this.chain.length - 1];
        if (mode === "chain" && top && top.speed > 2) return fail("Spell Speed too low.");
        if (q.cost && q.cost.lp && owner.lifePoints <= q.cost.lp) return fail(`Not enough Life Points to use ${name}.`);
        let ok = true;
        if (q.canActivate) { try { ok = !!q.canActivate(this, gc, top); } catch (e) { ok = false; } }
        if (!ok) return fail(`${name}'s effect can't be used now.`);
        const cc = typeof q.costChoice === "function" ? q.costChoice(this, gc, mode) : q.costChoice;
        if (cc) {
            let cands = [];
            try { cands = cc.candidates(this, gc) || []; } catch (e) { cands = []; }
            if (cands.length < (cc.min === undefined ? 1 : cc.min)) return fail(`${name}: you cannot pay its cost.`);
        }
        return { ok: true, meta: { kind: "monster", subtype: "quick" }, speed: 2, targets: null, target: null, fromHand: false, quick: q, mode };
    };

    // ------------------------------------------------------------------
    // ACTIVATION -> CHAIN LINK
    // ------------------------------------------------------------------
    P.activateCard = function (gc, targetInstanceId = null, mode = "idle") {
        const chk = this.checkActivation(gc, mode, targetInstanceId);
        if (!chk.ok) { this.addLog(chk.reason); return false; }
        if (chk.quick) return this._activateQuick(gc, chk.quick, mode);
        const { meta, target, speed, fromHand } = chk;
        if (meta.needsTarget && !target) { this.addLog(`${gc.card.name}: choose a target.`); return false; }
        const owner = gc.owner;

        // The window this activation answers stays suspended until the Chain ends.
        if (mode === "battle") { this.state.awaitingResponse = false; this.chainThen = () => this.resolveBattleDamage(); }
        else if (mode === "summon") { this.state.awaitingSummonResponse = false; this.chainThen = () => this.resolveSummonResponse(); }

        if (fromHand) {
            if (this.isFieldSpell(gc)) this.placeInFieldZone(owner, gc);
            else owner.moveCard(gc, "hand", "spellTrap");
        }
        gc.faceUp = true;
        gc.spellTrap.activated = true;
        if (meta.cost && meta.cost.lp) owner.dealDamage(meta.cost.lp);

        this.addLog(`${owner.name} activates ${fromHand ? "" : "the Set card "}${gc.card.name}!`);
        this.recordFieldEvent(meta.kind === "trap" ? "trap-activate" : "spell-activate", gc, {
            staysOnField: meta.subtype === "continuous" || meta.subtype === "equip" || meta.subtype === "field"
        });
        this.lastDrawEvent = null; this.lastDiscardEvent = null; this.lastDestroyEvent = null;

        const link = { gc, owner, meta, target, speed, targetLoc: target ? target.location : null, negated: false };
        const go = () => this.pushChainLink(link);

        // A cost the player must CHOOSE (discard a card, Tribute a monster...) is paid now, at
        // activation, before anyone can respond. meta.costChoice = { prompt, min, max, candidates(g, gc), pay(g, gc, picked) }
        const cc = meta.costChoice;
        if (cc) {
            let cands = [];
            try { cands = cc.candidates(this, gc) || []; } catch (e) { cands = []; }
            const min = cc.min === undefined ? 1 : cc.min, max = cc.max === undefined ? min : cc.max;
            const pay = picked => { cc.pay(this, gc, picked); go(); };
            if (cands.length <= min && !cc.alwaysAsk) pay(cands.slice(0, min));
            else this.requestChoice(owner, { prompt: cc.prompt || "Pay the cost", candidates: cands, min, max, onField: !!cc.onField, onChoose: pay });
            return true;
        }
        go();
        return true;
    };

    P._activateQuick = function (gc, q, mode = "chain") {
        const owner = gc.owner;
        const top = this.chain[this.chain.length - 1];
        // A response to an attack suspends the Battle Response Window until the Chain has resolved.
        if (mode === "battle") { this.state.awaitingResponse = false; this.chainThen = () => this.resolveBattleDamage(); }
        if (q.cost && q.cost.lp) owner.dealDamage(q.cost.lp);
        const link = { gc, owner, meta: { kind: "monster", subtype: "quick" }, target: null, speed: 2, negated: false, respondsTo: top, quick: true, mode, quickDef: q,
            resolveFn: l => q.resolve(this, gc, l) };
        const ccSpec = typeof q.costChoice === "function" ? q.costChoice(this, gc, mode) : q.costChoice;
        this.addLog(`${owner.name} activates ${gc.card.name}'s Quick Effect!`);
        this.recordFieldEvent("spell-activate", gc, { staysOnField: true });
        const go = () => this.pushChainLink(link);
        if (ccSpec) {
            const cands = ccSpec.candidates(this, gc) || [];
            const min = ccSpec.min === undefined ? 1 : ccSpec.min;
            const pay = picked => { ccSpec.pay(this, gc, picked); go(); };
            if (cands.length <= min && !ccSpec.alwaysAsk) pay(cands.slice(0, min));
            else this.requestChoice(owner, { prompt: ccSpec.prompt || "Pay the cost", candidates: cands, min, max: min, onField: !!ccSpec.onField, onChoose: pay });
        } else go();
        return true;
    };

    P.pushChainLink = function (link) {
        this.chain.push(link);
        this.emit("chain", { action: "add", index: this.chain.length, id: link.gc.instanceId, name: link.gc.card.name, owner: this.indexOf(link.owner) });
        if (this.chain.length > 1) this.addLog(`Chain Link ${this.chain.length}: ${link.gc.card.name}`);
        this.openChainPriority(this.otherPlayer(link.owner));
    };

    /** Give `player` the chance to respond; resolves immediately when they have nothing legal to chain. */
    P.openChainPriority = function (player) {
        this.chainWindow = { player };
        if (this.chainAutoPass || this.getChainResponses(player).length === 0) { this.chainWindow = null; this.resolveChain(); return; }
        this.state.awaitingChain = true;
        this.state.waitingForAction = true;
        this.emit("chainWindow", { player: this.indexOf(player) });
        this.addLog(`${player.name} may respond with a Quick Effect.`);
    };

    /** Everything `player` could legally chain right now (Set Quick-Plays/Traps, plus Quick-Plays in hand on their own turn). */
    P.getChainResponses = function (player) {
        const saved = this.chainWindow;
        if (!saved || saved.player !== player) this.chainWindow = { player };
        const out = [];
        const cands = [...player.getSpellTrapsOnField().filter(c => !c.faceUp || Effects.getQuickEffect(c.card.name)), ...player.getMonstersOnField().filter(c => c.faceUp && Effects.getQuickEffect(c.card.name))];
        if (player === this.currentPlayer) cands.push(...player.zone.hand.filter(c => /Spell/.test(c.card.type)));
        for (const gc of cands) if (this.checkActivation(gc, "chain").ok) out.push(gc);
        this.chainWindow = saved;
        return out;
    };

    /**
     * Priority window for the player whose turn it ISN'T, at a phase boundary (start of the Battle Phase,
     * end of the Battle Phase, end of Main Phase 2). Without it the turn player could attack before a
     * Set Spellbinding Circle ever got the chance to stop that monster. Returns true if the window opened
     * (the continuation `then` runs once the chain, if any, has finished).
     */
    P.openPhaseWindow = function (then) { return this.openWindowFor(this.otherPlayer(this.currentPlayer), then); };

    /** A priority window for `opp` with an empty chain (phase boundaries, after a battle destroyed monsters ...). */
    P.openWindowFor = function (opp, then) {
        this.chain = [];
        this.chainWindow = { player: opp };
        if (this.chainAutoPass || this.getChainResponses(opp).length === 0) { this.chainWindow = null; return false; }
        this.chainThen = then || null;
        this.state.awaitingChain = true;
        this.state.waitingForAction = true;
        this.emit("chainWindow", { player: this.indexOf(opp) });
        this.addLog(`${opp.name} may activate a card before the game moves on.`);
        return true;
    };

    /** After a battle that destroyed monsters, each affected player may respond (Hero Signal, Crystal Pair ...). */
    P._afterBattleWindows = function () {
        if (this.gameOver || !this.battleDestroyed.length) return;
        const involved = new Set(this.battleDestroyed.map(e => e.owner));
        const order = [this.otherPlayer(this.currentPlayer), this.currentPlayer].filter(p => involved.has(p));
        const next = i => { if (i >= order.length) return; if (!this.openWindowFor(order[i], () => next(i + 1))) next(i + 1); };
        next(0);
    };

    P.passChain = function () { if (this.state.awaitingChain) this.resolveChain(); };

    P.resolveChain = function () {
        this.state.awaitingChain = false;
        this.chainWindow = null;
        this.chainResolving = true;
        this._continueChain();
    };

    /** Resolves links last-in-first-out; pauses while an effect waits for a player choice. */
    P._continueChain = function () {
        while (this.chain.length && !this.state.awaitingChoice && !this.gameOver) {
            const link = this.chain.pop();
            this.emit("chain", { action: "resolve", index: this.chain.length + 1, id: link.gc.instanceId, name: link.gc.card.name });
            this._resolveLink(link);
        }
        if (!this.chain.length && !this.state.awaitingChoice && this.chainResolving) this._endChain();
    };

    P._resolveLink = function (link) {
        const { gc, meta, target } = link;
        if (link.quick) {
            if (link.negated) this.addLog(`${gc.card.name}'s effect was negated!`);
            else if (!(link.quickDef && link.quickDef.resolveEvenIfGone) && (!["monster", "spellTrap", "field"].includes(gc.location) || !gc.faceUp)) this.addLog(`${gc.card.name}'s effect fizzles — it is no longer face-up on the field.`);
            else link.resolveFn(link);
            this.checkForWinner();
            return;
        }
        if (link.negated) {
            this.addLog(`${gc.card.name}'s activation was negated!`);
        } else if (meta.needsTarget && target && target.location !== link.targetLoc) {
            this.addLog(`${gc.card.name} fizzles — its target is no longer there.`);
        } else {
            this.lastDrawEvent = null; this.lastDiscardEvent = null; this.lastDestroyEvent = null;
            const prevKind = this.resolvingKind; this.resolvingKind = meta.kind;
            try { Effects.activate(this, gc, target); } finally { this.resolvingKind = prevKind; }
            // The card was destroyed/removed in response, before it could resolve: it stays nowhere on the
            // field, so nothing may remain linked to it (equip bonuses are removed again).
            if (gc.location !== "spellTrap" && gc.location !== "field" && (gc.linkedRevert || gc.linkedTarget || gc.equippedTo)) {
                try { if (gc.linkedRevert) gc.linkedRevert(); } catch (e) { /* ignore */ }
                gc.linkedRevert = null; gc.linkedTarget = null; gc.equippedTo = null;
            }
        }
        // Normal / Quick-Play Spells and Normal / Counter Traps go to the GY once they have resolved.
        if (!meta.staysOnField && ["normal", "quickplay", "counter"].includes(meta.subtype) && gc.location === "spellTrap") {
            gc.owner.moveCard(gc, "spellTrap", "graveyard");
        }
        this.checkForWinner();
    };

    P._endChain = function () {
        this.chainResolving = false;
        const then = this.chainThen;
        this.chainThen = null;
        this.emit("chain", { action: "end" });
        if (then) then();
        this.checkForWinner();
    };

    /** Negate the activation of chain link number `index` (1-based). */
    P.negateChainLink = function (index) {
        const l = this.chain[index - 1];
        if (l) l.negated = true;
        return !!l;
    };

    // ------------------------------------------------------------------
    // SUMMON / BATTLE LOCKS
    // ------------------------------------------------------------------
    /** Scapegoat: "You cannot Summon other monsters this turn (but you can Normal Set)." */
    P.summonLocked = function (player, asSet) {
        return player.summonLockTurn === this.turn && !asSet;
    };
    /** The Seal of Orichalcos: its controller cannot Special Summon monsters from the Extra Deck. */
    P.extraDeckLocked = function (player) {
        return player.getSpellTrapsOnField().some(c => c.faceUp && Effects.normalize(c.card.name) === "the seal of orichalcos");
    };
    P.battleLocked = function (player) {
        return player.noBattleTurn === this.turn;
    };
};
