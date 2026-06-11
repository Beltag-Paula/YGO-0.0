const express = require("express");
const router = express.Router();

const Player = require("../Player");
const yugiDeck = require("../deck_inventory/yugi.json");
const kaibaDeck = require("../deck_inventory/kaiba.json");

router.get("/", (req, res) => {

  const player1 = new Player("Yugi", yugiDeck);
  const player2 = new Player("Kaiba", kaibaDeck);

  player1.shuffleDeck();
  player2.shuffleDeck();

  player1.drawCard(5);
  player2.drawCard(5);

  res.render("game", {
    currentPage: "game",
    player1,
    player2
  });
});

module.exports = router;