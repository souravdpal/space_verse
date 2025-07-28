const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const router = express.Router();

router.post('/ai', (req, res) => {
  const inputData = req.body;

  if (!inputData.char || !inputData.user) {
    console.error('Input validation failed:', inputData);
    return res.status(400).json({ error: 'Missing required fields: char and user' });
  }

  console.log('Received input:', JSON.stringify(inputData, null, 2));

  const pythonScriptPath = path.resolve(__dirname, '../python/hina.py');
  console.log('Resolved Python script path:', pythonScriptPath);

  if (!fs.existsSync(pythonScriptPath)) {
    console.error('Python script not found at:', pythonScriptPath);
    return res.status(500).json({ error: `Python script not found at ${pythonScriptPath}` });
  }

  const py = spawn('python3', [pythonScriptPath]);

  let output = '';
  let errorOutput = '';
  const timeout = setTimeout(() => {
    py.kill();
    console.error('Python process timed out after 30 seconds');
    res.status(500).json({ error: 'Python process timed out' });
  }, 30000);

  py.stdout.on('data', (data) => {
    output += data.toString();
  });

  py.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  py.on('close', (code) => {
    clearTimeout(timeout);
    if (code !== 0 || errorOutput) {
      console.error('Python process failed:', { code, errorOutput });
      return res.status(500).json({ error: errorOutput || `Python process exited with code ${code}` });
    }
    try {
      const json = JSON.parse(output.trim());
      console.log('Python output:', json);
      res.json(json);
    } catch (err) {
      console.error('JSON parsing error:', err.message, 'Output:', output);
      res.status(500).json({ error: 'Invalid JSON from Python script', details: err.message });
    }
  });

  try {
    py.stdin.write(JSON.stringify(inputData));
    py.stdin.write('\n');
    py.stdin.end();
  } catch (err) {
    clearTimeout(timeout);
    console.error('Failed to send input to Python:', err.message);
    res.status(500).json({ error: 'Failed to send input to Python script', details: err.message });
  }
});

module.exports = router;