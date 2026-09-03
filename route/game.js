const express = require('express');
const router = express.Router();

const Player = require("../Player");
const MainGame = require("../MainGame");
const AIController = require("../AIController");

// In-memory global state storage container holding our active match room instance
let activeGameInstance = null;
let humanPlayer = null; // whichever Player object the browser user controls (Yugi)

// ---------------------------------------------------------
// Fast-forwards the engine through anything that doesn't need human
// input: empty Draw/Standby phases, and the AI opponent's entire turn
// (main phase actions, attacks, and battle responses).
// ---------------------------------------------------------
function advanceGame(game) {
    if (!game || !humanPlayer) return;

    let safety = 0;
    while (!game.gameOver && safety < 500) {
        safety++;

        if (game.state.awaitingResponse) {
            if (game.battleResponse.defender === humanPlayer) return; // human must decide
            if (!AIController.step(game)) return;
            continue;
        }

        if (!game.state.waitingForAction) {
            game.nextPhase();
            continue;
        }

        if (game.currentPlayer !== humanPlayer) {
            if (!AIController.step(game)) return;
            continue;
        }

        return; // human's turn, human's action window — stop and wait
    }
}

// ---------------------------------------------------------
// 1. BOOT/START ROUTE (Hit this first!)
// ---------------------------------------------------------
router.get("/start", (req, res) => {
    try {
        const yugiDeck = require("../deck_inventory/yugi.json");
        const kaibaDeck = require("../deck_inventory/kaiba.json");

        const p1 = new Player("Yugi", yugiDeck);
        const p2 = new Player("Kaiba", kaibaDeck);

        humanPlayer = p1;
        activeGameInstance = new MainGame(p1, p2);
        activeGameInstance.startDuel();
        advanceGame(activeGameInstance);

        res.redirect("/game");
    } catch (err) {
        res.status(500).send(`CRITICAL ERROR: Failed to parse inventory JSON configurations or engine failed initialization: ${err.message}`);
    }
});

// ---------------------------------------------------------
// 2. PRIMARY ARENA RENDER BOARD VIEW
// ---------------------------------------------------------
router.get("/", (req, res) => {
    if (!activeGameInstance) {
        return res.redirect("/game/start");
    }

    res.render("game", {
        player1: activeGameInstance.player1,
        player2: activeGameInstance.player2,
        currentPlayer: activeGameInstance.currentPlayer,
        opponentPlayer: activeGameInstance.opponentPlayer,
        phase: activeGameInstance.phase,
        waitingForAction: activeGameInstance.state.waitingForAction,
        actedThisWindow: activeGameInstance.state.actedThisWindow,
        awaitingResponse: activeGameInstance.state.awaitingResponse,
        battleResponse: activeGameInstance.battleResponse,
        pendingAttack: activeGameInstance.pendingAttack,
        gameOver: activeGameInstance.gameOver,
        winner: activeGameInstance.winner,
        humanPlayer: humanPlayer,
        log: activeGameInstance.log,
        lastBattleEvent: activeGameInstance.lastBattleEvent,
        game: activeGameInstance
    });
});

// ---------------------------------------------------------
// 3. PHASE ENGINE MUTATION HANDLER
// ---------------------------------------------------------
router.post("/next-phase", (req, res) => {
    if (activeGameInstance) {
        if (activeGameInstance.state.waitingForAction && !activeGameInstance.state.awaitingResponse) {
            activeGameInstance.dispatch({ type: "PASS" });
        } else if (!activeGameInstance.state.waitingForAction) {
            activeGameInstance.nextPhase();
        }
        advanceGame(activeGameInstance);
    }
    res.redirect("/game");
});

// ---------------------------------------------------------
// 4. NORMAL SUMMON (from hand)
// ---------------------------------------------------------
router.post("/summon", (req, res) => {
    const { instanceId, tributeIndices } = req.body;

    if (activeGameInstance) {
        const targetCard = activeGameInstance.currentPlayer.zone.hand.find(
            gc => gc.instanceId === instanceId
        );

        if (targetCard) {
            const indices = tributeIndices
                ? String(tributeIndices).split(",").filter(s => s !== "").map(Number)
                : [];
            activeGameInstance.dispatch({
                type: "NORMAL_SUMMON",
                payload: { card: targetCard, tributeIndices: indices }
            });
        }
        advanceGame(activeGameInstance);
    }
    res.redirect("/game");
});

// ---------------------------------------------------------
// 5. SET MONSTER FACE-DOWN (DEF)
// ---------------------------------------------------------
router.post("/set", (req, res) => {
    const { instanceId, tributeIndices } = req.body;

    if (activeGameInstance) {
        const targetCard = activeGameInstance.currentPlayer.zone.hand.find(
            gc => gc.instanceId === instanceId
        );

        if (targetCard) {
            const indices = tributeIndices
                ? String(tributeIndices).split(",").filter(s => s !== "").map(Number)
                : [];
            activeGameInstance.dispatch({
                type: "SET_MONSTER",
                payload: { card: targetCard, tributeIndices: indices }
            });
        }
        advanceGame(activeGameInstance);
    }
    res.redirect("/game");
});

// ---------------------------------------------------------
// 6. CHANGE BATTLE POSITION (own field monster, main phase only)
// ---------------------------------------------------------
router.post("/change-position", (req, res) => {
    const { instanceId } = req.body;

    if (activeGameInstance) {
        const targetCard = activeGameInstance.currentPlayer.zone.monster.find(
            gc => gc && gc.instanceId === instanceId
        );

        if (targetCard) {
            activeGameInstance.dispatch({
                type: "CHANGE_POSITION",
                payload: { card: targetCard }
            });
        }
        advanceGame(activeGameInstance);
    }
    res.redirect("/game");
});

// ---------------------------------------------------------
// 7. DECLARE ATTACK (targetInstanceId omitted/empty = direct attack)
// ---------------------------------------------------------
router.post("/attack", (req, res) => {
    const { attackerInstanceId, targetInstanceId } = req.body;

    if (activeGameInstance) {
        const attacker = activeGameInstance.currentPlayer.zone.monster.find(
            gc => gc && gc.instanceId === attackerInstanceId
        );

        let target = null;
        if (targetInstanceId) {
            target = activeGameInstance.opponentPlayer.zone.monster.find(
                gc => gc && gc.instanceId === targetInstanceId
            ) || null;
        }

        if (attacker) {
            activeGameInstance.dispatch({ type: "ATTACK", payload: { attacker, target } });
        }
        advanceGame(activeGameInstance);
    }
    res.redirect("/game");
});

// ---------------------------------------------------------
// 8. ACTIVATE A SPELL DIRECTLY FROM HAND
// ---------------------------------------------------------
router.post("/activate-spell", (req, res) => {
    const { instanceId, targetInstanceId } = req.body;

    if (activeGameInstance) {
        const targetCard = activeGameInstance.currentPlayer.zone.hand.find(
            gc => gc.instanceId === instanceId
        );

        if (targetCard) {
            activeGameInstance.dispatch({
                type: "ACTIVATE_SPELL",
                payload: { card: targetCard, targetInstanceId: targetInstanceId || null }
            });
        }
        advanceGame(activeGameInstance);
    }
    res.redirect("/game");
});

// ---------------------------------------------------------
// 9. SET A SPELL/TRAP FACE-DOWN (from hand)
// ---------------------------------------------------------
router.post("/set-spell-trap", (req, res) => {
    const { instanceId } = req.body;

    if (activeGameInstance) {
        const targetCard = activeGameInstance.currentPlayer.zone.hand.find(
            gc => gc.instanceId === instanceId
        );

        if (targetCard) {
            activeGameInstance.dispatch({ type: "SET_SPELL_TRAP", payload: { card: targetCard } });
        }
        advanceGame(activeGameInstance);
    }
    res.redirect("/game");
});

// ---------------------------------------------------------
// 10. ACTIVATE A SET SPELL/TRAP (own Main Phase OR a Battle Response)
// ---------------------------------------------------------
router.post("/activate-set-card", (req, res) => {
    const { instanceId, targetInstanceId } = req.body;

    if (activeGameInstance) {
        const targetCard = activeGameInstance.findSpellTrapAnywhereOnField(instanceId);

        if (targetCard) {
            activeGameInstance.dispatch({
                type: "ACTIVATE_SET_CARD",
                payload: { card: targetCard, targetInstanceId: targetInstanceId || null }
            });
        }
        advanceGame(activeGameInstance);
    }
    res.redirect("/game");
});

// ---------------------------------------------------------
// 11. DECLINE TO RESPOND DURING A BATTLE RESPONSE WINDOW
// ---------------------------------------------------------
router.post("/pass-response", (req, res) => {
    if (activeGameInstance) {
        activeGameInstance.dispatch({ type: "PASS_RESPONSE" });
        advanceGame(activeGameInstance);
    }
    res.redirect("/game");
});

module.exports = router;
