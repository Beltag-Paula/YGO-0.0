const express = require('express');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

// Internal Module Imports (CRITICAL FIX: Single dot relative pathing)
const Player = require("./Player");
const MainGame = require("./MainGame");
const gameRoutes = require("./route/game.js");
const { buildDeckJSON } = require('./gimmeDeck.js');

// View Engine Configurations
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(express.urlencoded({ extended: true }));
app.use(express.json()); // Added to smoothly read incoming JSON payloads if needed later

// ---------------------------------------------------------
// ORIGINAL BASE ROUTES (Preserved completely)
// ---------------------------------------------------------
app.get('/', (request, response) => {
    response.render("index", { currentPage: 'home' });
});

app.get('/upload', (request, response) => {
    response.render("upload", { currentPage: 'upload' });
});

app.post("/upload", upload.single("deck"), async (request, response) => {
  try {
    if (!request.file) {
      return response.status(400).json({ error: "No file uploaded" });
    }

    const text = request.file.buffer.toString("utf8");

    const jsonString = await buildDeckJSON(text);

    // Ensure the folder destination exists before trying to write files to it
    const inventoryDir = path.join(__dirname, "deck_inventory");
    if (!fs.existsSync(inventoryDir)){
        fs.mkdirSync(inventoryDir);
    }

    const fileName = `deck_${Date.now()}.json`;
    const filePath = path.join(inventoryDir, fileName);

    fs.writeFileSync(filePath, jsonString, "utf8");

    response.json({
      message: "Deck generated yay :)",
      file: fileName
    });

  } catch (err) {
    response.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------
// ROUTER ROUTE REGISTRATION
// ---------------------------------------------------------
app.use("/game", gameRoutes);

// ---------------------------------------------------------
// SERVER SOCKET LISTENER (CRITICAL FIX: Syntax error cleared)
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`⚔️  YGO Duel Engine Server Online!`);
    console.log(`🚀 Play Arena Mat: http://localhost:${PORT}/game/start`);
    console.log(`🏠 Home Base View:  http://localhost:${PORT}/`);
    console.log(`==================================================\n`);
});