/**
 * AIController.js
 * Heuristic (not "smart") AI. Each call performs AT MOST one dispatched
 * action for game.currentPlayer, then returns — callers loop this until
 * the AI passes/ends its window. Kept deliberately simple and readable.
 *
 * step()/the act* functions return { acted, visible }:
 *   acted:   true if the AI did anything at all (including just passing)
 *   visible: true if it was something worth showing the human before
 *            moving on (summon, set, attack, activate) — false for a
 *            bare PASS, which has nothing to display.
 *
 * The summon and attack decisions below are a hand-written evaluation
 * function (score a position, pick the best-scoring option) — the same
 * basic idea minimax/MCTS is built on, but without an actual multi-ply
 * search tree. A real search would need to explore hypothetical future
 * board states several turns deep; this instead just scores the
 * immediate outcome of each option directly. It's meaningfully smarter
 * than "always attack with your biggest monster" while staying simple
 * enough to reason about and to keep every decision instant.
 */
const Effects = require("./Effects.js");

// Should this monster go face-up Attack or face-down Defense when
// summoned? Compares its real (dynamic-stat-aware) ATK/DEF against the
// strongest thing already on the opponent's field.
function decideSummonPosition(game, gc) {
    const opponent = game.opponentPlayer;
    const oppMonsters = opponent.getMonstersOnField();
    if (oppMonsters.length === 0) return "attack"; // nothing to worry about — go aggressive

    const atk = game.getAtk(gc);
    const def = game.getDef(gc);
    const maxOppAtk = Math.max(...oppMonsters.map(m => game.getAtk(m)));

    if (atk > maxOppAtk) return "attack";   // already beats their best attacker in a fight
    if (def > maxOppAtk) return "defense";  // safely walls their best attacker instead
    if (atk >= def) return "attack";        // no safe wall available; still lean into its stronger stat
    return "defense";
}

function actMainPhase(game) {
    const p = game.currentPlayer;

    // 1) Try to Normal Summon / Tribute Summon the best available monster,
    // in whichever position (Attack or Defense) makes sense right now.
    if (!game.state.actedThisWindow) {
        const summonable = p.zone.hand.filter(gc => game.canNormalSummon(gc));
        if (summonable.length > 0) {
            const free = summonable
                .filter(gc => game.getRequiredTributes(gc.card.level) === 0)
                .sort((a, b) => game.getAtk(b) - game.getAtk(a))[0];

            if (free) {
                const position = decideSummonPosition(game, free);
                if (position === "defense") {
                    game.dispatch({ type: "SET_MONSTER", payload: { card: free, tributeIndices: [] } });
                } else {
                    game.dispatch({ type: "NORMAL_SUMMON", payload: { card: free, tributeIndices: [] } });
                }
                return { acted: true, visible: true };
            }

            const big = summonable.sort((a, b) => game.getAtk(b) - game.getAtk(a))[0];
            const required = game.getRequiredTributes(big.card.level);
            const occupied = p.zone.monster.map((s, i) => (s ? i : null)).filter(v => v !== null);

            if (occupied.length >= required) {
                const tributeIndices = occupied.slice(0, required);
                const position = decideSummonPosition(game, big);
                if (position === "defense") {
                    game.dispatch({ type: "SET_MONSTER", payload: { card: big, tributeIndices } });
                } else {
                    game.dispatch({ type: "NORMAL_SUMMON", payload: { card: big, tributeIndices } });
                }
                return { acted: true, visible: true };
            }
        }
    }

    // 1b) Fire off any ready ignition monster effect (Breaker's Spell
    // Counter, Obelisk's Tribute-2 wipe, Rabid Horseman's destruction).
    const ignitionMonster = p.getMonstersOnField().find(gc => {
        const ign = Effects.getIgnition(gc.card.name);
        return ign && !gc.modifiers?.effectsNegated && ign.canActivate(game, gc);
    });
    if (ignitionMonster) {
        const ign = Effects.getIgnition(ignitionMonster.card.name);
        let targetInstanceId = null;
        if (ign.needsTarget === "spellTrap") {
            const enemy = p === game.player1 ? game.player2 : game.player1;
            const st = enemy.getSpellTrapsOnField()[0];
            targetInstanceId = st ? st.instanceId : null;
        } else if (ign.needsTarget === "monster") {
            const enemy = p === game.player1 ? game.player2 : game.player1;
            const mon = enemy.getMonstersOnField().sort((a, b) => game.getAtk(b) - game.getAtk(a))[0];
            targetInstanceId = mon ? mon.instanceId : null;
        }
        if (!ign.needsTarget || targetInstanceId) {
            game.dispatch({ type: "ACTIVATE_MONSTER_EFFECT", payload: { card: ignitionMonster, targetInstanceId } });
            return { acted: true, visible: true };
        }
    }

    // 2) Opportunistically set a Trap/Continuous Spell from hand if there's room.
    const setCandidate = p.zone.hand.find(gc => {
        const meta = Effects.getMeta(gc.card.name);
        return meta && (meta.kind === "trap" || meta.subtype === "continuous" || meta.subtype === "equip");
    });
    if (setCandidate && p.getFreeSpellTrapSlot() !== -1) {
        game.dispatch({ type: "SET_SPELL_TRAP", payload: { card: setCandidate } });
        return { acted: true, visible: true };
    }

    // 3) Cast an instant-effect Normal Spell if it looks useful.
    const instantSpell = p.zone.hand.find(gc => {
        const meta = Effects.getMeta(gc.card.name);
        if (!meta || meta.kind !== "spell" || meta.subtype !== "normal" || meta.needsTarget) return false;
        // Ritual spells need a matching Ritual Monster + enough Tribute
        // Levels — skip them here rather than retrying a doomed
        // activation every loop (that would never mark actedThisWindow
        // and would spin forever).
        if (meta.precheck === "ritual" && !game.canRitualSummon(p, gc)) return false;
        if (meta.cost?.lp && p.lifePoints <= meta.cost.lp) return false;
        return true;
    });
    if (instantSpell && p.getFreeSpellTrapSlot() !== -1) {
        game.dispatch({ type: "ACTIVATE_SPELL", payload: { card: instantSpell } });
        return { acted: true, visible: true };
    }

    // Nothing productive left to do — pass the window.
    game.dispatch({ type: "PASS" });
    return { acted: true, visible: false };
}

// Scores a hypothetical attack. Positive = worth doing, negative = a bad
// trade the AI should avoid making just because it technically can.
function evaluateAttack(game, attacker, target) {
    const atkVal = game.getAtk(attacker);

    if (target.position === "attack") {
        const targetAtk = game.getAtk(target);
        if (atkVal > targetAtk) return 50 + (atkVal - targetAtk);  // destroys their monster and deals damage
        if (atkVal === targetAtk) return -20;                       // mutual destruction — rarely worth starting
        return -200;                                                 // my monster just dies for nothing
    }

    const targetDef = game.getDef(target);
    if (atkVal > targetDef) return 30 + (atkVal - targetDef);       // destroys their defender, no damage but tempo
    if (atkVal === targetDef) return 2;                              // harmless poke, nobody dies
    return -Math.min(60, (targetDef - atkVal) / 15);                 // bounces off and costs LP for nothing
}

function actBattlePhase(game) {
    const attackers = game.currentPlayer.zone.monster.filter(gc => gc && game.canAttack(gc));

    if (attackers.length === 0) {
        game.dispatch({ type: "PASS" });
        return { acted: true, visible: false };
    }

    const opponent = game.opponentPlayer;
    const defenders = opponent.getMonstersOnField();

    if (defenders.length === 0) {
        // No blockers — a direct attack is always safe. Lead with the
        // biggest hitter, prioritizing lethal if it's on the table.
        const lethal = attackers.find(a => game.getAtk(a) >= opponent.lifePoints);
        const chosen = lethal || attackers.sort((a, b) => game.getAtk(b) - game.getAtk(a))[0];
        game.dispatch({ type: "ATTACK", payload: { attacker: chosen, target: null } });
        return { acted: true, visible: true };
    }

    let bestChoice = null;
    let bestScore = -Infinity;

    for (const attacker of attackers) {
        for (const target of defenders) {
            const score = evaluateAttack(game, attacker, target);
            if (score > bestScore) {
                bestScore = score;
                bestChoice = { attacker, target };
            }
        }
    }

    // If every possible attack is a bad trade, hold back rather than
    // throwing a monster away just because it technically could attack.
    if (!bestChoice || bestScore < 0) {
        game.dispatch({ type: "PASS" });
        return { acted: true, visible: false };
    }

    game.dispatch({ type: "ATTACK", payload: bestChoice });
    return { acted: true, visible: true };
}

// Called when the AI is the DEFENDER during a Battle Response Window.
function actBattleResponse(game) {
    const defender = game.battleResponse.defender;

    // Kuriboh-style hand effects only make sense when actually about to
    // take real damage from this attack — hold onto it otherwise.
    const attacker = game.pendingAttack && game.pendingAttack.attacker;
    const wouldTakeDamage = attacker && game.getAtk(attacker) > 0;
    if (wouldTakeDamage) {
        const handResponse = game.getEligibleHandResponses(defender)[0];
        if (handResponse) {
            game.dispatch({ type: "ACTIVATE_HAND_CARD", payload: { card: handResponse } });
            return { acted: true, visible: true };
        }
    }

    const eligible = game.getEligibleResponses(defender).filter(gc => {
        const meta = Effects.getMeta(gc.card.name);
        // Skip anything whose activation cost the defender can't actually
        // pay right now — picking it anyway would fail every time this
        // function is called and spin forever.
        if (meta.cost?.tributeMinAtk) {
            return defender.getMonstersOnField().some(m => game.getAtk(m) >= meta.cost.tributeMinAtk);
        }
        if (meta.cost?.lp) {
            return defender.lifePoints > meta.cost.lp;
        }
        return true;
    });

    // Naive: fire the first eligible response (favors Mirror Force/Negate
    // Attack when present since they're the most impactful).
    const priority = eligible.find(gc => {
        const n = Effects.normalize(gc.card.name);
        return n === "mirror force" || n === "negate attack";
    }) || eligible[0];

    if (!priority) {
        game.dispatch({ type: "PASS_RESPONSE" });
        return { acted: true, visible: false };
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
        return { acted: true, visible: false };
    }

    game.dispatch({ type: "ACTIVATE_SET_CARD", payload: { card: priority, targetInstanceId } });
    return { acted: true, visible: true };
}

/**
 * Runs the AI's turn/response forward one atomic step. Returns
 * { acted, visible } — see file header. { acted: false } means there
 * was nothing for the AI to do right now (not its window).
 */
function step(game) {
    if (game.gameOver) return { acted: false, visible: false };

    if (game.state.awaitingResponse) {
        if (game.battleResponse.defender === game.currentPlayer) return { acted: false, visible: false };
        return actBattleResponse(game);
    }

    if (!game.state.waitingForAction) return { acted: false, visible: false };

    if (game.phase === "m1" || game.phase === "m2") return actMainPhase(game);
    if (game.phase === "battle") return actBattlePhase(game);

    // Draw/Standby/End have nothing for the AI to decide (yet) — but they
    // ARE their own visible step, so the human can watch Kaiba's turn
    // tick through every phase instead of only the ones with choices.
    if (game.phase === "draw" || game.phase === "standby" || game.phase === "end") {
        game.dispatch({ type: "PASS" });
        return { acted: true, visible: true };
    }

    return { acted: false, visible: false };
}

module.exports = { step };
