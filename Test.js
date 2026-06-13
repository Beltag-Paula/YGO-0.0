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
    // Stop simulation automatically once we exceed 10 turns
    if (game.turn > 10) {
        console.log("\n🏁 Simulation completed 10 turns successfully!");
        return;
    }

    // CRITICAL FIX 1: Only advance phases if the engine isn't actively waiting for a choice.
    // This stops the engine from violently skipping past Main Phase 1.
    if (!game.state.waitingForAction) {
        game.nextPhase();
    } else {
        // We are inside the MAIN1 Action Window
        const summonable = game.currentPlayer.zone.hand.filter(gc =>
            game.canNormalSummon(gc)
        );

        console.log(
            `\n🤖 [Turn ${game.turn}] ${game.currentPlayer.name}'s Summonable Cards:`,
            summonable.map(c => c.card.name).join(" | ") || "NONE"
        );

        let acted = false;

        if (summonable.length > 0) {
            // Find a monster that requires 0 tributes (Level 1-4)
            const freeSummon = summonable.find(gc => game.getRequiredTributes(gc.card.level) === 0);

            if (freeSummon) {
                game.dispatch({
                    type: "NORMAL_SUMMON",
                    payload: {
                        card: freeSummon,
                        tributeIndices: []
                    }
                });
                acted = true;
            } 
            // If we have monsters but they are high level, check if we have enough tribute materials on field
            else {
                const highLvlMonster = summonable[0];
                const requiredTributes = game.getRequiredTributes(highLvlMonster.card.level);
                
                // Track non-empty monster slots
                const occupiedSlots = game.currentPlayer.zone.monster
                    .map((slot, idx) => slot !== null ? idx : null)
                    .filter(val => val !== null);

                if (occupiedSlots.length >= requiredTributes) {
                    const tributeIndices = occupiedSlots.slice(0, requiredTributes);
                    console.log(`⚠️ TRIBUTING slots [${tributeIndices}] to summon ${highLvlMonster.card.name}!`);
                    
                    game.dispatch({
                        type: "NORMAL_SUMMON",
                        payload: {
                            card: highLvlMonster,
                            tributeIndices: tributeIndices
                        }
                    });
                    acted = true;
                }
            }
        }

        // CRITICAL FIX 2: Only pass if we didn't perform a summon, OR if we already acted this turn.
        // This stops JavaScript from instantly passing the window before a summon can execute.
        if (!acted || game.state.actedThisWindow) {
            console.log(`💤 ${game.currentPlayer.name} passes the action window.`);
            game.dispatch({ type: "PASS" });
        }
    }

    setTimeout(loop, 700);
}

loop();