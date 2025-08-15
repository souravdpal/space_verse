const Groq = require('groq-sdk');
// or in ES modules: import Groq from 'groq-sdk';

const client = new Groq({
  apiKey: process.env.hina
});

module.exports = client;
