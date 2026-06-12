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

  shuffleDeck() {
    const deck = this.zone.deck;

    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }

    return deck;
  }

  drawCard(numberOfCards) {
    const drawn = [];

    for (let i = 0; i < numberOfCards; i++) {
      if (this.zone.deck.length === 0) break;

      const card = this.zone.deck.shift();

      card.location = "hand";

      this.zone.hand.push(card);
      drawn.push(card);
    }

    return drawn;
  }

}

module.exports = Player;