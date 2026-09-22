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
    // BUGFIX: GameCard's constructor always stamps location="deck" no
    // matter which array it actually ends up in — that left every Extra
    // Deck/Side Deck card lying about its own location from the moment
    // the Player was created. Nothing crashed on it today only because
    // no code path currently branches on an Extra/Side Deck card's
    // .location, but it's exactly the kind of state a future effect (or
    // the fuzz-test invariant checker) would trip over, so stamp the
    // real zone now instead of leaving it implicit.
    this.zone.extraDeck = deck.extraDeck;
    this.zone.extraDeck.forEach(gc => { gc.location = "extraDeck"; gc.zoneIndex = null; });
    this.zone.sideDeck = deck.sideDeck;
    this.zone.sideDeck.forEach(gc => { gc.location = "sideDeck"; gc.zoneIndex = null; });

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

  // Fill zones center-outward (like real duels/anime), not strictly
  // left-to-right — small authenticity touch borrowed from another
  // fan implementation.
  static ZONE_FILL_ORDER = [2, 3, 1, 4, 0];

  getFreeMonsterSlot() {
    for (const i of Player.ZONE_FILL_ORDER) {
      if (this.zone.monster[i] === null) return i;
    }
    return -1;
  }

  getFreeSpellTrapSlot() {
    for (const i of Player.ZONE_FILL_ORDER) {
      if (this.zone.spellTrap[i] === null) return i;
    }
    return -1;
  }

  getMonstersOnField() {
    return this.zone.monster.filter(slot => slot !== null);
  }

  getSpellTrapsOnField() {
    return this.zone.spellTrap.filter(slot => slot !== null);
  }

  // CRITICAL FIX: Safe Zone Appending & Index Management
  addCard(card, zoneName) {
    const zone = this.getZone(zoneName);

    if (this.isSlotZone(zoneName)) {
      const index = (zoneName === "monster" || zoneName === "spellTrap")
        ? Player.ZONE_FILL_ORDER.find(i => zone[i] === null)
        : zone.findIndex(slot => slot === null);
      if (index === undefined || index === -1) {
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
    // Union Monster protection (Y-Dragon Head, Z-Metal Tank, ...): a
    // monster with an equipped Union card is destroyed IN ITS PLACE —
    // the Union card goes to the Graveyard instead, the host stays on
    // the field with its equip bonus removed. This is the single choke
    // point every "destroy this monster" path already runs through
    // (battle damage, card effects, tributes), so it protects against
    // all of them uniformly rather than needing special-casing at each
    // call site.
    if (toZone === "graveyard" && fromZone === "monster" && card.equippedUnion) {
      const unionCard = card.equippedUnion;
      card.equippedUnion = null;
      card.modifiers.atk -= (unionCard.unionAtkBoost || 0);
      card.modifiers.def -= (unionCard.unionDefBoost || 0);
      unionCard.unionAtkBoost = 0;
      unionCard.unionDefBoost = 0;
      // BUGFIX: this branch pushes unionCard straight into the Graveyard
      // array itself rather than going through the rest of this method,
      // so it needs the same "leaving the field" cleanup the general
      // path below does — otherwise any modifiers the Union Monster
      // picked up while it was still an independent field monster
      // (before being equipped) stay stuck on it in the Graveyard, and
      // would resurface if it's ever revived later.
      unionCard.modifiers.atk = 0;
      unionCard.modifiers.def = 0;
      unionCard.modifiers.cannotAttack = false;
      unionCard.modifiers.cannotChangePosition = false;
      unionCard.modifiers.effectsNegated = false;
      unionCard.modifiers.indestructible = false;
      unionCard.hasSpellCounter = false;
      unionCard.equippedTo = null;
      unionCard.linkedTarget = null;
      const gyZone = this.getZone("graveyard");
      gyZone.push(unionCard);
      unionCard.zoneIndex = null;
      unionCard.location = "graveyard";
      unionCard._arrivedFromField = true;
      return; // the host itself never actually leaves the field
    }

    // Real rule: Tokens cease to exist the moment they'd leave the field
    // — they never actually sit in the Graveyard/hand/deck as a card.
    // BUGFIX: every destroy/discard/bounce path in this project funnels
    // through this one method already (that's the whole point of it
    // being the single choke point, same as the Union-monster guard
    // above), so this is the one place that needs the check rather than
    // every individual "moveCard(x, ..., 'graveyard')" call site.
    if (card.isToken && toZone !== "monster") {
      this.removeCard(card, fromZone);
      card.location = "removed";
      card.zoneIndex = null;
      return;
    }

    // Tracks whether a card arriving in the Graveyard came directly from
    // the field (battle, effect destruction, tribute) vs. elsewhere (hand
    // discard) — several monster effects ("if this card is sent from the
    // field to the GY...") only trigger for the former.
    if (toZone === "graveyard") {
      card._arrivedFromField = (fromZone === "monster");
    }

    // BUGFIX: a card actually leaving the field (not just moving between
    // field zones) needs its live-play-only state wiped, or it can come
    // back to haunt it — literally, if it's later revived by Monster
    // Reborn/Call of the Haunted. Without this, a monster destroyed
    // while shackled by Shadow Spell (-700 ATK/DEF, cannotAttack) or
    // Fiendish Chain (effectsNegated) keeps those penalties forever on
    // this same GameCard object, even once it's back on the field as a
    // "fresh" summon. Equip/link bookkeeping on Spell/Trap cards is
    // stale data past this point too.
    const leavingField = (fromZone === "monster" || fromZone === "spellTrap") &&
      toZone !== "monster" && toZone !== "spellTrap";
    if (leavingField) {
      // Fires whatever this Spell/Trap's own "when this card leaves the
      // field..." rule requires (freeing the monster it was binding —
      // Spellbinding Circle/Shadow Spell/Fiendish Chain — or destroying
      // the monster it was reanimating — Call of the Haunted). See the
      // matching handlers in Effects.js for what each one actually does.
      if (card.linkedRevert) { card.linkedRevert(); card.linkedRevert = null; }
      card.modifiers.atk = 0;
      card.modifiers.def = 0;
      card.modifiers.cannotAttack = false;
      card.modifiers.cannotChangePosition = false;
      card.modifiers.effectsNegated = false;
      card.modifiers.indestructible = false;
      card.hasSpellCounter = false;
      card.equippedTo = null;
      card.linkedTarget = null;
    }

    this.removeCard(card, fromZone);
    this.addCard(card, toZone);
  }

  // Applies battle/effect damage, clamped so LP never goes negative
  dealDamage(amount) {
    if (amount <= 0) return this.lifePoints;
    this.lifePoints = Math.max(0, this.lifePoints - amount);
    return this.lifePoints;
  }

  // Called when it becomes this player's turn again: clears per-turn
  // flags on every monster they control (attacked/summoned/position-changed)
  resetMonsterTurnFlags() {
    for (const gc of this.zone.monster) {
      if (!gc) continue;
      gc.state.hasAttackedThisTurn = false;
      gc.state.hasBeenSummonedThisTurn = false;
      gc.state.hasChangedPositionThisTurn = false;
      gc.state.hasUsedEffectThisTurn = false;
      // A Union Monster (Y-Dragon Head, Z-Metal Tank, ...) currently
      // equipped onto this card isn't itself sitting in zone.monster,
      // so it needs its own turn-flag reset here too.
      if (gc.equippedUnion) gc.equippedUnion.state.hasUsedEffectThisTurn = false;
    }
  }
}

module.exports = Player;