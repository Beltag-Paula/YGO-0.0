const Game = require("./Game");
const Player = require("./Player");
const yugiDeck = require("./deck_inventory/yugi.json");
const kaibaDeck = require("./deck_inventory/kaiba.json");

const firstPlayerName = "Yugi";
const secondPlayerName = "Kaiba";

const player1 = new Player(firstPlayerName, yugiDeck);
const player2 = new Player(secondPlayerName, kaibaDeck);

const game = new Game(player1, player2);

game.start();