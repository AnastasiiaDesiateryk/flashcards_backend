const express = require('express');
const axios = require('axios');

const router = express.Router();

// Unsplash API ключ
const UNSPLASH_API_KEY = 'IjqHE0f9DDq4jMx4V648DwW1IVNhBfIh2aIWExRIrMw';

// Роут для получения изображений
router.get('/images', async (req, res) => {
    const { query } = req.query; // Получаем текст для поиска (например, "apple")

    try {
        const response = await axios.get(`https://api.unsplash.com/search/photos`, {
            params: {
                query,
                per_page: 5, // Получаем 5 изображений
            },
            headers: {
                Authorization: `Client-ID ${UNSPLASH_API_KEY}`,
            },
        });

        const images = response.data.results.map((img) => ({
            id: img.id,
            url: img.urls.small, // Ссылка на небольшое изображение
            alt: img.alt_description || 'Image',
        }));

        res.status(200).json(images);
    } catch (error) {
        console.error('Error fetching images:', error);
        res.status(500).json({ error: 'Unable to fetch images' });
    }
});

module.exports = router;
