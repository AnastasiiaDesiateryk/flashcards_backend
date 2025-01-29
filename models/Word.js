const mongoose = require('mongoose');

const wordSchema = new mongoose.Schema({
    email: { type: String, required: true }, // Привязка к пользователю
    word: { type: String, required: true },
    translation: { type: String, required: true },
    audio: { type: String, required: false },
    image: { type: String, required: false },
    notes: { type: String, required: false },
    lesson: { type: String, required: false } // Лекция
});

module.exports = mongoose.model('Word', wordSchema);
