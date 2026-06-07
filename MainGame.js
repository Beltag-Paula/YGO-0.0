const Player = require("./Player");


class MainGame {
  constructor(player1, player2) {
    this.player1 = player1;
    this.player2 = player2;
  }

  start() {
    //here we simulate how the game first starts
    this.player1.shuffleDeck();
    this.player2.shuffleDeck();

    this.player1.drawCard(5);
    this.player2.drawCard(5);

    this.player1.drawCard(1);
}
}


module.exports = MainGame;