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

// Serve avatar art (and any other static assets dropped in views/images)
app.use('/images', express.static(path.join(__dirname, 'views', 'images')));

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
// GLOBAL ERROR HANDLER (CRITICAL: keeps the server alive)
// A bug in one card effect should never take the whole duel down.
// Express routes synchronous throws in route handlers here automatically.
// ---------------------------------------------------------
app.use((err, req, res, next) => {
    console.error("Unhandled error on", req.method, req.originalUrl, ":", err);
    res.status(500).send(
        `<html><body style="background:#111;color:#fff;font-family:sans-serif;padding:40px;">` +
        `<h2>Something went wrong</h2>` +
        `<p>An unexpected error occurred. The duel state is unaffected — you can go back and keep playing.</p>` +
        `<p><a href="/game" style="color:#0cf;">Return to the duel</a></p>` +
        `<pre style="color:#888;font-size:11px;white-space:pre-wrap;">${(err && err.stack) || err}</pre>` +
        `</body></html>`
    );
});

// ---------------------------------------------------------
// SERVER SOCKET LISTENER (CRITICAL FIX: Syntax error cleared)
// ---------------------------------------------------------
app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`YGO Duel Engine Server Online!`);
    console.log(`Play Arena Mat: http://localhost:${PORT}/game/start`);
    console.log(`Home Base View: http://localhost:${PORT}/`);
    console.log(`==================================================\n`);
});