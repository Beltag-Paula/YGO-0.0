/**
 * DuelSession.js
 *
 * Wraps one MainGame for one human + one bot, and is the ONLY thing the
 * HTTP layer talks to. It
 *   - starts a duel from two deck-inventory ids,
 *   - drives the bot (AIController) one visible step at a time,
 *   - exposes every human action as a method that returns { ok, message,
 *     view, events },
 *   - serialises the board into a JSON "view" from the human's point of
 *     view (hidden information stays hidden; every legal action is
 *     precomputed so the browser never has to re-implement rules).
 *
 * Cards are addressed by an opaque per-session `uid` (never the engine's
 * instanceId, which embeds the card's passcode).
 */
"use strict";

const Player = require("./Player");
const MainGame = require("./MainGame");
const AIController = require("./AIController");
const Effects = require("./Effects");
require("./CardScripts").loadAll();
const DeckInventory = require("./DeckInventory");

const PHASE_ORDER = ["draw", "standby", "m1", "battle", "m2", "end"];
const AVATARS = { yugi: "/images/YamiYugi-MDDG.png", kaiba: "/images/Kaiba-MDDG.png" };

class DuelSession {
    /**
     * @param {object} o
     * @param {string} o.playerDeckId  deck_inventory id for the human
     * @param {string} o.botDeckId     deck_inventory id for the bot
     * @param {string} [o.playerName]
     * @param {"you"|"bot"|"random"} [o.first]
     */
    constructor(o) {
        const humanDeck = DeckInventory.readDeck(o.playerDeckId);
        const botDeck = DeckInventory.readDeck(o.botDeckId);
        if (!humanDeck) throw new Error(`Unknown player deck "${o.playerDeckId}"`);
        if (!botDeck) throw new Error(`Unknown bot deck "${o.botDeckId}"`);

        const hs = DeckInventory.summarize(o.playerDeckId, humanDeck);
        const bs = DeckInventory.summarize(o.botDeckId, botDeck);

        this.human = new Player((o.playerName || "You").slice(0, 24), humanDeck);
        this.human.profile = { avatar: AVATARS[o.playerDeckId] || null, deckName: hs.name, deckId: o.playerDeckId };
        const botName = o.botDeckId === "kaiba" ? "Kaiba" : o.botDeckId === "yugi" ? "Yugi" : "Duel Bot";
        this.bot = new Player(botName, botDeck);
        this.bot.profile = { avatar: AVATARS[o.botDeckId] || null, deckName: bs.name, deckId: o.botDeckId };

        const first = o.first === "you" || o.first === "bot" ? o.first : (Math.random() < 0.5 ? "you" : "bot");
        this.first = first;
        // The engine always lets player1 start.
        const [p1, p2] = first === "you" ? [this.human, this.bot] : [this.bot, this.human];
        this.game = new MainGame(p1, p2);
        this.humanIdx = this.game.indexOf(this.human);

        this.uids = new Map();      // GameCard -> uid
        this.nextUid = 1;
        this.eventSeq = 0;
        this.pendingEvents = [];
        this.gameOverEmitted = false;
        this.lastSeenLogLine = null;
        this.crossRequestStagnant = 0;

        this.game.startDuel();
        this.pendingEvents.push({ type: "duelStart", first });
        this._autoAdvance();
    }

    // ------------------------------------------------------------------
    // uid <-> GameCard
    // ------------------------------------------------------------------
    allCards() {
        const out = [];
        for (const p of [this.game.player1, this.game.player2]) {
            const z = p.zone;
            for (const k of ["hand", "deck", "extraDeck", "sideDeck", "graveyard", "banished"]) out.push(...z[k]);
            out.push(...z.monster.filter(Boolean), ...z.spellTrap.filter(Boolean));
            if (z.field) out.push(z.field);
            z.monster.forEach(c => { if (c && c.equippedUnion) out.push(c.equippedUnion); });
        }
        return out;
    }

    uidOf(gc) {
        if (!gc) return null;
        let u = this.uids.get(gc);
        if (!u) { u = "c" + (this.nextUid++); this.uids.set(gc, u); }
        return u;
    }

    byUid(uid) {
        if (!uid) return null;
        for (const gc of this.allCards()) if (this.uidOf(gc) === uid) return gc;
        return null;
    }

    iidOf(uid) {
        const gc = this.byUid(uid);
        return gc ? gc.instanceId : null;
    }

    side(idx) { return idx === this.humanIdx ? "you" : "opp"; }

    // ------------------------------------------------------------------
    // Bot / flow driver (formerly route/game.js advanceGame)
    // ------------------------------------------------------------------
    _forceRecoverStuckWindow() {
        const game = this.game, s = game.state;
        if (s.awaitingChoice) {
            const ch = game.choice;
            if (ch.option) game.resolveOption(ch.options[0].id);
            else if (ch.optional) game.cancelChoice(); else game.resolveChoice(ch.candidateIds.slice(0, ch.min));
        } else if (s.awaitingChain) {
            game.passChain();
        } else if (s.awaitingDiscardChoice) {
            const { player, count } = game.discardChoice;
            game.dispatch({ type: "DISCARD_CHOICE", payload: { instanceIds: player.zone.hand.slice(0, count).map(g => g.instanceId) } });
        } else if (s.awaitingPositionChoice) {
            game.dispatch({ type: "CONFIRM_POSITIONS", payload: { overrides: {} } });
        } else if (s.awaitingRitualChoice) {
            game.dispatch({ type: "CANCEL_RITUAL_CHOICE" });
        } else if (s.awaitingResponse || s.awaitingSummonResponse) {
            game.dispatch({ type: "PASS_RESPONSE" });
        } else if (s.waitingForAction) {
            game.dispatch({ type: "PASS" });
        }
    }

    /** true when the engine is waiting on the HUMAN (and only then). */
    humanToAct() {
        const g = this.game, s = g.state, h = this.human;
        if (g.gameOver) return false;
        if (s.awaitingChoice) return g.choice.player === h;
        if (s.awaitingChain) return !!g.chainWindow && g.chainWindow.player === h;
        if (s.awaitingResponse) return g.battleResponse.defender === h;
        if (s.awaitingSummonResponse) return g.summonResponse.defender === h;
        if (s.awaitingDiscardChoice) return g.discardChoice.player === h;
        if (s.awaitingPositionChoice) return g.positionChoice.player === h;
        if (s.awaitingRitualChoice) return g.ritualChoice.player === h;
        return !!(s.waitingForAction && g.currentPlayer === h);
    }

    _anyWindow() {
        const s = this.game.state;
        return s.awaitingChoice || s.awaitingChain || s.awaitingResponse || s.awaitingSummonResponse || s.awaitingDiscardChoice ||
            s.awaitingPositionChoice || s.awaitingRitualChoice;
    }

    /**
     * Runs the engine forward until either the human must decide something
     * or the bot has performed ONE visible action (so the browser can
     * animate it before asking for the next step).
     */
    advance(opts = {}) {
        const game = this.game;
        if (!game || game.gameOver) return;

        if (game.log.length > 0) {
            const last = game.log[game.log.length - 1];
            if (last === this.lastSeenLogLine) this.crossRequestStagnant++;
            else { this.crossRequestStagnant = 0; this.lastSeenLogLine = last; }
            if (this.crossRequestStagnant > 3) { this._forceRecoverStuckWindow(); this.crossRequestStagnant = 0; }
        }

        let pauseRequested = false, safety = 0, lastSig = null, stagnant = 0;
        while (!game.gameOver && safety < 500) {
            safety++;
            // After one visible bot action, hand control back to the browser so it
            // can animate — but never pause on the human's own auto-skipped phases.
            if (pauseRequested && game.state.waitingForAction && !this._anyWindow() && game.currentPlayer !== this.human) return;

            const sig = `${game.currentPlayer.name}|${game.phase}|${game.currentPlayer.zone.hand.length}|${JSON.stringify(game.state)}`;
            if (sig === lastSig) {
                if (++stagnant > 20) { this._forceRecoverStuckWindow(); stagnant = 0; lastSig = null; continue; }
            } else { stagnant = 0; lastSig = sig; }

            try {
                const s = game.state;
                if (this._anyWindow()) {
                    if (this.humanToAct()) return;
                    const r = AIController.step(game);
                    if (!r.acted) return;
                    if (r.visible) pauseRequested = true;
                    continue;
                }
                if (!s.waitingForAction) { game.nextPhase(); continue; }

                if (game.currentPlayer !== this.human) {
                    const r = AIController.step(game);
                    if (!r.acted) return;
                    if (r.visible) pauseRequested = true;
                    continue;
                }

                // Human's window. Draw / Standby / End have nothing to decide
                // (no manual trigger effects exist), so, like Master Duel,
                // skip straight through them.
                if (!opts.noAutoPhase && (game.phase === "draw" || game.phase === "standby" || game.phase === "end")) {
                    game.dispatch({ type: "PASS" });
                    continue;
                }
                return;
            } catch (err) {
                console.error("DuelSession.advance() caught an error, forcing a PASS to recover:", err);
                if (this._anyWindow() || game.state.waitingForAction) this._forceRecoverStuckWindow(); else return;
            }
        }
    }

    _autoAdvance() { this.advance(); }

    /** True while the bot (not the human) is the one who will act next. */
    botBusy() {
        return !this.game.gameOver && !this.humanToAct();
    }

    // ------------------------------------------------------------------
    // Event translation
    // ------------------------------------------------------------------
    _collect() {
        const g = this.game;
        if (g.gameOver && !this.gameOverEmitted) {
            this.gameOverEmitted = true;
            g.emit("gameover", { winner: g.winner ? this.side(g.indexOf(g.winner)) : null });
        }
        const iidToUid = new Map();
        for (const gc of this.allCards()) iidToUid.set(gc.instanceId, this.uidOf(gc));
        const out = this.pendingEvents;
        for (const e of g.drainEvents()) {
            const ev = { ...e };
            for (const k of ["id", "attacker", "target"]) if (ev[k]) ev[k] = iidToUid.get(ev[k]) || null;
            if ("player" in ev) ev.side = this.side(ev.player);
            if ("owner" in ev) ev.ownerSide = this.side(ev.owner);
            if ("attackerOwner" in ev) ev.attackerSide = this.side(ev.attackerOwner);
            if ("fromOwner" in ev) ev.fromSide = this.side(ev.fromOwner);
            if ("toOwner" in ev) ev.toSide = this.side(ev.toOwner);
            if (ev.type === "log") continue; // the view carries the rolling log
            ev.seq = ++this.eventSeq;
            out.push(ev);
        }
    }

    _stateHash() {
        const g = this.game;
        const parts = [g.turn, g.phase, g.player1.lifePoints, g.player2.lifePoints, JSON.stringify(g.state), g.log.length, g.gameOver];
        for (const p of [g.player1, g.player2]) {
            for (const k of ["hand", "graveyard", "banished", "extraDeck"]) parts.push(p.zone[k].map(c => c.instanceId).join(","));
            parts.push(p.zone.deck.length);
            p.zone.monster.forEach(c => parts.push(c ? `${c.instanceId}:${c.faceUp}:${c.position}:${c.modifiers.atk}` : "-"));
            p.zone.spellTrap.forEach(c => parts.push(c ? `${c.instanceId}:${c.faceUp}` : "-"));
        }
        return parts.join("|");
    }

    // ------------------------------------------------------------------
    // Public API used by the routes
    // ------------------------------------------------------------------
    /** Runs `fn`, advances the engine, and returns { ok, message, view, events }. */
    _run(fn, { requireHuman = true } = {}) {
        const g = this.game;
        if (g.gameOver) return this._result(false, "The duel is over.");
        if (requireHuman && !this.humanToAct()) return this._result(false, "It's not your decision right now.");
        const before = this._stateHash();
        const logBefore = g.log.length;
        let error = null;
        try { fn(); } catch (e) { error = e; console.error("Action failed:", e); }
        const changed = this._stateHash() !== before;
        let message = null;
        if (!changed) {
            message = g.log.length > logBefore ? g.log[g.log.length - 1].trim() : "That action isn't available right now.";
            if (error) message = "Something went wrong with that action.";
        }
        this.advance();
        return this._result(changed, message);
    }

    _result(ok, message) {
        this._collect();
        const events = this.pendingEvents.splice(0);
        return { ok, message: ok ? null : message, view: this.view(), events };
    }

    /** One more bot step (the browser calls this on a timer while botBusy). */
    step() {
        if (this.game.gameOver) return this._result(true, null);
        if (!this.botBusy()) return this._result(true, null);
        this.advance();
        return this._result(true, null);
    }

    state() { return this._result(true, null); }

    act(type, p = {}) {
        const g = this.game;
        const card = p.uid ? this.byUid(p.uid) : null;
        const tgt = p.target ? this.iidOf(p.target) : null;
        const uidsToIids = arr => (arr || []).map(u => this.iidOf(u)).filter(Boolean);

        switch (type) {
            case "state": return this.state();
            case "step": return this.step();
            case "summon":
                return this._run(() => card && g.dispatch({ type: "NORMAL_SUMMON", payload: { card, tributeIndices: (p.tributes || []).map(Number) } }));
            case "set":
                return this._run(() => card && g.dispatch({ type: "SET_MONSTER", payload: { card, tributeIndices: (p.tributes || []).map(Number) } }));
            case "position":
                return this._run(() => card && g.dispatch({ type: "CHANGE_POSITION", payload: { card } }));
            case "attack": {
                const target = p.target ? this.byUid(p.target) : null;
                return this._run(() => card && g.dispatch({ type: "ATTACK", payload: { attacker: card, target } }));
            }
            case "spell":
                return this._run(() => card && g.dispatch({ type: "ACTIVATE_SPELL", payload: { card, targetInstanceId: tgt } }));
            case "setSpellTrap":
                return this._run(() => card && g.dispatch({ type: "SET_SPELL_TRAP", payload: { card } }));
            case "activateSet":
                return this._run(() => card && g.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card, targetInstanceId: tgt } }));
            case "monsterEffect":
                return this._run(() => card && g.dispatch({ type: "ACTIVATE_MONSTER_EFFECT", payload: { card, targetInstanceId: tgt } }));
            case "unequip":
                return this._run(() => card && g.dispatch({ type: "UNEQUIP_UNION", payload: { host: card } }));
            case "quick":
                return this._run(() => card && g.dispatch({ type: "ACTIVATE_QUICK", payload: { card } }));
            case "handEffect":
                return this._run(() => card && g.dispatch({ type: "ACTIVATE_HAND_EFFECT", payload: { card } }));
            case "handCard":
                return this._run(() => card && g.dispatch({ type: "ACTIVATE_HAND_CARD", payload: { card } }));
            case "passResponse":
                return this._run(() => g.dispatch({ type: "PASS_RESPONSE" }));
            case "discard":
                return this._run(() => g.dispatch({ type: "DISCARD_CHOICE", payload: { instanceIds: uidsToIids(p.uids) } }));
            case "positions": {
                const overrides = {};
                Object.entries(p.overrides || {}).forEach(([u, pos]) => {
                    const iid = this.iidOf(u);
                    if (iid && (pos === "attack" || pos === "defense")) overrides[iid] = pos;
                });
                return this._run(() => g.dispatch({ type: "CONFIRM_POSITIONS", payload: { overrides } }));
            }
            case "ritual":
                return this._run(() => g.dispatch({ type: "RITUAL_TRIBUTE_CHOICE", payload: { instanceIds: uidsToIids(p.uids) } }));
            case "cancelRitual":
                return this._run(() => g.dispatch({ type: "CANCEL_RITUAL_CHOICE" }));
            case "choice":
                return this._run(() => g.dispatch({ type: "CHOICE", payload: { instanceIds: uidsToIids(p.uids) } }));
            case "option":
                return this._run(() => g.dispatch({ type: "CHOICE", payload: { optionId: p.id } }));
            case "cancelChoice":
                return this._run(() => g.dispatch({ type: "CANCEL_CHOICE" }));
            case "nextPhase":
                return this._run(() => {
                    if (g.state.waitingForAction && !this._anyWindow()) g.dispatch({ type: "PASS" });
                });
            case "gotoPhase":
                return this._run(() => this._advanceToPhase(p.phase));
            case "endTurn":
                return this._run(() => this._advanceToPhase("end", true));
            case "surrender":
                return this._run(() => g.surrender(this.human), { requireHuman: false });
            default:
                return this._result(false, `Unknown action "${type}".`);
        }
    }

    _advanceToPhase(target, passThroughEnd = false) {
        const g = this.game;
        const targetIdx = PHASE_ORDER.indexOf(target);
        if (targetIdx === -1 || g.currentPlayer !== this.human) return;
        let safety = 0;
        while (!g.gameOver && safety++ < 30) {
            if (g.currentPlayer !== this.human) return;
            const cur = PHASE_ORDER.indexOf(g.phase);
            if (cur > targetIdx) return;
            if (cur === targetIdx && g.state.waitingForAction && !passThroughEnd) return;
            if (this._anyWindow()) return;
            if (g.state.waitingForAction) {
                if (cur === targetIdx && passThroughEnd) { g.dispatch({ type: "PASS" }); return; }
                g.dispatch({ type: "PASS" });
            } else g.nextPhase();
        }
    }

    // ------------------------------------------------------------------
    // View
    // ------------------------------------------------------------------
    _fx(gc) {
        try { return Effects.getEffectInfo(gc.card.name); } catch (e) { return { tags: [], summary: "" }; }
    }

    cardView(gc, reveal) {
        const g = this.game, c = gc.card;
        const v = { uid: this.uidOf(gc), faceUp: !!gc.faceUp, pos: gc.position || null };
        if (!reveal) return v;
        const isMon = g.isMonster(gc);
        const fx = this._fx(gc);
        Object.assign(v, {
            id: c.id, name: c.name, image: c.image, art: c.imageCropped, type: c.type, frame: c.frameType,
            race: c.race || null, attr: c.attribute || null, level: c.level || null, desc: c.desc || "",
            fx: fx.tags.map(t => ({ kind: t.kind, tag: t.tag, label: t.label })),
            isMonster: isMon
        });
        if (isMon) {
            v.baseAtk = c.atk === undefined ? null : c.atk;
            v.baseDef = c.def === undefined ? null : c.def;
            if (gc.location === "monster" || gc.location === "equipped") {
                v.atk = g.getAtk(gc); v.def = g.getDef(gc);
            } else { v.atk = v.baseAtk; v.def = v.baseDef; }
        }
        if (gc.hasSpellCounter) v.counter = 1;
        if (gc.modifiers && gc.modifiers.effectsNegated) v.negated = true;
        if (gc.equippedTo) v.equippedTo = this.uidOf(this._findByIid(gc.equippedTo));
        if (gc.equippedUnion) v.union = this.cardView(gc.equippedUnion, true);
        if (gc.linkedTarget) v.linkedTo = this.uidOf(this._findByIid(gc.linkedTarget));
        return v;
    }

    _findByIid(iid) {
        return this.allCards().find(c => c.instanceId === iid) || null;
    }

    _targetsView(list) {
        return list ? { uids: list.map(c => this.uidOf(c)) } : null;
    }

    /** All the actions the human could take with this card right now. */
    _actions(gc, where) {
        const g = this.game, h = this.human;
        const act = {};
        if (!this.humanToAct()) return act;
        const s = g.state;
        const inWindow = this._anyWindow();
        const main = !inWindow && g.currentPlayer === h && (g.phase === "m1" || g.phase === "m2");
        const battle = !inWindow && g.currentPlayer === h && g.phase === "battle";

        if (where === "hand") {
            const meta = g.getCardMeta(gc.card.name);
            if (g.isMonster(gc) && main) {
                const t = g.getRequiredTributesForSummon(h, gc);
                const mode = g.summonMode(h);
                const pool = h.getMonstersOnField().filter(m => !m.cannotBeTributed);
                const canTribute = pool.length >= t.required;
                const fits = canTribute && (h.getFreeMonsterSlot() !== -1 || t.total > 0);
                const baseOk = !gc.card.type.includes("Ritual") && !Effects.cannotBeNormalSummoned(gc.card.name) && mode && (mode !== "free" || !s.actedThisWindow);
                const info = { tributes: t.required, candidates: pool.map(m => this.uidOf(m)), forced: t.forced ? this.uidOf(t.forced) : null };
                if (baseOk && fits && !g.summonLocked(h, false)) {
                    act.summon = { ...info, alt: Effects.altTributeCounts(gc.card.name).map(n => n - (t.forced ? 1 : 0)).filter(n => n <= pool.length && n !== t.required) };
                }
                if (baseOk && fits && !g.summonLocked(h, true) && !Effects.noSetMonster(gc.card.name)) act.set = info;
                const hi = Effects.getHandIgnition(gc.card.name);
                let hiOk = false;
                try { hiOk = !!(hi && hi.canActivate(g, gc)); } catch (e) { hiOk = false; }
                if (hiOk) act.handEffect = true;
            } else if (g.isSpellOrTrap(gc)) {
                if (main && (g.isFieldSpell(gc) || h.getFreeSpellTrapSlot() !== -1)) act.setSpellTrap = true;
                const chk = g.checkActivation(gc, "idle");
                if (chk.ok && /Spell/.test(gc.card.type)) act.spell = { target: this._targetsView(chk.targets) };
            }
        } else if (where === "monster") {
            if (gc.owner !== h) return act;
            if (main) {
                if (g.canChangePosition(gc)) act.position = true;
                const ign = gc.faceUp && !gc.modifiers.effectsNegated ? g.getIgnitionMeta && g.getIgnitionMeta(gc.card.name) : null;
                if (ign) {
                    let ok = false;
                    try { ok = ign.canActivate(g, gc); } catch (e) { ok = false; }
                    const cands = ign.needsTarget ? g.getTargetCandidates(gc, { needsTarget: ign.needsTarget, targets: ign.targets }) : null;
                    if (ok && (!ign.needsTarget || cands.length)) act.effect = { target: this._targetsView(cands) };
                }
                if (gc.equippedUnion && !gc.equippedUnion.state.hasUsedEffectThisTurn) act.unequip = true;
            }
            if (battle && g.canAttack(gc)) {
                const foes = g.opponentPlayer.getMonstersOnField();
                const direct = foes.length === 0 && !Effects.cannotAttackDirectly(gc.card.name);
                act.attack = { targets: foes.map(c => this.uidOf(c)), direct };
            }
        } else if (where === "spellTrap" || where === "field") {
            if (gc.owner !== h) return act;
            const chk = g.checkActivation(gc, "idle");
            if (chk.ok) {
                if (chk.quick) act.quick = true;                    // a face-up card's own effect (Ultimate Offering)
                else if (!gc.faceUp) act.activate = { target: this._targetsView(chk.targets) };
            }
        }
        return act;
    }

    _chainView() {
        return this.game.chain.map((l, i) => ({ n: i + 1, uid: this.uidOf(l.gc), name: l.gc.card.name, side: this.side(this.game.indexOf(l.owner)), negated: !!l.negated }));
    }

    _prompt() {
        const g = this.game, h = this.human, s = g.state;
        if (g.gameOver || !this.humanToAct()) return null;
        const optFor = (c, mode) => {
            const chk = g.checkActivation(c, mode);
            return { uid: this.uidOf(c), name: c.card.name, from: c.location, quick: !!(chk.ok && chk.quick), target: this._targetsView(chk.ok ? chk.targets : null) };
        };
        if (s.awaitingChoice && g.choice.option) {
            const ch = g.choice;
            return { type: "option", prompt: ch.prompt, options: ch.options, cards: ch.cards.map(c => this.cardView(c, true)) };
        }
        if (s.awaitingChoice && g.choice.onField) {
            const ch = g.choice;
            return { type: "fieldChoice", prompt: ch.prompt, min: ch.min, max: ch.max, optional: ch.optional, uids: ch.candidates.map(c => this.uidOf(c)) };
        }
        if (s.awaitingChoice) {
            const ch = g.choice;
            return {
                type: "choice", prompt: ch.prompt, min: ch.min, max: ch.max, optional: ch.optional,
                cards: ch.candidates.map(c => ({ ...this.cardView(c, true), zone: c.location }))
            };
        }
        if (s.awaitingChain) {
            const top = g.chain[g.chain.length - 1];
            return {
                type: "chain", links: this._chainView(),
                lastName: top ? top.gc.card.name : "", options: g.getChainResponses(h).map(c => optFor(c, "chain"))
            };
        }
        if (s.awaitingResponse) {
            const pa = g.pendingAttack;
            const opts = g.getEligibleResponses(h).map(c => optFor(c, "battle"));
            return {
                type: "battleResponse",
                attacker: pa ? this.uidOf(pa.attacker) : null, target: pa && pa.target ? this.uidOf(pa.target) : null,
                options: opts, handOptions: g.getEligibleHandResponses(h).map(c => this.uidOf(c))
            };
        }
        if (s.awaitingSummonResponse) {
            const sr = g.summonResponse;
            return {
                type: "summonResponse", summoned: this.uidOf(sr.summonedGc),
                options: g.getEligibleSummonResponses(h).map(c => optFor(c, "summon"))
            };
        }
        if (s.awaitingDiscardChoice) return { type: "discard", count: g.discardChoice.count };
        if (s.awaitingPositionChoice) return { type: "position", uids: g.positionChoice.instanceIds.map(i => this.uidOf(this._findByIid(i))) };
        if (s.awaitingRitualChoice) {
            const rc = g.ritualChoice;
            return {
                type: "ritual", requiredLevel: rc.requiredLevel,
                spell: this.uidOf(this._findByIid(rc.ritualSpellInstanceId)),
                monster: this.uidOf(this._findByIid(rc.ritualMonsterInstanceId)),
                candidates: rc.candidateInstanceIds.map(i => {
                    const c = this._findByIid(i);
                    return c ? { uid: this.uidOf(c), level: c.card.level || 0, zone: c.location } : null;
                }).filter(Boolean)
            };
        }
        return null;
    }

    _playerView(p, isYou) {
        const g = this.game, z = p.zone;
        const mine = isYou;
        const slot = (c, where) => {
            if (!c) return null;
            const reveal = mine || c.faceUp;
            const v = this.cardView(c, reveal);
            if (isYou) v.act = this._actions(c, where);
            return v;
        };
        const pile = arr => arr.map(c => this.cardView(c, true));
        const view = {
            name: p.name, lp: p.lifePoints, avatar: p.profile.avatar || null, deckName: p.profile.deckName || "",
            counts: { deck: z.deck.length, extra: z.extraDeck.length, gy: z.graveyard.length, banished: z.banished.length, hand: z.hand.length },
            monsters: z.monster.map(c => slot(c, "monster")),
            spellTrap: z.spellTrap.map(c => slot(c, "spellTrap")),
            field: z.field ? (() => { const v = this.cardView(z.field, mine || z.field.faceUp); if (isYou) v.act = this._actions(z.field, "field"); return v; })() : null,
            graveyard: pile(z.graveyard),
            banished: pile(z.banished.filter(c => c.faceUp !== false || true)),
            hand: z.hand.map(c => {
                const v = this.cardView(c, mine);
                if (mine) v.act = this._actions(c, "hand");
                return v;
            })
        };
        if (isYou) {
            view.extra = z.extraDeck.map(c => {
                const v = this.cardView(c, true);
                return v;
            });
            view.normalSummoned = !!p.normalSummonedThisTurn;
        }
        return view;
    }

    view() {
        const g = this.game;
        const you = this._playerView(this.human, true);
        const opp = this._playerView(this.bot, false);
        const prompt = this._prompt();
        const humanTurn = g.currentPlayer === this.human;
        const canAct = this.humanToAct() && !prompt && humanTurn;
        const phaseButtons = [];
        if (canAct) {
            if (g.phase === "m1" && !g.firstTurn && !g.battleLocked(this.human)) phaseButtons.push({ id: "battle", label: "Battle Phase" });
            if (g.phase === "m1" || g.phase === "m2") phaseButtons.push({ id: "end", label: "End Turn" });
            if (g.phase === "battle") {
                phaseButtons.push({ id: "m2", label: "Main Phase 2" });
                phaseButtons.push({ id: "end", label: "End Turn" });
            }
        }
        return {
            turn: g.turn, phase: g.phase, turnOf: humanTurn ? "you" : "opp",
            first: this.first, gameOver: g.gameOver,
            winner: g.winner ? this.side(g.indexOf(g.winner)) : null,
            you, opp, prompt, canAct, phaseButtons, chain: this._chainView(),
            botBusy: this.botBusy(),
            log: g.log.slice(-40).map(l => String(l).trim()).filter(Boolean),
            pendingAttack: g.pendingAttack ? {
                attacker: this.uidOf(g.pendingAttack.attacker),
                target: g.pendingAttack.target ? this.uidOf(g.pendingAttack.target) : null
            } : null
        };
    }
}

module.exports = DuelSession;
