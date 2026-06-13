const express = require('express');
const router = express.Router();

// Step back one folder directory to import your game engine logic files safely
const Player = require("../Player");
const MainGame = require("../MainGame");

// In-memory global state storage container holding our active match room instance
let activeGameInstance = null;

// ---------------------------------------------------------
// 1. BOOT/START ROUTE (Hit this first!)
// ---------------------------------------------------------
router.get("/start", (req, res) => {
    try {
        // Dynamically load your inventory decks
        const yugiDeck = require("../deck_inventory/yugi.json");
        const kaibaDeck = require("../deck_inventory/kaiba.json");

        const p1 = new Player("Yugi", yugiDeck);
        const p2 = new Player("Kaiba", kaibaDeck);

        // Instantiating the duel
        activeGameInstance = new MainGame(p1, p2);
        activeGameInstance.startDuel();

        // Redirect directly to the interactive display arena below
        res.redirect("/game");
    } catch (err) {
        res.status(500).send(`CRITICAL ERROR: Failed to parse inventory JSON configurations or engine failed initialization: ${err.message}`);
    }
});

// ---------------------------------------------------------
// 2. PRIMARY ARENA RENDER BOARD VIEW
// ---------------------------------------------------------
router.get("/", (req, res) => {
    // Safety Net: Guard loop redirects users back to boot configuration if engine is empty
    if (!activeGameInstance) {
        return res.redirect("/game/start");
    }

    res.render("game", {
        player1: activeGameInstance.player1,
        player2: activeGameInstance.player2,
        currentPlayer: activeGameInstance.currentPlayer,
        phase: activeGameInstance.phase,
        waitingForAction: activeGameInstance.state.waitingForAction,
        actedThisWindow: activeGameInstance.state.actedThisWindow
    });
});

// ---------------------------------------------------------
// 3. PHASE ENGINE MUTATION HANDLER
// ---------------------------------------------------------
router.post("/next-phase", (req, res) => {
    if (activeGameInstance) {
        // If we are sitting inside Main Phase 1 waiting for choices, treat Phase Click as a Pass
        if (activeGameInstance.state.waitingForAction && activeGameInstance.phase === "m1") {
            activeGameInstance.dispatch({ type: "PASS" });
        } else {
            activeGameInstance.nextPhase();
        }
    }
    res.redirect("/game");
});

// ---------------------------------------------------------
// 4. ACTION CONTROLLER INTERFACE SUMMON PIPE
// ---------------------------------------------------------
router.post("/summon", (req, res) => {
    const { instanceId } = req.body;
    
    if (activeGameInstance) {
        // Locate target tracking instance down out of current acting hand zone collection
        const targetCard = activeGameInstance.currentPlayer.zone.hand.find(
            gc => gc.instanceId === instanceId
        );

        if (targetCard) {
            // Processing Level 1-4 normal setups with 0 tributes required
            activeGameInstance.dispatch({
                type: "NORMAL_SUMMON",
                payload: {
                    card: targetCard,
                    tributeIndices: []
                }
            });
        }
    }
    res.redirect("/game");
});

module.exports = router;