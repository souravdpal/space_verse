const express = require('express');
const router = express.Router();
const { spawn } = require('child_process');
const path = require('path');
const User = require('../models/User');

// Robust JSON filter
function json_Filter(text) {
    try {
        if (text === null || text === undefined) return null;
        if (typeof text === 'object') return text;
        if (typeof text !== 'string') text = String(text);
        let jsonStr = text.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2":');
        return JSON.parse(jsonStr);
    } catch (err) {
        console.error("Failed to parse JSON:", err.message, "Input:", text);
        return null;
    }
}

// Helper to run Python script
const runPython = (input) => new Promise((resolve, reject) => {
    const py = spawn('python3', [path.resolve(__dirname, '../python/hinaM.py')]);
    let dataString = '';
    let errString = '';

    py.stdout.on('data', (data) => { dataString += data.toString(); });
    py.stderr.on('data', (data) => { errString += data.toString(); });

    py.on('close', (code) => {
        if (code !== 0) {
            console.error("Python script failed:", errString);
            return reject(new Error(errString || `Python exited with code ${code}`));
        }
        try {
            const result = JSON.parse(dataString);
            if (!result.answer) {
                console.warn("Empty answer from Python:", dataString);
                return resolve({ execute: null, answer: "Hello! How can I help you today?" });
            }
            resolve(result);
        } catch (e) {
            console.error("Failed to parse Python response:", e.message, "Output:", dataString);
            reject(new Error(`Failed to parse Python response: ${e.message}`));
        }
    });

    py.stdin.write(JSON.stringify(input));
    py.stdin.end();

    setTimeout(() => {
        py.kill();
        reject(new Error('Python script timed out'));
    }, 10000);
});

// Helper to clean AI answer for frontend
function cleanAnswerForFrontend(text) {
    if (!text) return 'Hello! How can I help you today?';
    return text
        .replace(/\\n/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// POST route
router.post('/hina/ai/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { query, memo } = req.body;

        const userDat = await User.findOne({ uid: id });
        if (!userDat) return res.status(404).json({ error: "User not found" });

        const input = {
            user_name: userDat.displayName || "User",
            followers: userDat.followers || 0,
            email: userDat.email || "",
            bio: userDat.bio || "",
            query: query || "",
            memo: memo || "no memories yet"
        };

        console.log("Input to Python:", input);
        const result = await runPython(input);

        let replyText = result.reply || result.answer || "";
        console.log("Python response:", replyText);

        let match = replyText.match(/json\s*({[\s\S]*})/);
        let obj = match ? json_Filter(match[1]) : { execute: null, answer: replyText };

        if (!obj || !obj.answer) {
            console.warn("No valid answer in response:", obj);
            obj = { execute: null, answer: "Hello! How can I help you today?" };
        }

        console.log("Processed response:", obj);
        let cleanAnswer = cleanAnswerForFrontend(obj.answer);

        res.json({
            command: obj.execute,
            result: cleanAnswer
        });

    } catch (err) {
        console.error("Backend error:", err.message);
        res.status(500).json({ error: `Server error: ${err.message}` });
    }
});

module.exports = router;