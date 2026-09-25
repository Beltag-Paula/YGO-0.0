const Effects = require("./Effects.js");

class MainGame {
    constructor(player1, player2) {
        this.player1 = player1;
        this.player2 = player2;

        this.currentPlayer = player1;
        this.opponentPlayer = player2;

        this.turn = 1;
        this.phase = "draw";
        this.firstTurn = true;
        this.gameOver = false;
        this.winner = null;

        // Rolling duel log, most-recent-last, capped for the UI.
        this.log = [];

        // Battle Response Window state (set while an attack has been
        // declared but the defender may still activate a Set Spell/Trap
        // before damage is calculated).
        this.pendingAttack = null;     // { attacker, target }
        this.battleResponse = null;    // { defender }
        this.summonResponse = null;    // { defender, summonedGc } — a Trap Hole-style
                                        // "when your opponent Normal/Flip Summons..."
                                        // response window, parallel to battleResponse.
        this.attackNegated = false;
        this.forceEndBattlePhase = false;
        this.reflectDamage = 0;                 // Magic Cylinder-style reflected damage
        this.preventBattleDamageFor = null;     // Waboku: player who takes no battle damage this turn
        this.preventDestructionFor = null;      // Waboku: player whose monsters can't be destroyed by battle this turn
        this.lastBattleEvent = null;            // structured info for the UI: who attacked whom, for how much
        this.lastRevealEvent = null;            // a Deck search effect (Sangan, ...) revealing the card it found
        this.lastDrawEvent = null;              // [{ playerIsPlayer1, count }, ...] — most recent draw(s), for animation
        this.lastDiscardEvent = null;           // [{ playerIsPlayer1, count }, ...] — most recent discard(s), for animation
        this.lastFieldEvent = null;             // one card landing on the field (Summon/Set/Ritual/Tribute/Spell/Trap/Flip) — for animation
        this.turnEffects = [];                  // queued revert() closures for "until the End Phase" effects
        this.knownGYInstanceIds = new Set();    // tracks which GY arrivals have already fired their death-trigger

        this.state = {
            waitingForAction: false,
            actedThisWindow: false,
            awaitingResponse: false,
            awaitingSummonResponse: false
        };
    }

    addLog(msg) {
        this.log.push(msg);
        if (this.log.length > 40) this.log.shift();
        console.log(msg);
    }

    // entries: [{ playerIsPlayer1, count }, ...] — overwrites so the UI
    // only ever animates the most recent draw/discard event(s).
    recordDraw(entries) {
        this.lastDrawEvent = entries;
    }

    recordDiscard(entries) {
        this.lastDiscardEvent = entries;
    }

    startDuel() {
        this.currentPlayer.shuffleDeck();
        this.opponentPlayer.shuffleDeck();

        this.currentPlayer.drawCard(5);
        this.opponentPlayer.drawCard(5);

        this.addLog("=== DUEL START ===");
        this.renderPlaymat();
    }

    nextPhase() {
        if (this.gameOver) return;

        switch (this.phase) {
            case "draw":
                this.drawPhase();
                break;
            case "standby":
                this.standbyPhase();
                break;
            case "m1":
                this.mainPhase1();
                break;
            case "battle":
                this.battlePhase();
                break;
            case "m2":
                this.mainPhase2();
                break;
            case "end":
                this.endPhase();
                break;
        }
        this.renderPlaymat();
    }

    drawPhase() {
        this.addLog(`\n--- DRAW PHASE (${this.currentPlayer.name}) ---`);
        // Standard rule: the player going first does not draw on turn 1.
        if (this.firstTurn && this.turn === 1) {
            this.addLog(`${this.currentPlayer.name} skips their first Draw Phase (going first).`);
        } else {
            // Rulebook victory condition: a player who cannot draw when
            // required to loses the Duel immediately.
            if (this.currentPlayer.zone.deck.length === 0) {
                this.gameOver = true;
                this.state.waitingForAction = false;
                this.winner = this.opponentPlayer;
                this.addLog(`\n ${this.currentPlayer.name} cannot draw — ${this.winner.name.toUpperCase()} WINS THE DUEL! `);
                return;
            }
            this.currentPlayer.drawCard(1);
            this.recordDraw([{ playerIsPlayer1: this.currentPlayer === this.player1, count: 1 }]);
            this.addLog(`${this.currentPlayer.name} draws a card.`);
        }
        this.state.waitingForAction = true;
    }

    standbyPhase() {
        this.addLog(`\n--- STANDBY PHASE (${this.currentPlayer.name}) ---`);
        // No Standby-triggered effects are implemented yet, so this is
        // just a beat to pass through — but it's still its own visible
        // step, not silently skipped.
        this.state.waitingForAction = true;
    }

    mainPhase1() {
        this.addLog(`\n--- MAIN 1 (${this.currentPlayer.name}) ---`);
        this.state.waitingForAction = true;
        // Reflect whatever summon/set usage already happened this turn
        // (relevant when re-entering an action window, e.g. Main Phase 2)
        this.state.actedThisWindow = this.currentPlayer.normalSummonedThisTurn;
    }

    // Main Phase 2 behaves like Main Phase 1: you can summon/set (if you
    // haven't already this turn), change monster positions, play spells,
    // and pass.
    mainPhase2() {
        this.addLog(`\n--- MAIN 2 (${this.currentPlayer.name}) ---`);
        this.state.waitingForAction = true;
        this.state.actedThisWindow = this.currentPlayer.normalSummonedThisTurn;
    }

    battlePhase() {
        this.addLog(`\n--- BATTLE PHASE (${this.currentPlayer.name}) ---`);
        this.state.waitingForAction = true;
    }

    // ------------------------------------------------------------------
    // DISPATCH — the single entry point for every player-driven action
    // ------------------------------------------------------------------
    dispatch(action) {
        if (this.gameOver) return;
        if (!this.state.waitingForAction) return;

        // Each dispatched action starts fresh — any draw/discard/field
        // animation shown should only ever reflect what THIS action just did.
        this.lastDrawEvent = null;
        this.lastDiscardEvent = null;
        this.lastFieldEvent = null;

        // While a Battle Response Window is open, only the defender may
        // act, and only by activating a Set card or passing.
        if (this.state.awaitingResponse) {
            if (action.type === "ACTIVATE_SET_CARD") {
                this.activateSetCard(action.payload.card, action.payload.targetInstanceId || null, "battle");
            } else if (action.type === "ACTIVATE_HAND_CARD") {
                this.activateHandResponseCard(action.payload.card);
            } else if (action.type === "PASS_RESPONSE") {
                this.resolveBattleDamage();
            }
            return;
        }

        // While a Summon Response Window is open (Trap Hole-style "when
        // your opponent Normal/Flip Summons..." traps), same idea: only
        // the defender may act, only by activating a Set card or passing.
        if (this.state.awaitingSummonResponse) {
            if (action.type === "ACTIVATE_SET_CARD") {
                this.activateSetCard(action.payload.card, action.payload.targetInstanceId || null, "summon");
            } else if (action.type === "PASS_RESPONSE") {
                this.resolveSummonResponse();
            }
            return;
        }

        const inMainPhase = this.phase === "m1" || this.phase === "m2";

        switch (action.type) {
            case "NORMAL_SUMMON":
                if (!inMainPhase) return;
                this.normalSummon(action.payload.card, action.payload.tributeIndices || []);
                break;
            case "SET_MONSTER":
                if (!inMainPhase) return;
                this.setMonster(action.payload.card, action.payload.tributeIndices || []);
                break;
            case "CHANGE_POSITION":
                if (!inMainPhase) return;
                this.changeBattlePosition(action.payload.card);
                break;
            case "ACTIVATE_SPELL":
                if (!inMainPhase) return;
                this.activateSpellFromHand(action.payload.card, action.payload.targetInstanceId || null);
                break;
            case "SET_SPELL_TRAP":
                if (!inMainPhase) return;
                this.setSpellTrap(action.payload.card);
                break;
            case "ACTIVATE_SET_CARD":
                if (!inMainPhase) return; // response-window cases handled above
                this.activateSetCard(action.payload.card, action.payload.targetInstanceId || null, null);
                break;
            case "ATTACK":
                if (this.phase !== "battle") return;
                this.declareAttack(action.payload.attacker, action.payload.target || null);
                break;
            case "ACTIVATE_MONSTER_EFFECT":
                if (!inMainPhase) return;
                this.activateMonsterEffect(action.payload.card, action.payload.targetInstanceId || null);
                break;
            case "UNEQUIP_UNION":
                if (!inMainPhase) return;
                if (action.payload.host && action.payload.host.owner === this.currentPlayer) {
                    this.unequipUnionMonster(action.payload.host);
                }
                break;
            case "PASS":
                this.endActionWindow();
                break;
        }
    }

    // ------------------------------------------------------------------
    // SURRENDER — the human player concedes; the other player is
    // declared the winner immediately, wherever the duel currently is.
    // ------------------------------------------------------------------
    surrender(conceder) {
        if (this.gameOver || !conceder) return;
        const winner = conceder === this.player1 ? this.player2 : this.player1;
        this.gameOver = true;
        this.winner = winner;
        this.state.waitingForAction = false;
        this.state.awaitingResponse = false;
        this.addLog(`\n ${conceder.name} surrenders the Duel!`);
        this.addLog(`\n ${winner.name.toUpperCase()} WINS THE DUEL! `);
    }

    endActionWindow() {
        this.state.waitingForAction = false;

        if (this.phase === "draw") {
            this.phase = "standby";
        } else if (this.phase === "standby") {
            this.phase = "m1";
        } else if (this.phase === "m1") {
            // No battle phase on the very first turn of the whole duel
            this.phase = this.firstTurn ? "end" : "battle";
        } else if (this.phase === "battle") {
            this.phase = "m2";
        } else if (this.phase === "m2") {
            this.phase = "end";
        } else if (this.phase === "end") {
            this.enforceHandSizeLimit(this.currentPlayer);
            this.endTurn(); // sets this.phase back to "draw" for the new current player
        }
    }

    // ------------------------------------------------------------------
    // MONSTER ZONE
    // ------------------------------------------------------------------
    isMonster(gc) {
        return (
            gc.card.type.includes("Monster") ||
            gc.card.frameType === "normal" ||
            gc.card.frameType === "effect"
        );
    }

    isSpellOrTrap(gc) {
        return gc.card.type.includes("Spell") || gc.card.type.includes("Trap");
    }

    // Convenience for the view layer — avoids requiring Effects.js in EJS.
    getCardMeta(cardName) {
        return Effects.getMeta(cardName);
    }

    getIgnitionMeta(cardName) {
        return Effects.getIgnition(cardName);
    }

    // What does this card actually DO, in plain language? Used by the UI
    // to show effect-type badges and an explanation on every card, not
    // just the ones with a currently-clickable action.
    getEffectInfo(cardName) {
        return Effects.getEffectInfo(cardName);
    }

    getRequiredTributes(level) {
        if (level <= 4) return 0;
        if (level <= 6) return 1;
        if (level <= 8) return 2;
        return 3;
    }

    // Cost Down treats monsters in hand as 2 Levels lower (min 1) for the
    // rest of the turn it was activated.
    getEffectiveLevel(player, gc) {
        const base = gc.card.level || 0;
        if (player.costDownActive) return Math.max(1, base - 2);
        return base;
    }

    // How many Tributes THIS summon actually needs, folding in Cost Down
    // (lower effective Level) and Soul Exchange (pre-paid Tribute credits).
    getRequiredTributesForSummon(player, gc) {
        const level = this.getEffectiveLevel(player, gc);
        const raw = this.getRequiredTributes(level);
        const credits = Math.min(raw, player.soulExchangeCredits || 0);
        return { required: raw - credits, creditsUsed: credits };
    }

    // True while the player controls a face-up Ultimate Offering, which
    // lets them pay 500 LP for an extra Normal Summon/Set each turn.
    controlsActiveUltimateOffering(player) {
        return player.getSpellTrapsOnField().some(
            c => c.faceUp && Effects.normalize(c.card.name) === "ultimate offering"
        );
    }

    canNormalSummon(gc) {
        const p = this.currentPlayer;

        if (!this.isMonster(gc)) return false;
        // Ritual (and Fusion/Synchro/Xyz/Link, though those never live in
        // the hand anyway) monsters can ONLY be Ritual/Special Summoned —
        // never Normal or Tribute Summoned, no matter how many monsters
        // you have to tribute.
        if (gc.card.type.includes("Ritual")) return false;

        if (p.normalSummonedThisTurn) {
            // Ultimate Offering allows extra Summons this turn, each
            // costing 500 LP — otherwise one Normal Summon/Set per turn.
            if (!this.controlsActiveUltimateOffering(p) || p.lifePoints <= 500) return false;
        }

        const hasCard = p.zone.hand.some(c => c.instanceId === gc.instanceId);
        if (!hasCard) return false;

        return p.getFreeMonsterSlot() !== -1;
    }

    normalSummon(gc, tributeIndices = []) {
        const p = this.currentPlayer;

        if (!this.canNormalSummon(gc)) return false;
        const isBonusSummon = p.normalSummonedThisTurn; // already used the free Summon this turn
        if (this.state.actedThisWindow && !isBonusSummon) return false;

        const { required, creditsUsed } = this.getRequiredTributesForSummon(p, gc);
        if (tributeIndices.length !== required) return false;

        const tributesToProcess = [];
        for (const idx of tributeIndices) {
            const monsterToken = p.zone.monster[idx];
            if (!monsterToken) return false;
            tributesToProcess.push(monsterToken);
        }

        for (const tributeCard of tributesToProcess) {
            p.moveCard(tributeCard, "monster", "graveyard");
        }

        p.moveCard(gc, "hand", "monster");

        gc.faceUp = true;
        gc.position = "attack";
        gc.state.hasBeenSummonedThisTurn = true;

        if (isBonusSummon) {
            p.dealDamage(500);
            this.addLog(`${p.name} pays 500 LP to use Ultimate Offering for an extra Summon!`);
        }
        if (creditsUsed) p.soulExchangeCredits -= creditsUsed;

        p.normalSummonedThisTurn = true;
        this.state.actedThisWindow = true;

        this.addLog(`${p.name} Normal Summons ${gc.card.name} (ATK ${this.getAtk(gc)}/DEF ${this.getDef(gc)})!`);
        this.recordFieldEvent("summon", gc, { tributedNames: tributesToProcess.map(t => t.card.name) });
        Effects.triggerOnSummon(this, gc);
        this.checkSummonTrigger(gc);
        this.checkForWinner();
        return true;
    }

    // Set a monster face-down in defense position. Shares the "one Normal
    // Summon/Set per turn" restriction and tribute rules with normalSummon.
    setMonster(gc, tributeIndices = []) {
        const p = this.currentPlayer;

        if (!this.canNormalSummon(gc)) return false;
        const isBonusSummon = p.normalSummonedThisTurn;
        if (this.state.actedThisWindow && !isBonusSummon) return false;

        const { required, creditsUsed } = this.getRequiredTributesForSummon(p, gc);
        if (tributeIndices.length !== required) return false;

        const tributesToProcess = [];
        for (const idx of tributeIndices) {
            const monsterToken = p.zone.monster[idx];
            if (!monsterToken) return false;
            tributesToProcess.push(monsterToken);
        }

        for (const tributeCard of tributesToProcess) {
            p.moveCard(tributeCard, "monster", "graveyard");
        }

        p.moveCard(gc, "hand", "monster");

        gc.faceUp = false;
        gc.position = "defense";
        gc.state.hasBeenSummonedThisTurn = true;

        if (isBonusSummon) {
            p.dealDamage(500);
            this.addLog(`${p.name} pays 500 LP to use Ultimate Offering for an extra Set!`);
        }
        if (creditsUsed) p.soulExchangeCredits -= creditsUsed;

        p.normalSummonedThisTurn = true;
        this.state.actedThisWindow = true;

        this.addLog(`🂠 ${p.name} sets a monster face-down in Defense Position.`);
        this.recordFieldEvent("set-monster", gc, { tributedNames: tributesToProcess.map(t => t.card.name) });
        this.checkForWinner();
        return true;
    }

    // ------------------------------------------------------------------
    // IGNITION MONSTER EFFECTS (Breaker, Obelisk, Rabid Horseman, ...) —
    // manually activated by their controller during their own Main Phase.
    // ------------------------------------------------------------------
    activateMonsterEffect(gc, targetInstanceId = null) {
        if (!gc || gc.location !== "monster" || gc.owner !== this.currentPlayer) return false;
        if (gc.modifiers?.effectsNegated) {
            this.addLog(`${gc.card.name}'s effect is negated.`);
            return false;
        }

        const ign = Effects.getIgnition(gc.card.name);
        if (!ign) {
            this.addLog(`${gc.card.name} has no activatable effect.`);
            return false;
        }
        if (!ign.canActivate(this, gc)) {
            this.addLog(`${gc.card.name}'s effect cannot be activated right now.`);
            return false;
        }

        let target = null;
        if (ign.needsTarget) {
            target = this.resolveTarget({ needsTarget: ign.needsTarget }, targetInstanceId);
            if (ign.needsTarget === "monster" && Effects.isProtectedByLordOfD(this, target, gc.owner)) {
                this.addLog(`Lord of D. negates the activation — ${target.card.name} cannot be targeted!`);
                return false;
            }
            if (!target) {
                this.addLog(`${gc.card.name} has no valid target.`);
                return false;
            }
        }

        const ok = ign.activate(this, gc, target);
        if (ok) this.checkForWinner();
        return ok;
    }

    // Kuriboh-style effects activated straight from hand during a Battle
    // Response Window instead of from the Spell/Trap Zone.
    activateHandResponseCard(gc) {
        if (!gc || !this.battleResponse) return false;
        const owner = gc.owner;
        if (owner !== this.battleResponse.defender) return false;
        const hasCard = owner.zone.hand.some(c => c.instanceId === gc.instanceId);
        if (!hasCard) return false;

        const effect = Effects.getHandResponseEffect(gc.card.name);
        if (!effect || effect.window !== "response") return false;

        effect.activate(this, gc);
        this.resolveBattleDamage();
        // The protection is scoped to this one attack, not the rest of
        // the turn — clear it right after this attack resolves.
        this.preventBattleDamageFor = null;
        this.checkForWinner();
        return true;
    }

    getEligibleHandResponses(player) {
        return player.zone.hand.filter(gc => {
            const effect = Effects.getHandResponseEffect(gc.card.name);
            return effect && effect.window === "response";
        });
    }

    canChangePosition(gc) {
        if (!gc || gc.location !== "monster" || gc.owner !== this.currentPlayer) return false;
        if (gc.state.hasChangedPositionThisTurn) return false;
        if (gc.state.hasAttackedThisTurn) return false;
        if (gc.state.hasBeenSummonedThisTurn) return false;
        if (gc.modifiers?.cannotChangePosition) return false;
        return true;
    }

    changeBattlePosition(gc) {
        if (!this.canChangePosition(gc)) return false;

        const wasFaceDown = !gc.faceUp;
        gc.position = gc.position === "attack" ? "defense" : "attack";
        gc.faceUp = true;
        gc.state.hasChangedPositionThisTurn = true;

        this.addLog(`${gc.card.name} changes to ${gc.position.toUpperCase()} position.`);

        // Flip Summon: a face-down monster turning face-up triggers its
        // FLIP effect (if it has one programmed), and can also trigger
        // an opponent's "when you Flip Summon..." trap (Trap Hole).
        if (wasFaceDown) {
            Effects.triggerFlip(this, gc);
            this.checkSummonTrigger(gc);
        }

        this.checkForWinner();
        return true;
    }

    getAtk(gc) {
        const dynamic = Effects.getDynamicStats(this, gc);
        if (dynamic) {
            // The printed ATK for these cards is a "-1" placeholder (real
            // stat is calculated live), so the base value is ignored here.
            return Math.max(0, dynamic.atk + (gc.card.atk > 0 ? gc.card.atk : 0) + (gc.modifiers?.atk || 0));
        }
        return Math.max(0, (gc.card.atk || 0) + (gc.modifiers?.atk || 0));
    }

    getDef(gc) {
        const dynamic = Effects.getDynamicStats(this, gc);
        if (dynamic) {
            return Math.max(0, dynamic.def + (gc.card.def > 0 ? gc.card.def : 0) + (gc.modifiers?.def || 0));
        }
        return Math.max(0, (gc.card.def || 0) + (gc.modifiers?.def || 0));
    }

    canAttack(gc) {
        if (this.gameOver) return false;
        if (!gc || gc.location !== "monster" || gc.owner !== this.currentPlayer) return false;
        if (!gc.faceUp || gc.position !== "attack") return false;
        if (gc.state.hasAttackedThisTurn) return false;
        if (gc.modifiers?.cannotAttack) return false;
        return true;
    }

    // ------------------------------------------------------------------
    // BATTLE — declare -> (optional) response window -> damage
    // ------------------------------------------------------------------
    getEligibleResponses(player) {
        return player.getSpellTrapsOnField().filter(gc => {
            if (gc.faceUp) return false; // only Set (face-down) cards can ambush
            const meta = Effects.getMeta(gc.card.name);
            if (!meta) return false;
            if (meta.kind === "trap" && gc.turnSet === this.turn) return false;
            return meta.window === "response" || meta.window === "anytime";
        });
    }

    // Trap Hole-style "when your opponent Normal/Flip Summons a monster
    // with (condition)..." traps — a parallel, narrower window to
    // getEligibleResponses. Cards with window:"anytime" are freely
    // activatable whenever their controller has priority (which
    // includes this window too), same as they are for battle responses.
    getEligibleSummonResponses(player) {
        return player.getSpellTrapsOnField().filter(gc => {
            if (gc.faceUp) return false;
            const meta = Effects.getMeta(gc.card.name);
            if (!meta) return false;
            if (meta.kind === "trap" && gc.turnSet === this.turn) return false;
            return meta.window === "summon" || meta.window === "anytime";
        });
    }

    // Called right after a Normal Summon or (manual) Flip Summon
    // completes. Opens a Summon Response Window for the opponent if they
    // control anything that could react to it — mirrors declareAttack's
    // battle response window, just for a different trigger.
    checkSummonTrigger(summonedGc) {
        if (this.gameOver || !summonedGc || summonedGc.location !== "monster") return;
        const defender = summonedGc.owner === this.player1 ? this.player2 : this.player1;
        const eligible = this.getEligibleSummonResponses(defender);
        if (eligible.length === 0) return;
        this.summonResponse = { defender, summonedGc };
        this.state.awaitingSummonResponse = true;
        this.addLog(`${defender.name} may activate a Set Spell/Trap Card in response to the Summon.`);
    }

    resolveSummonResponse() {
        this.summonResponse = null;
        this.state.awaitingSummonResponse = false;
    }

    declareAttack(attacker, target = null) {
        if (!this.canAttack(attacker)) return false;

        const defender = this.opponentPlayer;
        const defenderMonsters = defender.getMonstersOnField();

        if (!target && Effects.cannotAttackDirectly(attacker.card.name)) {
            this.addLog(`${attacker.card.name} cannot declare a direct attack.`);
            return false;
        }
        if (!target && defenderMonsters.length > 0) {
            this.addLog(`${attacker.card.name} cannot attack directly while ${defender.name} controls monsters.`);
            return false;
        }
        if (target && (target.owner !== defender || target.location !== "monster")) return false;

        attacker.state.hasAttackedThisTurn = true;
        this.pendingAttack = { attacker, target };

        if (target) {
            this.addLog(`${attacker.card.name} declares an attack on ${target.card.name}!`);
        } else {
            this.addLog(`${attacker.card.name} declares a direct attack!`);
        }

        const eligible = this.getEligibleResponses(defender);
        const handEligible = this.getEligibleHandResponses(defender);
        if (eligible.length > 0 || handEligible.length > 0) {
            this.battleResponse = { defender };
            this.state.awaitingResponse = true;
            this.addLog(`${defender.name} may activate a Set Spell/Trap Card in response.`);
            return true;
        }

        this.resolveBattleDamage();
        return true;
    }

    resolveBattleDamage() {
        const pending = this.pendingAttack;
        this.pendingAttack = null;
        this.battleResponse = null;
        this.state.awaitingResponse = false;

        if (!pending) return;
        const { attacker, target } = pending;

        const event = {
            attackerName: attacker.card.name,
            attackerImage: attacker.card.image,
            targetName: target ? target.card.name : null,
            targetImage: target ? target.card.image : null,
            wasDirect: !target,
            damage: 0,
            damagedPlayerIsPlayer1: null,
            destroyedNames: [],
            targetWasRevealed: false
        };

        const dealDamage = (player, amount) => {
            if (amount <= 0) return 0;
            if (this.preventBattleDamageFor === player) {
                this.addLog(`${player.name} takes no battle damage this turn.`);
                return 0;
            }
            player.dealDamage(amount);
            return amount;
        };

        const destroy = (ownerPlayer, gc) => {
            if (this.preventDestructionFor === ownerPlayer) {
                this.addLog(`${gc.card.name} cannot be destroyed by battle this turn.`);
                return false;
            }
            ownerPlayer.moveCard(gc, "monster", "graveyard");
            event.destroyedNames.push(gc.card.name);
            return true;
        };

        if (this.attackNegated) {
            this.attackNegated = false;
            this.addLog("The attack was negated — no damage is dealt.");
            if (this.reflectDamage) {
                const dmg = this.reflectDamage;
                this.reflectDamage = 0;
                const dealt = dealDamage(this.currentPlayer, dmg);
                event.damage = dealt;
                event.damagedPlayerIsPlayer1 = this.currentPlayer === this.player1;
                if (dealt > 0) this.addLog(`${this.currentPlayer.name} takes ${dealt} reflected damage!`);
            }
        } else if (attacker.location !== "monster") {
            this.addLog(`${attacker.card.name} was destroyed before damage could be applied.`);
        } else if (!target) {
            const dmg = this.getAtk(attacker);
            const dealt = dealDamage(this.opponentPlayer, dmg);
            event.damage = dealt;
            event.damagedPlayerIsPlayer1 = this.opponentPlayer === this.player1;
            this.addLog(`${attacker.card.name} hits directly for ${dealt} damage! (${this.opponentPlayer.name} LP: ${this.opponentPlayer.lifePoints})`);
        } else if (target.location !== "monster") {
            this.addLog(`The attack fizzles — ${target.card.name} is no longer on the field.`);
        } else {
            const defender = target.owner;
            const atkVal = this.getAtk(attacker);

            if (target.position === "attack") {
                const defVal = this.getAtk(target);
                if (atkVal > defVal) {
                    destroy(defender, target);
                    const dealt = dealDamage(defender, atkVal - defVal);
                    event.damage = dealt;
                    event.damagedPlayerIsPlayer1 = defender === this.player1;
                    this.addLog(`${target.card.name} destroyed! ${defender.name} takes ${dealt} damage.`);
                } else if (atkVal < defVal) {
                    destroy(this.currentPlayer, attacker);
                    const dealt = dealDamage(this.currentPlayer, defVal - atkVal);
                    event.damage = dealt;
                    event.damagedPlayerIsPlayer1 = this.currentPlayer === this.player1;
                    this.addLog(`${attacker.card.name} destroyed! ${this.currentPlayer.name} takes ${dealt} damage.`);
                } else {
                    destroy(defender, target);
                    destroy(this.currentPlayer, attacker);
                    this.addLog("Both monsters are destroyed in the collision!");
                }
            } else {
                const defVal = this.getDef(target);
                const wasFaceDown = !target.faceUp;
                target.faceUp = true;
                event.targetWasRevealed = wasFaceDown;
                event.targetImage = target.card.image; // was blank for a face-down card until now
                if (wasFaceDown) this.addLog(`The set monster is revealed: ${target.card.name} (DEF ${defVal})!`);

                if (atkVal > defVal) {
                    destroy(defender, target);
                    this.addLog(`${target.card.name} destroyed!`);
                    if (Effects.hasPiercing(attacker.card.name)) {
                        const pierce = dealDamage(defender, atkVal - defVal);
                        if (pierce > 0) {
                            event.damage = pierce;
                            event.damagedPlayerIsPlayer1 = defender === this.player1;
                            this.addLog(`${attacker.card.name}'s piercing damage hits ${defender.name} for ${pierce}!`);
                        }
                    }
                } else if (atkVal < defVal) {
                    const dealt = dealDamage(this.currentPlayer, defVal - atkVal);
                    event.damage = dealt;
                    event.damagedPlayerIsPlayer1 = this.currentPlayer === this.player1;
                    this.addLog(`${this.currentPlayer.name} takes ${dealt} damage from the rebound!`);
                } else {
                    this.addLog("No monster destroyed (ATK = DEF).");
                }

                // Per the rulebook: Flip effects on an attacked face-down
                // monster resolve AFTER damage calculation completes.
                if (wasFaceDown) Effects.triggerFlip(this, target);
            }
        }

        // Gaia the Dragon Champion: destroying a monster by battle grants
        // a second attack this turn (once per turn).
        if (attacker.location === "monster" && event.destroyedNames.length > 0 &&
            Effects.hasChainAttackOnDestroy(attacker.card.name) && !attacker._usedChainAttackThisTurn) {
            attacker._usedChainAttackThisTurn = true;
            attacker.state.hasAttackedThisTurn = false;
            this.turnEffects.push(() => { attacker._usedChainAttackThisTurn = false; });
            this.addLog(`${attacker.card.name} may attack again this turn!`);
        }

        // Spear Dragon-style monsters flip to Defense Position at the End
        // Phase of any turn they attacked in.
        if (attacker.location === "monster" && Effects.forcedDefenseAfterAttack(attacker.card.name)) {
            this.turnEffects.push(() => {
                if (attacker.location === "monster") {
                    attacker.position = "defense";
                    this.addLog(`${attacker.card.name} is switched to Defense Position after attacking.`);
                }
            });
        }

        this.lastBattleEvent = event;

        if (this.forceEndBattlePhase) {
            this.forceEndBattlePhase = false;
            this.phase = "m2";
            this.mainPhase2();
        }

        this.checkForWinner();
    }

    // Real rule: "If the equipped monster is destroyed, flipped face-down,
    // or removed from the field, its Equip Cards are destroyed." Runs
    // whenever the field could have changed (battle, effects, tributes).
    cleanupOrphanedEquips() {
        [this.player1, this.player2].forEach(owner => {
            owner.getSpellTrapsOnField().forEach(gc => {
                if (!gc.equippedTo) return;
                const stillThere = this.findMonsterAnywhereOnField(gc.equippedTo);
                if (!stillThere) {
                    owner.moveCard(gc, "spellTrap", "graveyard");
                    this.addLog(`${gc.card.name} is destroyed — the monster it was equipped to left the field.`);
                }
            });
        });
    }

    // BUGFIX: several continuous Traps (Spellbinding Circle, Shadow
    // Spell, Fiendish Chain, Call of the Haunted) tie themselves to one
    // specific monster and say, on the card itself, "When that monster
    // is destroyed, destroy this card." None of that was previously
    // enforced — the trap just sat in the Spell/Trap Zone forever,
    // permanently occupying a zone slot for nothing once its target was
    // long gone. This is the reverse of cleanupOrphanedEquips just
    // above (that one frees an Equip Spell when ITS monster leaves; this
    // one destroys these Traps under the same condition), and the
    // opposite direction — the Trap itself leaving the field — is
    // handled at the single choke point in Player.moveCard via
    // card.linkedRevert(), set up by each of these cards' own handler
    // in Effects.js.
    cleanupOrphanedBinds() {
        [this.player1, this.player2].forEach(owner => {
            owner.getSpellTrapsOnField().forEach(gc => {
                if (!gc.linkedTarget) return;
                const target = this.findMonsterAnywhereOnField(gc.linkedTarget);
                if (!target) {
                    owner.moveCard(gc, "spellTrap", "graveyard");
                    this.addLog(`${gc.card.name} is destroyed — its target left the field.`);
                }
            });
        });
    }

    // Scans for monsters that newly arrived in either Graveyard since the
    // last check, and fires "sent from the field to the GY" effects
    // (Sangan, Witch of the Black Forest, etc.) for the ones that
    // genuinely came from the field (not a hand discard).
    processNewGraveyardArrivals() {
        [this.player1, this.player2].forEach(p => {
            p.zone.graveyard.forEach(gc => {
                if (this.knownGYInstanceIds.has(gc.instanceId)) return;
                this.knownGYInstanceIds.add(gc.instanceId);
                if (this.isMonster(gc) && gc._arrivedFromField) {
                    Effects.triggerGYEffect(this, gc);
                }
            });
        });
    }

    checkForWinner() {
        this.cleanupOrphanedEquips();
        this.cleanupOrphanedBinds();
        this.processNewGraveyardArrivals();
        if (this.gameOver) return;

        if (this.player1.lifePoints <= 0 || this.player2.lifePoints <= 0) {
            this.gameOver = true;
            this.state.waitingForAction = false;
            this.winner = this.player1.lifePoints <= 0 ? this.player2 : this.player1;
            this.addLog(`\n ${this.winner.name.toUpperCase()} WINS THE DUEL! `);
        }
    }

    // ------------------------------------------------------------------
    // SPELL / TRAP ZONE
    // ------------------------------------------------------------------
    transferCard(gc, fromPlayer, fromZone, toPlayer, toZone) {
        fromPlayer.removeCard(gc, fromZone);
        gc.owner = toPlayer;
        toPlayer.addCard(gc, toZone);
    }

    findMonsterAnywhereOnField(instanceId) {
        if (!instanceId) return null;
        return (
            this.player1.zone.monster.find(m => m && m.instanceId === instanceId) ||
            this.player2.zone.monster.find(m => m && m.instanceId === instanceId) ||
            null
        );
    }

    findSpellTrapAnywhereOnField(instanceId) {
        if (!instanceId) return null;
        return (
            this.player1.zone.spellTrap.find(m => m && m.instanceId === instanceId) ||
            this.player2.zone.spellTrap.find(m => m && m.instanceId === instanceId) ||
            null
        );
    }

    findGraveyardMonster(instanceId) {
        if (!instanceId) return null;
        return (
            this.player1.zone.graveyard.find(m => m.instanceId === instanceId && this.isMonster(m)) ||
            this.player2.zone.graveyard.find(m => m.instanceId === instanceId && this.isMonster(m)) ||
            null
        );
    }

    resolveTarget(meta, targetInstanceId) {
        if (!meta.needsTarget) return null;
        if (meta.needsTarget === "monster") return this.findMonsterAnywhereOnField(targetInstanceId);
        if (meta.needsTarget === "spellTrap") return this.findSpellTrapAnywhereOnField(targetInstanceId);
        if (meta.needsTarget === "graveyardMonster") return this.findGraveyardMonster(targetInstanceId);
        if (meta.needsTarget === "fusionMonster") return this.findExtraDeckMonster(targetInstanceId);
        return null;
    }

    // Activates a Normal/Quick-Play/Continuous/Equip Spell straight from hand.
    activateSpellFromHand(gc, targetInstanceId = null) {
        const p = this.currentPlayer;
        const hasCard = p.zone.hand.some(c => c.instanceId === gc.instanceId);
        if (!hasCard) return false;

        const meta = Effects.getMeta(gc.card.name);
        if (!meta || meta.kind !== "spell") return false;
        if (meta.window === "response") return false; // can't happen for spells in our set, but stay safe

        // Per the rulebook: Normal Spells only in your Main Phase; Quick-Play
        // Spells ("anytime") can also be cast during your own Battle Phase.
        if (this.phase === "battle" && meta.window !== "anytime") {
            this.addLog(`${gc.card.name} can only be activated during a Main Phase.`);
            return false;
        }
        if (this.phase !== "m1" && this.phase !== "m2" && this.phase !== "battle") return false;

        if (meta.cost?.lp && p.lifePoints <= meta.cost.lp) {
            this.addLog(`Not enough Life Points to activate ${gc.card.name}.`);
            return false;
        }
        if (p.getFreeSpellTrapSlot() === -1) return false;

        if (meta.precheck === "ritual" && !this.canRitualSummon(p, gc)) {
            this.addLog(`Cannot Ritual Summon with ${gc.card.name} right now (need the matching Ritual Monster in hand and enough Tribute Levels).`);
            return false;
        }
        if (meta.precheck === "controlsBlueEyes" && !this.controlsCard(p, "Blue-Eyes White Dragon")) {
            this.addLog(`${gc.card.name} requires you to control "Blue-Eyes White Dragon" on the field.`);
            return false;
        }

        const target = this.resolveTarget(meta, targetInstanceId);
        if (meta.needsTarget && !target) {
            this.addLog(`${gc.card.name} has no valid target and cannot be activated.`);
            return false;
        }
        if (meta.needsTarget === "monster" && Effects.isProtectedByLordOfD(this, target, p)) {
            this.addLog(`Lord of D. negates the activation — ${target.card.name} cannot be targeted!`);
            return false;
        }

        p.moveCard(gc, "hand", "spellTrap");
        gc.faceUp = true;
        gc.spellTrap.activated = true;

        if (meta.cost?.lp) p.dealDamage(meta.cost.lp);

        this.addLog(`${p.name} activates ${gc.card.name}!`);
        this.recordFieldEvent("spell-activate", gc, {
            staysOnField: meta.subtype === "continuous" || meta.subtype === "equip" || meta.subtype === "field"
        });
        this.lastDrawEvent = null;
        this.lastDiscardEvent = null;
        Effects.activate(this, gc, target);

        // BUGFIX: a targeted Spell/Trap CAN legally target itself (e.g.
        // Mystical Space Typhoon targeting another face-up S/T is the
        // common case, but nothing stops it from targeting itself — it's
        // already face-up on the field by the time its own effect
        // resolves). If the handler above already moved gc off the
        // field as a side effect of resolving against itself, this
        // second move-to-graveyard would try to remove a card that's no
        // longer in the zone and crash Player.removeCard. Checking
        // gc.location first makes this the same safe "only move it if
        // it's still there" guard everywhere else in this file already
        // uses before touching a zone.
        if ((meta.subtype === "normal" || meta.subtype === "quickplay") && gc.location === "spellTrap") {
            p.moveCard(gc, "spellTrap", "graveyard");
        }

        this.checkForWinner();
        return true;
    }

    // ------------------------------------------------------------------
    // FUSION SUMMONING (Polymerization, and "banish these" style Fusions)
    // ------------------------------------------------------------------
    findFusionMaterials(player, materialNames) {
        const pool = [...player.zone.hand, ...player.getMonstersOnField()];
        const used = new Set();
        const chosen = [];
        for (const reqName of materialNames) {
            const found = pool.find(gc => !used.has(gc.instanceId) && Effects.normalize(gc.card.name) === Effects.normalize(reqName));
            if (!found) return null;
            used.add(found.instanceId);
            chosen.push(found);
        }
        return chosen;
    }

    getAvailableFusions(player) {
        return player.zone.extraDeck.filter(gc => {
            const recipe = Effects.getFusionRecipe(gc.card.name);
            return !!recipe && !!this.findFusionMaterials(player, recipe.materials);
        });
    }

    findExtraDeckMonster(instanceId) {
        if (!instanceId) return null;
        return (
            this.player1.zone.extraDeck.find(m => m.instanceId === instanceId) ||
            this.player2.zone.extraDeck.find(m => m.instanceId === instanceId) ||
            null
        );
    }

    fusionSummon(player, extraDeckInstanceId) {
        const extraCard = this.findExtraDeckMonster(extraDeckInstanceId);
        if (!extraCard) return false;

        const recipe = Effects.getFusionRecipe(extraCard.card.name);
        if (!recipe) return false;

        const materials = this.findFusionMaterials(player, recipe.materials);
        if (!materials) {
            this.addLog(`Missing Fusion Material for ${extraCard.card.name}.`);
            return false;
        }
        if (player.getFreeMonsterSlot() === -1) {
            this.addLog("No free Monster Zone — Fusion Summon fizzles.");
            return false;
        }

        const destZone = recipe.method === "banish" ? "banished" : "graveyard";
        materials.forEach(m => player.moveCard(m, m.location, destZone));

        player.moveCard(extraCard, "extraDeck", "monster");
        extraCard.faceUp = true;
        extraCard.position = "attack";
        extraCard.state.hasBeenSummonedThisTurn = true;

        const verb = recipe.method === "banish" ? "banishing" : "sending to the GY";
        this.addLog(`${player.name} Special Summons ${extraCard.card.name} by ${verb} ${materials.map(m => m.card.name).join(" + ")}!`);
        this.checkForWinner();
        return true;
    }

    // ------------------------------------------------------------------
    // RITUAL SUMMONING (Black Luster Ritual / Black Magic Ritual)
    // ------------------------------------------------------------------
    canRitualSummon(player, ritualSpellGC) {
        const recipe = Effects.getRitualRecipe(ritualSpellGC.card.name);
        if (!recipe) return false;

        const ritualMonster = player.zone.hand.find(
            gc => Effects.normalize(gc.card.name) === Effects.normalize(recipe.summons)
        );
        if (!ritualMonster) return false;
        if (player.getFreeMonsterSlot() === -1) return false;

        const pool = [
            ...player.zone.hand.filter(gc => gc.instanceId !== ritualMonster.instanceId && this.isMonster(gc)),
            ...player.getMonstersOnField()
        ];
        const totalAvailable = pool.reduce((sum, gc) => sum + (gc.card.level || 0), 0);
        return totalAvailable >= recipe.tributeLevel;
    }

    ritualSummon(player, ritualSpellGC) {
        const recipe = Effects.getRitualRecipe(ritualSpellGC.card.name);
        if (!recipe) return false;

        const ritualMonster = player.zone.hand.find(
            gc => Effects.normalize(gc.card.name) === Effects.normalize(recipe.summons)
        );
        if (!ritualMonster) {
            this.addLog(`You don't have ${recipe.summons} in hand to Ritual Summon.`);
            return false;
        }
        if (player.getFreeMonsterSlot() === -1) {
            this.addLog("No free Monster Zone — Ritual Summon fizzles.");
            return false;
        }

        // Greedily tribute the fewest, highest-Level monsters (from hand or
        // field) needed to reach the required total Level.
        const pool = [
            ...player.zone.hand.filter(gc => gc.instanceId !== ritualMonster.instanceId && this.isMonster(gc)),
            ...player.getMonstersOnField()
        ].sort((a, b) => (b.card.level || 0) - (a.card.level || 0));

        const tributes = [];
        let totalLevel = 0;
        for (const gc of pool) {
            if (totalLevel >= recipe.tributeLevel) break;
            tributes.push(gc);
            totalLevel += (gc.card.level || 0);
        }

        if (totalLevel < recipe.tributeLevel) {
            this.addLog(`Not enough monsters to Tribute for ${ritualSpellGC.card.name} (need total Level ${recipe.tributeLevel}).`);
            return false;
        }

        tributes.forEach(gc => player.moveCard(gc, gc.location, "graveyard"));

        player.moveCard(ritualMonster, "hand", "monster");
        ritualMonster.faceUp = true;
        ritualMonster.position = "attack";
        ritualMonster.state.hasBeenSummonedThisTurn = true;

        this.addLog(`${player.name} Ritual Summons ${ritualMonster.card.name}! (Tributed: ${tributes.map(t => t.card.name).join(", ")})`);
        this.recordFieldEvent("ritual", ritualMonster, { tributedNames: tributes.map(t => t.card.name) });
        this.checkForWinner();
        return true;
    }

    // One card landing on the field, for the client to animate — a
    // Normal/Set Summon, a Ritual Summon, a Spell/Trap being Set or
    // activated, or a Flip effect triggering. One-shot: route/game.js
    // reads and clears it on the very next render, same pattern as
    // lastBattleEvent/lastRevealEvent just below.
    recordFieldEvent(kind, gc, extra = {}) {
        this.lastFieldEvent = {
            kind, // "summon" | "set-monster" | "ritual" | "set-spelltrap" | "spell-activate" | "trap-activate" | "flip"
            instanceId: gc.instanceId,
            isPlayer1: gc.owner === this.player1,
            cardName: gc.card.name,
            cardImage: gc.card.image,
            position: gc.position || null,
            ...extra
        };
    }

    // True if `player`currently controls a face-up monster on the field
    // with this exact name — used for "if you control X" Spell prechecks
    // like Burst Stream of Destruction.
    controlsCard(player, cardName) {
        const target = Effects.normalize(cardName);
        return player.getMonstersOnField().some(m => m.faceUp && Effects.normalize(m.card.name) === target);
    }

    // Real tournament rules require a Deck search effect (Sangan, Witch
    // of the Black Forest, ...) to reveal exactly which card it found to
    // the opponent — this records that for the UI to show both players,
    // not just log it as text. One-shot: route/game.js reads and clears
    // it on the very next render, same as lastBattleEvent.
    revealSearchedCard(player, gc) {
        this.lastRevealEvent = {
            playerName: player.name,
            cardName: gc.card.name,
            cardImage: gc.card.image,
        };
    }

    // ------------------------------------------------------------------
    // UNION MONSTERS (Y-Dragon Head, Z-Metal Tank, ...) — a Union
    // Monster can equip itself onto a valid host instead of staying an
    // independent monster; while equipped it grants a stat boost and is
    // destroyed in the host's place (see Player.moveCard). This is the
    // generic mechanic; Effects.js supplies which cards/hosts/boosts.
    // ------------------------------------------------------------------
    equipUnionMonster(unionGc, hostGc, atkBoost, defBoost) {
        const owner = unionGc.owner;
        owner.removeCard(unionGc, "monster");
        unionGc.location = "equipped";
        unionGc.zoneIndex = null;
        unionGc.unionAtkBoost = atkBoost;
        unionGc.unionDefBoost = defBoost;
        unionGc.state.hasUsedEffectThisTurn = true;
        hostGc.equippedUnion = unionGc;
        hostGc.modifiers.atk += atkBoost;
        hostGc.modifiers.def += defBoost;
        this.addLog(`${unionGc.card.name} equips onto ${hostGc.card.name} (+${atkBoost} ATK/+${defBoost} DEF)!`);
    }

    unequipUnionMonster(hostGc) {
        const unionGc = hostGc.equippedUnion;
        if (!unionGc) return false;
        const owner = hostGc.owner;
        if (unionGc.state.hasUsedEffectThisTurn) {
            this.addLog(`${unionGc.card.name} has already used its effect this turn.`);
            return false;
        }
        if (owner.getFreeMonsterSlot() === -1) {
            this.addLog(`No free Monster Zone to Special Summon ${unionGc.card.name} back.`);
            return false;
        }
        hostGc.equippedUnion = null;
        hostGc.modifiers.atk -= (unionGc.unionAtkBoost || 0);
        hostGc.modifiers.def -= (unionGc.unionDefBoost || 0);
        unionGc.unionAtkBoost = 0;
        unionGc.unionDefBoost = 0;
        owner.addCard(unionGc, "monster");
        unionGc.faceUp = true;
        unionGc.position = "attack";
        unionGc.state.hasBeenSummonedThisTurn = true;
        unionGc.state.hasUsedEffectThisTurn = true;
        this.addLog(`${unionGc.card.name} unequips from ${hostGc.card.name} and Special Summons itself!`);
        this.checkForWinner();
        return true;
    }

    // Sets any Spell or Trap face-down in the Spell/Trap Zone.
    setSpellTrap(gc) {
        const p = this.currentPlayer;
        const hasCard = p.zone.hand.some(c => c.instanceId === gc.instanceId);
        if (!hasCard) return false;
        if (!this.isSpellOrTrap(gc)) return false;
        if (p.getFreeSpellTrapSlot() === -1) return false;

        p.moveCard(gc, "hand", "spellTrap");
        gc.faceUp = false;
        gc.turnSet = this.turn;

        this.addLog(`🂠 ${p.name} sets a card face-down in the Spell/Trap Zone.`);
        // A face-down Spell/Trap Zone card looks identical whether it's a
        // Spell or a Trap — neither player can tell which until it's
        // activated. One unified event kind (never "spell-set" vs
        // "trap-set") means that distinction can't leak through the
        // animation even by accident, for either player's own Sets.
        this.recordFieldEvent("set-spelltrap", gc);
        return true;
    }

    // Activates a face-down Spell/Trap already on the field. `mode`
    // is null (owner's own Main Phase), "battle" (inside a Battle
    // Response Window), or "summon" (inside a Summon Response Window).
    activateSetCard(gc, targetInstanceId = null, mode = null) {
        if (!gc || gc.location !== "spellTrap") return false;

        const meta = Effects.getMeta(gc.card.name);
        if (!meta) {
            this.addLog(`${gc.card.name} has no programmed effect and cannot be activated.`);
            return false;
        }

        const owner = gc.owner;

        if (mode === "battle") {
            if (!this.battleResponse || owner !== this.battleResponse.defender) return false;
            if (meta.window !== "response" && meta.window !== "anytime") return false;
        } else if (mode === "summon") {
            if (!this.summonResponse || owner !== this.summonResponse.defender) return false;
            if (meta.window !== "summon" && meta.window !== "anytime") return false;
        } else {
            if (owner !== this.currentPlayer) return false;
            if (this.phase !== "m1" && this.phase !== "m2") return false;
            if (meta.window === "response") {
                this.addLog(`${gc.card.name} can only be activated in response to an attack.`);
                return false;
            }
            if (meta.window === "summon") {
                this.addLog(`${gc.card.name} can only be activated in response to a Normal or Flip Summon.`);
                return false;
            }
        }

        if (meta.kind === "trap" && gc.turnSet === this.turn) {
            this.addLog(`${gc.card.name} cannot be activated the turn it was Set.`);
            return false;
        }
        if (meta.cost?.lp && owner.lifePoints <= meta.cost.lp) {
            this.addLog(`Not enough Life Points to activate ${gc.card.name}.`);
            return false;
        }
        if (meta.precheck === "controlsBlueEyes" && !this.controlsCard(owner, "Blue-Eyes White Dragon")) {
            this.addLog(`${gc.card.name} requires you to control "Blue-Eyes White Dragon" on the field.`);
            return false;
        }

        let costTribute = null;
        if (meta.cost?.tributeMinAtk) {
            costTribute = owner.getMonstersOnField()
                .filter(m => this.getAtk(m) >= meta.cost.tributeMinAtk)
                .sort((a, b) => this.getAtk(b) - this.getAtk(a))[0];
            if (!costTribute) {
                this.addLog(`${gc.card.name} requires Tributing a monster with ${meta.cost.tributeMinAtk}+ ATK — none available.`);
                return false;
            }
        }

        const target = (mode === "summon" && meta.window === "summon")
            ? (this.summonResponse ? this.summonResponse.summonedGc : null)  // Trap Hole-style: implicit target is the monster that triggered this window, never player-chosen
            : this.resolveTarget(meta, targetInstanceId);
        if (meta.needsTarget && !target) {
            this.addLog(`${gc.card.name} has no valid target and cannot be activated.`);
            return false;
        }
        if (meta.needsTarget === "monster" && Effects.isProtectedByLordOfD(this, target, owner)) {
            this.addLog(`Lord of D. negates the activation — ${target.card.name} cannot be targeted!`);
            return false;
        }

        gc.faceUp = true;
        gc.spellTrap.activated = true;
        if (meta.cost?.lp) owner.dealDamage(meta.cost.lp);
        if (costTribute) {
            owner.moveCard(costTribute, "monster", "graveyard");
            this.addLog(`${owner.name} Tributes ${costTribute.card.name} to activate ${gc.card.name}.`);
        }

        this.addLog(`${owner.name} activates the set card ${gc.card.name}!`);
        this.recordFieldEvent(meta.kind === "trap" ? "trap-activate" : "spell-activate", gc, {
            staysOnField: meta.subtype === "continuous" || meta.subtype === "equip" || meta.subtype === "field"
        });
        this.lastDrawEvent = null;
        this.lastDiscardEvent = null;
        Effects.activate(this, gc, target);

        // BUGFIX: same self-target guard as activateSpellFromHand above —
        // e.g. Mystical Space Typhoon Set face-down, then activated
        // targeting itself, would otherwise crash trying to move itself
        // to the Graveyard twice.
        if ((meta.subtype === "normal" || meta.subtype === "quickplay" || meta.subtype === "counter") && gc.location === "spellTrap") {
            owner.moveCard(gc, "spellTrap", "graveyard");
        }

        if (mode === "battle") {
            this.resolveBattleDamage();
        } else if (mode === "summon") {
            this.resolveSummonResponse();
        }

        this.checkForWinner();
        return true;
    }

    // ------------------------------------------------------------------
    // TURN STRUCTURE
    // ------------------------------------------------------------------
    endPhase() {
        this.addLog(`\n--- END PHASE (${this.currentPlayer.name}) ---`);
        // Stop here and let the human actually see whose turn just ended
        // before flipping over to the other player. Passing this window
        // (endActionWindow's "end" branch) is what actually enforces the
        // hand-size limit and hands the turn over.
        this.state.waitingForAction = true;
    }

    // Rulebook rule: if you have more than 6 cards in hand at the End
    // Phase, discard down to 6. (Simplified: auto-discards the newest
    // cards first — the real rule lets the player choose which to keep.)
    enforceHandSizeLimit(player) {
        while (player.zone.hand.length > 6) {
            const card = player.zone.hand[player.zone.hand.length - 1];
            player.moveCard(card, "hand", "graveyard");
            this.addLog(`${player.name} discards ${card.card.name} (hand size limit of 6).`);
        }
    }

    endTurn() {
        // Revert any "until the End Phase" effects (Change of Heart control,
        // Reinforcements' ATK boost, Shrink's ATK halving, etc.)
        this.turnEffects.forEach(fn => fn());
        this.turnEffects = [];
        this.preventBattleDamageFor = null;
        this.preventDestructionFor = null;

        this.currentPlayer.normalSummonedThisTurn = false;
        this.currentPlayer.resetMonsterTurnFlags();
        this.firstTurn = false;

        const tmp = this.currentPlayer;
        this.currentPlayer = this.opponentPlayer;
        this.opponentPlayer = tmp;

        this.turn++;
        this.phase = "draw";

        this.addLog(`\n=== TURN ${this.turn} — ${this.currentPlayer.name}'s turn ===`);
    }

    renderPlaymat() {
        if (this.gameOver) {
            console.log(`\n DUEL OVER — ${this.winner.name} WINS! `);
        }
        console.log("\n=========== PLAYMAT ===========");
        this.renderPlayer(this.opponentPlayer, "TOP - Opponent");
        console.log("\n-------------------------------\n");
        this.renderPlayer(this.currentPlayer, "BOTTOM - Current");
        console.log("\n===============================\n");
    }

    renderPlayer(p, label) {
        console.log(label);
        console.log(`LP: ${p.lifePoints}`);
        console.log("HAND:");
        console.log(p.zone.hand.map(c => c.card.name).join(" | ") || "EMPTY");
        console.log("MONSTER ZONE:");
        console.log(
            p.zone.monster
                .map((c, i) => c ? `[${i}] ${c.card.name} (${c.position.toUpperCase()})` : `[${i}] EMPTY`)
                .join(" | ")
        );
        console.log("SPELL/TRAP ZONE:");
        console.log(
            p.zone.spellTrap
                .map((c, i) => c ? `[${i}] ${c.faceUp ? c.card.name : "Set Card"}` : `[${i}] EMPTY`)
                .join(" | ")
        );
        console.log(`GRAVEYARD: ${p.zone.graveyard.length} cards`);
    }
}

module.exports = MainGame;
