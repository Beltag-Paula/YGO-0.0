// class Player{
//     constructor(mainDeck = [], extraDeck = []){
//         this.lifePoints = 8000;

//         this.deckList = mainDeck;
//         this.extraDeckList = extraDeck;

//         this.zone = {
//             hand: [],
//             deck: [...mainDeck],
//             extraDeck: [...extraDeck],
//             monster: [null, null, null, null, null],
//             spellTrap: [null, null, null, null, null],
//             field: null,
//             graveyard: [],
//             banished: []
//         };
// }}

const { buildDeckForPlayer } = require("./deckBuilder");

class Player {
  constructor(json_deck) {
    this.lifePoints = 8000;

    const { mainDeck, extraDeck } = buildDeckForPlayer(json_deck, this);

    this.zone = {
      hand: [],
      deck: mainDeck,
      extraDeck: extraDeck,
      monster: Array(5).fill(null),
      spellTrap: Array(5).fill(null),
      field: null,
      graveyard: [],
      banished: []
    };
  }
}

module.exports = Player;