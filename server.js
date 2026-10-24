const express = require("express");
const path = require("path");

const duelApi = require("./route/duel.js");
const DeckInventory = require("./DeckInventory");

const app = express();
const PORT = process.env.PORT || 3000;

app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use("/images", express.static(path.join(__dirname, "views", "images")));
app.use("/static", express.static(path.join(__dirname, "public")));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ---- pages ---------------------------------------------------------------
app.get("/", (req, res) => res.render("menu", { page: "home" }));
app.get("/decks", (req, res) => res.render("decks", { page: "decks" }));
app.get("/builder", (req, res) => res.render("builder", { page: "builder" }));
app.get("/upload", (req, res) => res.redirect("/decks"));
app.get("/duel", (req, res) => res.render("duel-setup", { page: "duel" }));
app.get("/duel/play", (req, res) => res.render("duel", { page: "play" }));
// Old entry points keep working.
app.get("/game", (req, res) => res.redirect("/duel/play"));
app.get("/game/start", (req, res) => res.redirect("/duel"));

// ---- API -----------------------------------------------------------------
app.use("/api", duelApi);

// Never let one broken card take the whole server down.
app.use((err, req, res, next) => {
    console.error("Unhandled error on", req.method, req.originalUrl, ":", err);
    if (req.path.startsWith("/api")) return res.status(500).json({ error: err.message });
    res.status(500).send(`<pre style="background:#05101f;color:#cfe8ff;padding:24px">Something went wrong.\n\n${(err && err.stack) || err}</pre>`);
});

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`\nYu-Gi-Oh! duel server → http://localhost:${PORT}/`);
        console.log(`Decks in inventory: ${DeckInventory.list().length}\n`);
    });
}

module.exports = app;
