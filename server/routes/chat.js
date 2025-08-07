const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_KEY in .env file');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// GET /history
router.get('/history', async (req, res) => {
    const { user_id, char_id, uid } = req.query;
    let userIdHeader = user_id

    // Validate inputs
    if (!user_id || !char_id || !uid) {
        return res.status(400).json({ error: 'Missing user_id, char_id, or uid in query parameters' });
    }

    if (!userIdHeader || userIdHeader !== user_id || user_id !== uid) {
        return res.status(401).json({ error: 'Unauthorized: X-User-ID header or uid does not match user_id' });
    }

    try {
        const { data, error } = await supabase
            .from('history')
            .select('*')
            .eq('user_id', user_id)
            .eq('char_id', char_id)
            .order('timestamp', { ascending: false })
            .limit(200);

        if (error) {
            console.error('Supabase query error:', error);
            return res.status(500).json({ error: 'Failed to fetch history', details: error.message });
        }

        res.status(200).json(data || []);
    } catch (err) {
        console.error('Server error:', err);
        res.status(500).json({ error: 'Internal server error', details: err.message });
    }
});

module.exports = router;