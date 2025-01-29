const express = require('express');
const axios = require('axios');

const router = express.Router();

router.get('/proxy-audio', async (req, res) => {
    const { url } = req.query;

    try {
        //console.log('Requested URL:', url);
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream',
        });

        res.set({
            'Content-Type': 'audio/mpeg',
            'Cache-Control': 'no-cache',
        });

        response.data.pipe(res);
    } catch (error) {
        console.error('Error fetching audio:', error);
        res.status(500).send('Error fetching audio');
    }
});

module.exports = router;
