class MainGame {
    constructor(player1, player2) {
        this.player1 = player1;
        this.player2 = player2;

        this.currentPlayer = player1;
        this.opponentPlayer = player2;

        this.turn = 1;
        this.phase = "draw";
        this.firstTurn = true;

        this.state = {
            waitingForAction: false,
            actedThisWindow: false
        };
    }

    startDuel() {
        this.currentPlayer.shuffleDeck();
        this.opponentPlayer.shuffleDeck();

        this.currentPlayer.drawCard(5);
        this.opponentPlayer.drawCard(5);

        console.log("=== DUEL START ===");
        this.renderPlaymat();
    }

    // CRITICAL FIX: Restored missing "m1" phase handling 
    nextPhase() {
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
        // Turn 1 rules: In classic/modern rules, player 1 may or may not draw. 
        // Defaulting to standard draw engine logic.
        this.currentPlayer.drawCard(1);
        this.phase = "standby";
    }

    standbyPhase() {
        this.phase = "m1";
    }

    // CRITICAL FIX: No longer altering phase value to "idle"
    mainPhase1() {
        console.log(`\n--- MAIN1 (${this.currentPlayer.name}'s Action Turn) ---`);
        this.state.waitingForAction = true;
        this.state.actedThisWindow = false;
    }

    dispatch(action) {
        if (!this.state.waitingForAction) return;

        switch (action.type) {
            case "NORMAL_SUMMON":
                this.normalSummon(
                    action.payload.card,
                    action.payload.tributeIndices
                );
                break;
            case "PASS":
                this.endActionWindow();
                break;
        }
    }

    endActionWindow() {
        this.state.waitingForAction = false;
        if (this.firstTurn) {
            this.phase = "end";
        } else {
            this.phase = "battle";
        }
    }

    isMonster(gc) {
        return (
            gc.card.type.includes("Monster") ||
            gc.card.frameType === "normal" ||
            gc.card.frameType === "effect"
        );
    }

    getRequiredTributes(level) {
        if (level <= 4) return 0;
        if (level <= 6) return 1;
        if (level <= 8) return 2;
        return 3;
    }

    canNormalSummon(gc) {
        const p = this.currentPlayer;

        if (!this.isMonster(gc)) return false;
        if (p.normalSummonedThisTurn) return false;
        
        // Verify card instance actually exists in hand
        const hasCard = p.zone.hand.some(c => c.instanceId === gc.instanceId);
        if (!hasCard) return false;

        return p.getFreeMonsterSlot() !== -1;
    }

    // CRITICAL FIX: Rewritten completely to protect references across arrays
    normalSummon(gc, tributeIndices = []) {
        const p = this.currentPlayer;

        if (!this.canNormalSummon(gc)) return false;
        if (this.state.actedThisWindow) return false;

        const required = this.getRequiredTributes(gc.card.level);
        if (tributeIndices.length !== required) return false;

        // 1. Map lookups safely out of slot indices
        const tributesToProcess = [];
        for (const idx of tributeIndices) {
            const monsterToken = p.zone.monster[idx];
            if (!monsterToken) return false;
            tributesToProcess.push(monsterToken);
        }

        // 2. Clear out cards using unified helper pipelines
        for (const tributeCard of tributesToProcess) {
            p.moveCard(tributeCard, "monster", "graveyard");
        }

        // 3. Move summoned monster out of hand using clean API layer
        p.moveCard(gc, "hand", "monster");

        // 4. Update the state tokens directly on the instance card wrapper
        gc.faceUp = true;
        gc.position = "attack";
        gc.state.hasBeenSummonedThisTurn = true;

        p.normalSummonedThisTurn = true;
        this.state.actedThisWindow = true;

        console.log(`Summoned: ${gc.card.name} (SLOT ${gc.zoneIndex})`);
        return true;
    }

    battlePhase() {
        this.phase = "m2";
    }

    mainPhase2() {
        this.phase = "end";
    }

    endPhase() {
        this.endTurn();
    }

    endTurn() {
        this.currentPlayer.normalSummonedThisTurn = false;
        this.firstTurn = false; // Turn 1 actions resolved safely

        const tmp = this.currentPlayer;
        this.currentPlayer = this.opponentPlayer;
        this.opponentPlayer = tmp;

        this.turn++;
        this.phase = "draw";

        console.log(`\n=== TURN ${this.turn} ===`);
        console.log(`${this.currentPlayer.name}'s turn`);
    }

    renderPlaymat() {
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
        console.log(`GRAVEYARD: ${p.zone.graveyard.length} cards`);
    }
}

module.exports = MainGame;