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
  constructor(name, deckJson) {
    this.name = name;
    this.lifePoints = 8000;

    this.zone = {
      hand: [],
      deck: [],
      extraDeck: [],
      sideDeck: [],
      monster: Array(5).fill(null),
      spellTrap: Array(5).fill(null),
      field: null,
      graveyard: [],
      banished: []
    };

    const deck = buildDeckForPlayer(deckJson, this);

    this.zone.deck = deck.mainDeck;
    this.zone.extraDeck = deck.extraDeck;
    this.zone.sideDeck = deck.sideDeck;
  }

  draw(numberOfCard){

  }
}

module.exports = Player;