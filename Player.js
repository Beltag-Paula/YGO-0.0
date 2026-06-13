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

    this.normalSummonedThisTurn = false;
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
      card.zoneIndex = null;

      this.zone.hand.push(card);
      drawn.push(card);
    }
    return drawn;
  }

  isSlotZone(zoneName) {
    return zoneName === "monster" || zoneName === "spellTrap";
  }

  getZone(zoneName) {
    if (!(zoneName in this.zone)) {
      throw new Error(`Invalid zone: ${zoneName}`);
    }
    return this.zone[zoneName];
  }

  getFreeMonsterSlot() {
    return this.zone.monster.findIndex(slot => slot === null);
  }

  getMonstersOnField() {
    return this.zone.monster.filter(slot => slot !== null);
  }

  // CRITICAL FIX: Safe Zone Appending & Index Management
  addCard(card, zoneName) {
    const zone = this.getZone(zoneName);

    if (this.isSlotZone(zoneName)) {
      const index = zone.findIndex(slot => slot === null);
      if (index === -1) {
        throw new Error(`No free slot in ${zoneName}`);
      }
      zone[index] = card;
      card.zoneIndex = index;
      card.location = zoneName;
      return;
    }

    zone.push(card);
    card.zoneIndex = null;
    card.location = zoneName;
  }

  // CRITICAL FIX: Uses instanceId for exact tracking and cleans up states safely
  removeCard(card, zoneName) {
    const zone = this.getZone(zoneName);

    if (this.isSlotZone(zoneName)) {
      const index = zone.findIndex(c => c && c.instanceId === card.instanceId);
      if (index === -1) throw new Error(`Card ${card.card.name} not found in ${zoneName}`);
      
      const removedCard = zone[index];
      zone[index] = null; // Free up the zone slot cleanly
      return removedCard;
    }

    const index = zone.findIndex(c => c.instanceId === card.instanceId);
    if (index === -1) throw new Error(`Card ${card.card.name} not found in ${zoneName}`);
    
    return zone.splice(index, 1)[0];
  }

  // CRITICAL FIX: Encapsulated atomic transaction to ensure references remain clean
  moveCard(card, fromZone, toZone) {
    this.removeCard(card, fromZone);
    this.addCard(card, toZone);
  }
}

module.exports = Player;