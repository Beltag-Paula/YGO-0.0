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
  //////////////////////////////////////////////////////////////////////////////
  getZone(zoneName) {
    return this.zone[zoneName];
  }

  removeFromZone(zone, card) {
    if (Array.isArray(zone)) {
      const index = zone.indexOf(card);
      if (index === -1) return false;

      zone.splice(index, 1);
      return true;
    }

    // single slot (field)
    if (zone === card) {
      this.zone.field = null;
      return true;
    }

    return false;
  }

  addToZone(zone, card, index = null) {
    // slot zones (monster / spellTrap)
    if (Array.isArray(zone) && zone.length === 5) {

      if (index === null) {
        throw new Error("Missing index for slot zone");
      }

      if (zone[index] !== null) {
        throw new Error("Slot already occupied");
      }

      zone[index] = card;
      return;
    }

    // normal array zones (hand, deck, graveyard, etc.)
    if (Array.isArray(zone)) {
      zone.push(card);
      return;
    }

    // single slot (field)
    return card;
  }
  //////////////////////////////////////////////////////////////////////////////
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

  //this is shit
  moveCard(card, fromZoneA, toZoneB, toIndex = null) {

    const from = this.getZone(fromZoneA);
    const to = this.getZone(toZoneB);

    if (!from || !to) {
      throw new Error(`Invalid zone: ${fromZoneA} -> ${toZoneB}`);
    }

    // remove
    const removed = this.removeFromZone(from, card);
    if (!removed) {
      throw new Error("Card not found in source zone");
    }

    // add
    this.addToZone(to, card, toIndex);

    // update state
    card.location = toZoneB;

    return true;
  }
  summonCard(card, facePosition, zoneLocation) {
    //normal (<=4 star level); tribute lvl 5&6 means tribute one card; tribute 7-8 tribuute two cards; 9> tribute 3 cards
    //ritual summonn (ritual spell + ritual monster present in both hands)
    //fusion summon (polymerization spell in hand; monsters should be either in hand or in hand)

    //flip card effect of normal monster?
  }

  changeCardPosition(card, facePosition, zoneLocation) {

  }

  setOrActivateSpellTrap(card, facePosition, zoneLocation) {

  }

}

module.exports = Player;