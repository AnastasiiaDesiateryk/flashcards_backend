const express = require("express");
const router = express.Router();
const axios = require("axios");
const Word = require("../models/Word");

router.post("/import", async (req, res) => {
  const { email, lesson, text, rowDelimiter, columnDelimiter } = req.body;

  if (!email || !lesson || !text) {
    return res
      .status(400)
      .json({ error: "Email, lesson, and text are required." });
  }

  try {
    const rows = text.split(rowDelimiter).map((row) => row.trim());
    const words = [];

    for (const row of rows) {
      if (!row) continue;

      const firstDelimiterIndex = row.indexOf(columnDelimiter);
      if (firstDelimiterIndex === -1) continue;

      const word = row.slice(0, firstDelimiterIndex).trim();
      const translation = row
        .slice(firstDelimiterIndex + columnDelimiter.length)
        .trim();

      if (!word || !translation) continue;

      const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=en&q=${encodeURIComponent(
        word
      )}&client=tw-ob`;

      const wordEntry = new Word({
        email,
        lesson,
        word,
        translation,
        audio: ttsUrl,
      });

      await wordEntry.save();
      words.push(wordEntry);
    }

    res.status(200).json({ message: "Words imported successfully!", words });
  } catch (error) {
    console.error("Import error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.put("/cards/:id", async (req, res) => {
  const { id } = req.params;
  const { image } = req.body;

  try {
    const card = await Card.findByIdAndUpdate(id, { image }, { new: true });
    res.status(200).json(card);
  } catch (error) {
    console.error("Error updating card:", error);
    res.status(500).json({ error: "Unable to update card" });
  }
});
// router.delete("/delete", async (req, res) => {
//   try {
//     await Card.deleteMany({});
//     res.status(200).json({ message: "Все слова успешно удалены." });
//   } catch (error) {
//     console.error("Ошибка при удалении слов:", error);
//     res.status(500).json({ error: "Ошибка при удалении слов." });
//   }
// });

// **Новый эндпоинт для удаления урока и всех связанных слов**
router.delete("/lessons/:lesson", async (req, res) => {
  const { lesson } = req.params;

  if (!lesson) {
    return res.status(400).json({ error: "Lesson name is required." });
  }

  try {
    // Удаляем все слова, относящиеся к указанному уроку
    const deletedWords = await Word.deleteMany({ lesson });

    if (deletedWords.deletedCount === 0) {
      return res.status(404).json({ message: "Lesson not found." });
    }

    res.status(200).json({
      message: `Lesson "${lesson}" and all associated words were successfully deleted.`,
    });
  } catch (error) {
    console.error("Error deleting lesson:", error);
    res.status(500).json({ error: "Failed to delete lesson." });
  }
});
router.get("/lessons", async (req, res) => {
  try {
    const lessons = await Word.distinct("lesson");
    res.status(200).json(lessons);
  } catch (error) {
    console.error("Error fetching lessons:", error);
    res.status(500).json({ error: "Failed to fetch lessons." });
  }
});
router.get("/", async (req, res) => {
  const { lesson } = req.query;

  try {
    const words = await Word.find({ lesson });
    res.status(200).json(words);
  } catch (error) {
    console.error("Error fetching words:", error);
    res.status(500).json({ error: "Failed to fetch words." });
  }
});

module.exports = router;
