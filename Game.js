// class Game {
//   constructor(player1, player2) {
//     this.player1 = player1;
//     this.player2 = player2;
//   }

//   start() {
//     console.log(`Before shufflling`);
//     console.log(`${this.player1.name} has ${this.player1.zone.hand.length} in their hand`);
//     console.log(`${this.player1.name} has ${this.player1.zone.deck.length} in their deck`);
//     console.log(`${this.player2.name} has ${this.player2.zone.hand.length} in their hand`);
//     console.log(`${this.player2.name} has ${this.player2.zone.deck.length} in their deck`);

//     this.player1.shuffleDeck();
//     this.player2.shuffleDeck();
//     console.log(`After shuffling`);

//     this.player1.drawCard(5);
//     this.player2.drawCard(5);
//     console.log(`Both players drew 5 cards`);

//     console.log(`${this.player1.name} has ${this.player1.zone.hand.map(c => c.card.name)} in their hand`);
//     console.log(`${this.player2.name} has ${this.player2.zone.hand.map(c => c.card.name)} in their hand`);

//     console.log(`Final check`);
//     console.log(`${this.player1.name} has ${this.player1.zone.hand.length} in their hand`);
//     console.log(`${this.player1.name} has ${this.player1.zone.deck.length} in their deck`);
//     console.log(`${this.player2.name} has ${this.player2.zone.hand.length} in their hand`);
//     console.log(`${this.player2.name} has ${this.player2.zone.deck.length} in their deck`);

//   }
// }

const Player = require("./Player");


class Game {
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

    console.log(`${this.player1.name} has ${this.player1.zone.hand.map(c => c.card.name)} in their hand`);

    //now here we begin to player's 1 turn, that means 
    //draw 1 card, see the hand again, then let's see if we can move those cards around the field
    this.player1.drawCard(1);

    console.log(`${this.player1.name} has ${this.player1.zone.hand.length} in their hand`);
    console.log(`${this.player1.name} has ${this.player1.zone.deck.length} in their deck`);
    console.log(`${this.player1.name} has ${this.player1.zone.hand.map(c => c.card.name)} in their hand`);

    console.log("/n");

    const card = this.player1.zone.hand[0];

    console.log(`Testing card: ${card.card.name}`);
    console.log(`Type: ${card.card.type}`);

    if (card.card.type.includes("Monster")) {

      card.faceUp = true;
      card.position = "attack";

      this.player1.moveCard(
        card,
        "hand",
        "monster",
        0
      );

      console.log(`${card.card.name} summoned to monster zone 0`);

    } else {

      card.faceUp = false;
      card.spellTrap.set = true;

      this.player1.moveCard(
        card,
        "hand",
        "spellTrap",
        0
      );

      console.log(`${card.card.name} set in spell/trap zone 0`);
    }

    console.log(this.player1);

    console.log(`${this.player1.name} has ${this.player1.zone.hand.length} in their hand`);
  }

  
}


module.exports = Game;