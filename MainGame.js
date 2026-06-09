const Player = require("./Player");

class MainGame {
    constructor(player1, player2) {
        this.player1 = player1;
        this.player2 = player2;

        this.turn = 1;

        this.currentPlayer = player1;
        this.opponentPlayer = player2;

        this.phase = "draw";
    }

    endTurn() {
        this.turn++;

        if (this.currentPlayer === this.player1) {
            this.currentPlayer = this.player2;
            this.opponentPlayer = this.player1;
        } else {
            this.currentPlayer = this.player1;
            this.opponentPlayer = this.player2;
        }

        this.phase = "draw";
    }

    nextPhase() {
        switch (this.phase) {
            case "draw":
                console.log("Draw phase");
                this.phase = "standby";
                break;

            case "standby":
                console.log("Standby phase");
                this.phase = "m1";
                break;

            case "m1":
                if (this.turn === 1) {
                    this.phase = "end";
                    break;
                }
                else {
                    console.log("Main Phase 1");
                    this.phase = "battle";
                    break; console.log("Main Phase 1");
                    this.phase = "battle";
                    break;
                }


            case "battle":
                console.log("Battle Phase");
                this.phase = "m2";
                break;

            case "m2":
                console.log("Main Phase 2");
                this.phase = "end";
                break;

            case "end":
                console.log("End Phase");
                this.endTurn();
                break;
        }
    }

    start() {
        this.player1.shuffleDeck();
        this.player2.shuffleDeck();

        this.player1.drawCard(5);
        this.player2.drawCard(5);

        console.log("Game started");
        console.log(`Turn ${this.turn}`);
        console.log(`Current player: ${this.currentPlayer.name}`);
        console.log(`Phase: ${this.phase}`);
        console.log(`${this.player1.name} has ${this.player1.zone.hand.map(c => c.card.name)} in their hand`);
        this.player1.drawCard(1);
        this.nextPhase();
        console.log(`Phase: ${this.phase}`);
        console.log(`${this.player1.name} has ${this.player1.zone.hand.map(c => c.card.name)} in their hand`);
        



    }
}

module.exports = MainGame;