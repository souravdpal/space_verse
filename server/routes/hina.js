const express = require('express');
const router = express.Router();
const User = require('../models/User');
require('dotenv').config();
const client = require('./groq');



async function runChat({ content, prompts }) {
  const messages = [
    { role: "system", content: prompts },
    { role: 'user', content: content }
  ];
  const model = 'gemma2-9b-it';
  const temperature = 0.7;

  try {
    const completion = await client.chat.completions.create({
      messages,
      model,
      temperature
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('Error:', error);
    return "Error generating answer";
  }
}

router.post('/hina/ai/:id', async (req, res) => {
    const { id } = req.params;
    const { query } = req.body;

    try {
        const hinaAnswer = await runChat({
            content: query,
            prompts: 'You are Hina and assisting xyz user. Testing dev environment.'
        });

        console.log(hinaAnswer);
        console.log(`User ${id} asked: ${query}`);

        res.json({ reply: hinaAnswer });
    } catch (error) {
        console.error('Error in /hina/ai route:', error);
        res.status(500).json({ error: 'Something went wrong' });
    }
});


module.exports=router;