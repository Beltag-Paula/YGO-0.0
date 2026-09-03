/**
 * AIController.js
 * Heuristic (not "smart") AI. Each call performs AT MOST one dispatched
 * action for game.currentPlayer, then returns — callers loop this until
 * the AI passes/ends its window. Kept deliberately simple and readable.
 */
const Effects = require("./Effects.js");

function actMainPhase(game) {
    const p = game.currentPlayer;

    // 1) Try to Normal Summon / Tribute Summon the best available monster.
    if (!game.state.actedThisWindow) {
        const summonable = p.zone.hand.filter(gc => game.canNormalSummon(gc));
        if (summonable.length > 0) {
            const free = summonable
                .filter(gc => game.getRequiredTributes(gc.card.level) === 0)
                .sort((a, b) => (b.card.atk || 0) - (a.card.atk || 0))[0];

            if (free) {
                game.dispatch({ type: "NORMAL_SUMMON", payload: { card: free, tributeIndices: [] } });
                return true;
            }

            const big = summonable.sort((a, b) => (b.card.atk || 0) - (a.card.atk || 0))[0];
            const required = game.getRequiredTributes(big.card.level);
            const occupied = p.zone.monster.map((s, i) => (s ? i : null)).filter(v => v !== null);

            if (occupied.length >= required) {
                game.dispatch({
                    type: "NORMAL_SUMMON",
                    payload: { card: big, tributeIndices: occupied.slice(0, required) }
                });
                return true;
            }
        }
    }

    // 2) Opportunistically set a Trap/Continuous Spell from hand if there's room.
    const setCandidate = p.zone.hand.find(gc => {
        const meta = Effects.getMeta(gc.card.name);
        return meta && (meta.kind === "trap" || meta.subtype === "continuous" || meta.subtype === "equip");
    });
    if (setCandidate && p.getFreeSpellTrapSlot() !== -1) {
        game.dispatch({ type: "SET_SPELL_TRAP", payload: { card: setCandidate } });
        return true;
    }

    // 3) Cast an instant-effect Normal Spell if it looks useful.
    const instantSpell = p.zone.hand.find(gc => {
        const meta = Effects.getMeta(gc.card.name);
        return meta && meta.kind === "spell" && meta.subtype === "normal" && !meta.needsTarget;
    });
    if (instantSpell && p.getFreeSpellTrapSlot() !== -1) {
        game.dispatch({ type: "ACTIVATE_SPELL", payload: { card: instantSpell } });
        return true;
    }

    // Nothing productive left to do — pass the window.
    game.dispatch({ type: "PASS" });
    return true;
}

function actBattlePhase(game) {
    const attackers = game.currentPlayer.zone.monster.filter(gc => gc && game.canAttack(gc));

    if (attackers.length === 0) {
        game.dispatch({ type: "PASS" });
        return true;
    }

    const attacker = attackers.sort((a, b) => game.getAtk(b) - game.getAtk(a))[0];
    const defenderMonsters = game.opponentPlayer.getMonstersOnField();

    if (defenderMonsters.length === 0) {
        game.dispatch({ type: "ATTACK", payload: { attacker, target: null } });
        return true;
    }

    const beatable = defenderMonsters.filter(t => game.getAtk(attacker) > game.getAtk(t));
    const target = beatable.length > 0
        ? beatable.sort((a, b) => game.getAtk(a) - game.getAtk(b))[0]
        : defenderMonsters.sort((a, b) => game.getAtk(a) - game.getAtk(b))[0];

    game.dispatch({ type: "ATTACK", payload: { attacker, target } });
    return true;
}

// Called when the AI is the DEFENDER during a Battle Response Window.
function actBattleResponse(game) {
    const defender = game.battleResponse.defender;
    const eligible = game.getEligibleResponses(defender);

    // Naive: fire the first eligible response (favors Mirror Force/Negate
    // Attack when present since they're the most impactful).
    const priority = eligible.find(gc => {
        const n = Effects.normalize(gc.card.name);
        return n === "mirror force" || n === "negate attack";
    }) || eligible[0];

    if (!priority) {
        game.dispatch({ type: "PASS_RESPONSE" });
        return true;
    }

    const meta = Effects.getMeta(priority.card.name);
    let targetInstanceId = null;

    if (meta.needsTarget === "monster") {
        const t = game.pendingAttack.attacker;
        targetInstanceId = t ? t.instanceId : null;
    } else if (meta.needsTarget === "graveyardMonster") {
        const gyMon = defender.zone.graveyard.find(m => game.isMonster(m));
        targetInstanceId = gyMon ? gyMon.instanceId : null;
    } else if (meta.needsTarget === "spellTrap") {
        const enemy = defender === game.player1 ? game.player2 : game.player1;
        const stCard = enemy.getSpellTrapsOnField()[0];
        targetInstanceId = stCard ? stCard.instanceId : null;
    }

    if (meta.needsTarget && !targetInstanceId) {
        game.dispatch({ type: "PASS_RESPONSE" });
        return true;
    }

    game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: priority, targetInstanceId } });
    return true;
}

/**
 * Runs the AI's turn/response forward one atomic step. Returns true if it
 * did something (caller should loop again), false if there was nothing to do.
 */
function step(game) {
    if (game.gameOver) return false;

    if (game.state.awaitingResponse) {
        if (game.battleResponse.defender === game.currentPlayer) return false; // not AI's response to make
        return actBattleResponse(game);
    }

    if (!game.state.waitingForAction) return false;

    if (game.phase === "m1" || game.phase === "m2") return actMainPhase(game);
    if (game.phase === "battle") return actBattlePhase(game);

    return false;
}

module.exports = { step };
