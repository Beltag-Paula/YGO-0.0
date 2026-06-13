class MainGame {
    constructor(player1, player2) {
        this.player1 = player1;
        this.player2 = player2;

        this.currentPlayer = player1;
        this.opponentPlayer = player2;

        this.turn = 1;
        this.phase = "draw";
        this.firstTurn = true;
    }

    // -------------------------
    // DUEL START
    // -------------------------
    startDuel() {
        this.currentPlayer.shuffleDeck();
        this.opponentPlayer.shuffleDeck();

        this.currentPlayer.drawCard(5);
        this.opponentPlayer.drawCard(5);

        console.log("=== DUEL START ===");
        console.log(`${this.currentPlayer.name} goes first`);

        this.renderPlaymat();
    }

    // -------------------------
    // TURN FLOW
    // -------------------------
    drawPhase() {
        console.log(`This is DP`);
        this.currentPlayer.drawCard(1);
        this.phase = "standby";
    }

    standbyPhase() {
        console.log(`This is SP`);

        this.phase = "m1";
    }

    mainPhase1() {
        console.log(`This is M1`);

        if (this.firstTurn) {
            this.phase = "end";
        } else {
            this.phase = "battle";
        }
    }

    battlePhase() {
        console.log(`This is BP`);

        this.phase = "m2";
    }

    mainPhase2() {
        console.log(`This is M2`);

        this.phase = "end";
    }

    endPhase() {
        console.log(`This is EP`)
        this.endTurn();
    }

    endTurn() {
        this.currentPlayer.normalSummonedThisTurn = false;

        this.turn++;

        if (this.firstTurn) this.firstTurn = false;

        const temp = this.currentPlayer;
        this.currentPlayer = this.opponentPlayer;
        this.opponentPlayer = temp;

        this.phase = "draw";

        console.log(`\n=== TURN ${this.turn} ===`);
        console.log(`Current Player: ${this.currentPlayer.name}`);
    }

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
            default:
                throw new Error("Invalid phase");
        }

        this.renderPlaymat();
    }

    isNormalMonster(gc) {
        return gc.card.type === "Normal Monster";
    }

    isEffectMonster(gc) {
        return gc.card.type === "Effect Monster";
    }

    isFusionMonster(gc) {
        return gc.card.type === "Fusion Monster";
    }

    isRitualMonster(gc) {
        return gc.card.type === "Ritual Monster";
    }

    isNormalSummonableMonster(gc) {
        return (
            this.isNormalMonster(gc) ||
            this.isEffectMonster(gc)
        );
    }

    getRequiredTributes(gc) {
        const level = gc.card.level;

        if (level <= 4) return 0;
        if (level <= 6) return 1;
        if (level <= 8) return 2;

        return 3;
    }

    canNormalSummon(gc, tributeIndices = []) {
        const player = this.currentPlayer;

        if (!this.isNormalSummonableMonster(gc)) {
            return false;
        }

        if (player.normalSummonedThisTurn) {
            return false;
        }

        if (!player.zone.hand.includes(gc)) {
            return false;
        }

        if (player.getFreeMonsterSlot() === -1) {
            return false;
        }

        const requiredTributes = this.getRequiredTributes(gc);

        if (tributeIndices.length !== requiredTributes) {
            return false;
        }

        for (const index of tributeIndices) {
            if (!player.zone.monster[index]) {
                return false;
            }
        }

        return true;
    }

    canFusionSummon(fusionMonster, materialCards = []) {
        const player = this.currentPlayer;

        if (!this.isFusionMonster(fusionMonster)) {
            return false;
        }

        const hasPolymerization =
            player.zone.hand.some(
                gc => gc.card.name === "Polymerization"
            );

        if (!hasPolymerization) {
            return false;
        }

        if (!player.zone.extraDeck.includes(fusionMonster)) {
            return false;
        }

        for (const material of materialCards) {
            const inHand =
                player.zone.hand.includes(material);

            const onField =
                player.zone.monster.includes(material);

            if (!inHand && !onField) {
                return false;
            }
        }

        return true;
    }

    canRitualSummon(
        ritualMonster,
        ritualSpell,
        tributeCards = []
    ) {
        const player = this.currentPlayer;

        if (!this.isRitualMonster(ritualMonster)) {
            return false;
        }

        if (!player.zone.hand.includes(ritualMonster)) {
            return false;
        }

        if (!player.zone.hand.includes(ritualSpell)) {
            return false;
        }

        const totalLevels =
            tributeCards.reduce(
                (sum, gc) => sum + (gc.card.level || 0),
                0
            );

        return totalLevels >= ritualMonster.card.level;
    }

    normalSummon(gc, tributeIndices = []) {
    const player = this.currentPlayer;

    if (!this.canNormalSummon(gc, tributeIndices)) {
        return false;
    }

    for (const index of tributeIndices) {
        player.removeMonsterAt(index);
    }

    player.removeCard(gc, "hand");

    const slot = player.getFreeMonsterSlot();

    player.zone.monster[slot] = gc;

    gc.location = "monster";
    gc.zoneIndex = slot;
    gc.faceUp = true;
    gc.position = "attack";

    player.normalSummonedThisTurn = true;

    return true;
}

    // -------------------------
    // PLAYMAT RENDER
    // -------------------------
    renderPlaymat() {
        console.log("\n================ PLAYMAT ================\n");

        this.renderPlayer(this.opponentPlayer, "TOP (Opponent)");
        console.log("\n----------------------------------------\n");
        this.renderPlayer(this.currentPlayer, "BOTTOM (You)");

        console.log("\n========================================\n");
    }

    renderPlayer(player, label) {
        console.log(`${label}: ${player.name}`);
        console.log(`LP: ${player.lifePoints}`);

        console.log("\nHand:");
        console.log(player.zone.hand.map(c => c.card.name).join(" | "));

        console.log("\nMonster Zone:");
        console.log(
            player.zone.monster
                .map((c, i) => c ? `[${i}] ${c.card.name}` : `[${i}] EMPTY`)
                .join(" | ")
        );

        console.log("\nSpell/Trap Zone:");
        console.log(
            player.zone.spellTrap
                .map((c, i) => c ? `[${i}] ${c.card.name}` : `[${i}] EMPTY`)
                .join(" | ")
        );
    }

    start() {
        this.startDuel();

        const interval = setInterval(() => {
            this.nextPhase();

            if (this.turn > 2) {
                clearInterval(interval);
            }
        }, 800);
    }
}

module.exports = MainGame;