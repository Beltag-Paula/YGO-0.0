    //you need two players
    //count the number of turns
    //take into the account of the phases + maybe even the battle phases + LP of each player?
    //and if there are chains
    //i have no ideea what im doing

const Player = require("./Player");
const yugiDeck = require("./deck_inventory/yugi.json");
const kaibaDeck = require("./deck_inventory/kaiba.json");

class Game {
  constructor() {
    this.player1 = new Player(yugiDeck);
    this.player2 = new Player(kaibaDeck);

    console.log(this.player1);
    console.log(this.player2);
  }
}

module.exports = Game;