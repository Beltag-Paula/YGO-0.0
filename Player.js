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
  moveCard(card, fromZoneName, toZoneName, toIndex = null) {
    const fromZone = this.getZone(fromZoneName);
    const toZone = this.getZone(toZoneName);

    if (!fromZone) {
      throw new Error(`Invalid source zone: ${fromZoneName}`);
    }

    if (!toZone) {
      throw new Error(`Invalid target zone: ${toZoneName}`);
    }

    // 1. REMOVE from source
    const removed = this.removeFromZone(fromZone, card);

    if (!removed) {
      throw new Error("Card not found in source zone");
    }

    // 2. ADD to destination
    this.addToZone(toZone, card, toIndex);

    // 3. UPDATE card state
    card.location = toZoneName;

    if (toIndex !== null) {
      card.zoneIndex = toIndex;
    } else {
      card.zoneIndex = null;
    }

    return true;
  }


  summonMonster(card, battlePosition, faceUp, zoneIndex) {
    const zone = this.zone.monster;

    // 1. must be in hand
    if (card.location !== "hand") {
      throw new Error("Card must be in hand to summon");
    }

    // 2. must be normal summonable monster
    if (!card.card.level || card.card.level > 4) {
      throw new Error("Only level 1–4 monsters can be normal summoned");
    }

    // 3. zone validation
    if (zoneIndex < 0 || zoneIndex >= zone.length) {
      throw new Error("Invalid monster zone index");
    }

    // 4. occupancy check
    if (zone[zoneIndex]) {
      throw new Error("Monster zone already occupied");
    }

    // 5. move card (single source of truth)
    this.moveCard(card, "hand", "monster", zoneIndex);

    // 6. update state
    card.faceUp = faceUp;
    card.position = battlePosition;
    card.state.summonedThisTurn = true;

    return true;
  }

  changeCardPosition(card, facePosition, zoneLocation) {

  }

  setOrActivateSpellTrap(card, facePosition, zoneLocation) {

  }

}

module.exports = Player;