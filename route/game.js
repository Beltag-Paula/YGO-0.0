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

        try {
            if (game.state.awaitingResponse) {
                if (game.battleResponse.defender === humanPlayer) return; // human must decide
                const result = AIController.step(game);
                if (!result.acted) return;
                if (result.visible) return; // pause here so the human can see this before it continues
                continue;
            }

            if (!game.state.waitingForAction) {
                game.nextPhase();
                continue;
            }

            if (game.currentPlayer !== humanPlayer) {
                const result = AIController.step(game);
                if (!result.acted) return;
                if (result.visible) return; // pause so the human can watch this action happen
                continue;
            }

            return; // human's turn, human's action window — stop and wait
        } catch (err) {
            // A bad AI action or an edge case in a card effect should never
            // take the whole server down. Log it, force the AI to give up
            // its current window, and keep the duel playable.
            console.error("advanceGame() caught an error, forcing a PASS to recover:", err);
            if (game.state.awaitingResponse) {
                game.dispatch({ type: "PASS_RESPONSE" });
            } else if (game.state.waitingForAction) {
                game.dispatch({ type: "PASS" });
            } else {
                return;
            }
        }
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
        lastDrawEvent: activeGameInstance.lastDrawEvent,
        lastDiscardEvent: activeGameInstance.lastDiscardEvent,
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
// 3b. JUMP FORWARD TO A SPECIFIC PHASE (M1/BP/M2/EP buttons)
// Skips ahead through any intervening phases by repeatedly passing/
// advancing — the exact same primitives the AI uses for its own turn,
// just driven directly by the human instead of one step at a time.
// ---------------------------------------------------------
const PHASE_ORDER = ["draw", "standby", "m1", "battle", "m2", "end"];

function advanceToPhase(game, targetPhase) {
    const targetIdx = PHASE_ORDER.indexOf(targetPhase);
    if (targetIdx === -1) return;

    // CRITICAL: this loop must never cross into the opponent's turn. If
    // "end" is the target and passing it triggers endTurn() (handing the
    // turn to Kaiba), this loop must stop immediately — otherwise it keeps
    // blindly calling dispatch(PASS)/nextPhase() through Kaiba's ENTIRE
    // turn (summon, battle, everything) without ever letting AIController
    // actually act, which is exactly what caused Kaiba to never attack.
    const startingPlayer = game.currentPlayer;

    let safety = 0;
    while (!game.gameOver && safety < 30) {
        safety++;
        if (game.currentPlayer !== startingPlayer) return; // turn changed hands — stop, let advanceGame() drive the AI properly

        const curIdx = PHASE_ORDER.indexOf(game.phase);

        if (curIdx > targetIdx) return; // can't jump backward
        if (curIdx === targetIdx && game.state.waitingForAction) return; // arrived, and it's an open window

        if (game.state.awaitingResponse) return; // a response window always takes priority

        if (game.state.waitingForAction) {
            // Still short of the target phase — give up the rest of this
            // window and move on.
            game.dispatch({ type: "PASS" });
        } else {
            game.nextPhase();
        }
    }
}

router.post("/goto-phase", (req, res) => {
    const { targetPhase } = req.body;
    if (activeGameInstance && activeGameInstance.currentPlayer === humanPlayer) {
        advanceToPhase(activeGameInstance, targetPhase);
        advanceGame(activeGameInstance);
    }
    res.redirect("/game");
});

// ---------------------------------------------------------
// 3c. LET THE AI TAKE ITS NEXT ACTION (one visible step at a time, so the
// human can watch Kaiba's turn unfold instead of it resolving all at once)
// ---------------------------------------------------------
router.post("/continue-ai", (req, res) => {
    if (activeGameInstance) {
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
