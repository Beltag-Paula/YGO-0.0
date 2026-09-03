const MainGame = require("./MainGame");
const Player = require("./Player");

const p1 = new Player("Yugi", require("./deck_inventory/yugi.json"));
const p2 = new Player("Kaiba", require("./deck_inventory/kaiba.json"));

const game = new MainGame(p1, p2);

game.startDuel();

// =========================================================
// AI LOOP
// =========================================================
function loop() {
    // Stop simulation once a winner is decided or we hit a turn cap
    if (game.gameOver) {
        console.log("\n🏁 Simulation ended — duel resolved!");
        return;
    }
    if (game.turn > 20) {
        console.log("\n🏁 Simulation completed 20 turns without a winner.");
        return;
    }

    // Only advance phases if the engine isn't actively waiting for a choice.
    if (!game.state.waitingForAction) {
        game.nextPhase();
        setTimeout(loop, 400);
        return;
    }

    if (game.phase === "m1" || game.phase === "m2") {
        aiMainPhaseStep();
    } else if (game.phase === "battle") {
        aiBattlePhaseStep();
    }

    setTimeout(loop, 700);
}

// ---------------------------------------------------------
// AI: Main Phase (summon / tribute-summon, then pass)
// ---------------------------------------------------------
function aiMainPhaseStep() {
    const summonable = game.currentPlayer.zone.hand.filter(gc =>
        game.canNormalSummon(gc)
    );

    console.log(
        `\n🤖 [Turn ${game.turn}] ${game.currentPlayer.name}'s Summonable Cards:`,
        summonable.map(c => c.card.name).join(" | ") || "NONE"
    );

    let acted = false;

    if (summonable.length > 0) {
        const freeSummon = summonable.find(gc => game.getRequiredTributes(gc.card.level) === 0);

        if (freeSummon) {
            game.dispatch({
                type: "NORMAL_SUMMON",
                payload: { card: freeSummon, tributeIndices: [] }
            });
            acted = true;
        } else {
            const highLvlMonster = summonable[0];
            const requiredTributes = game.getRequiredTributes(highLvlMonster.card.level);

            const occupiedSlots = game.currentPlayer.zone.monster
                .map((slot, idx) => slot !== null ? idx : null)
                .filter(val => val !== null);

            if (occupiedSlots.length >= requiredTributes) {
                const tributeIndices = occupiedSlots.slice(0, requiredTributes);
                console.log(`⚠️ TRIBUTING slots [${tributeIndices}] to summon ${highLvlMonster.card.name}!`);

                game.dispatch({
                    type: "NORMAL_SUMMON",
                    payload: { card: highLvlMonster, tributeIndices }
                });
                acted = true;
            }
        }
    }

    if (!acted || game.state.actedThisWindow) {
        console.log(`💤 ${game.currentPlayer.name} passes the action window.`);
        game.dispatch({ type: "PASS" });
    }
}

// ---------------------------------------------------------
// AI: Battle Phase (attack with everything that can attack)
// ---------------------------------------------------------
function aiBattlePhaseStep() {
    const attackers = game.currentPlayer.zone.monster.filter(gc =>
        gc && game.canAttack(gc)
    );

    if (attackers.length === 0) {
        console.log(`💤 ${game.currentPlayer.name} has no attackers left, passing Battle Phase.`);
        game.dispatch({ type: "PASS" });
        return;
    }

    const attacker = attackers[0];
    const defenderMonsters = game.opponentPlayer.getMonstersOnField();

    if (defenderMonsters.length === 0) {
        console.log(`🤖 ${attacker.card.name} goes in for a direct attack!`);
        game.dispatch({ type: "ATTACK", payload: { attacker, target: null } });
        return;
    }

    // Naive AI: attack the weakest opposing monster (by ATK) it can beat,
    // otherwise just swing at the first one anyway.
    const beatable = defenderMonsters.filter(t => game.getAtk(attacker) > game.getAtk(t));
    const target = (beatable.length > 0)
        ? beatable.sort((a, b) => game.getAtk(a) - game.getAtk(b))[0]
        : defenderMonsters[0];

    console.log(`🤖 ${attacker.card.name} attacks ${target.card.name}!`);
    game.dispatch({ type: "ATTACK", payload: { attacker, target } });
}

loop();