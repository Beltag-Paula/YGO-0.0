class MainGame {
    constructor(player1, player2) {
        this.player1 = player1;
        this.player2 = player2;

        this.turn = 0;

        this.currentPlayer = player1;
        this.opponentPlayer = player2;

        this.phase = "draw";

        this.firstTurn = true;
    }

    startDuel() {
        this.player1.shuffleDeck();
        this.player2.shuffleDeck();

        this.player1.drawCard(5);
        this.player2.drawCard(5);

        this.turn = 1;

        console.log("=== DUEL START ===");
        console.log(`Turn ${this.turn}`);
        console.log(`${this.currentPlayer.name} goes first`);
    }

    drawPhase() {
        console.log(`${this.currentPlayer.name} - Draw Phase`);

        this.currentPlayer.drawCard(1);

        this.phase = "standby";
    }

    standbyPhase() {
        console.log(`${this.currentPlayer.name} - Standby Phase`);

        this.phase = "m1";
    }

    mainPhase1() {
        console.log(`${this.currentPlayer.name} - Main Phase 1`);
        // Player actions happen here
        if (this.firstTurn) {
            console.log("Battle Phase && Main Phase 2 skipped on first turn");

            this.phase = "end";
        }

        else {
            this.phase = "battle";
        }
    }

    battlePhase() {

        console.log(`${this.currentPlayer.name} - Battle Phase`);

        // attacks happen here

        this.phase = "m2";
    }

    mainPhase2() {
        console.log(`${this.currentPlayer.name} - Main Phase 2`);

        // Player actions happen here

        this.phase = "end";
    }

    endPhase() {
        console.log(`${this.currentPlayer.name} - End Phase`);

        this.endTurn();
    }

    endTurn() {
        this.currentPlayer.normalSummonedThisTurn = false;

        if (this.firstTurn) {
            this.firstTurn = false;
        }

        this.turn++;

        if (this.currentPlayer === this.player1) {
            this.currentPlayer = this.player2;
            this.opponentPlayer = this.player1;
        } else {
            this.currentPlayer = this.player1;
            this.opponentPlayer = this.player2;
        }

        this.phase = "draw";

        console.log("");
        console.log(`=== TURN ${this.turn} ===`);
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
                throw new Error(`Error`);
        }
    }

    start() {
        this.startDuel();
        const interval = setInterval(() => {
            this.nextPhase();

            if (this.turn > 3) {
                clearInterval(interval);
            }
        }, 500);
    }
}

module.exports = MainGame;