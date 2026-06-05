const express = require('express');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = 3000;

const {buildDeckJSON} = require('./gimmeDeck.js');

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));

app.get('/', (request, response) => {
    response.render("index", {currentPage:'home'});
})

app.get('/upload', (request, response) => {
    response.render("upload", {currentPage:'upload'});
})

app.post("/upload", upload.single("deck"), async (request, response) => {
  try {
    if (!request.file) {
      return response.status(400).json({ error: "No file uploaded" });
    }

    const text = request.file.buffer.toString("utf8");

    const jsonString = await buildDeckJSON(text);

    const fileName = `deck_${Date.now()}.json`;
    const filePath = path.join(__dirname, "deck_inventory", fileName);

    fs.writeFileSync(filePath, jsonString, "utf8");

    response.json({
      message: "Deck generated yay :)",
      file: fileName
    });

  } catch (err) {
    response.status(500).json({ error: err.message });
  }
});

app.get("/game", (request, response) =>{
    response.render("game", {currentPage:'game'});
})
app.listen(PORT, () => {
    console.log(`http://localhost:${PORT}/`);
})