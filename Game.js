const Player = require("./Player");


class Game {
  constructor(player1, player2) {
    this.player1 = player1;
    this.player2 = player2;
  }

  start() {
    console.log(`${this.player2.name} owns ${this.player2.zone.extraDeck[0].card.name}`)

  }
}

module.exports = Game;