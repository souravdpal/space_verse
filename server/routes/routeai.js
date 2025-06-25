const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const router = express.Router();

router.post('/ai', (req, res) => {
  const inputData = req.body;

  // Validate input data
  if (!inputData.char || !inputData.user) {
    console.error('Input validation failed:', inputData);
    return res.status(400).json({ error: 'Missing required fields: char and user' });
  }

  // Log input for debugging
  console.log('Received input:', JSON.stringify(inputData, null, 2));

  // Resolve absolute path to hina.py
  const pythonScriptPath = path.resolve(__dirname, '../python/hina.py');
  console.log('Resolved Python script path:', pythonScriptPath);

  // Verify file existence
  if (!require('fs').existsSync(pythonScriptPath)) {
    console.error('Python script not found at:', pythonScriptPath);
    return res.status(500).json({ error: `Python script not found at ${pythonScriptPath}` });
  }

  // Spawn Python process
  const py = spawn('python3', [pythonScriptPath]);

  let output = '';
  let errorOutput = '';

  // Capture stdout
  py.stdout.on('data', (data) => {
    output += data.toString();
  });

  // Capture stderr
  py.stderr.on('data', (data) => {
    errorOutput += data.toString();
  });

  // Handle process exit
  py.on('close', (code) => {
    if (code !== 0 || errorOutput) {
      console.error('Python process failed:', { code, errorOutput });
      return res.status(500).json({ error: errorOutput || `Python process exited with code ${code}` });
    }

    try {
      // Parse Python script output
      const json = JSON.parse(output.trim());
      console.log('Python output:', json);
      res.json( json);
    } catch (err) {
      console.error('JSON parsing error:', err.message, 'Output:', output);
      res.status(500).json({ error: 'Invalid JSON from Python script', details: err.message });
    }
  });

  // Send input data to Python script
  try {
    py.stdin.write(JSON.stringify(inputData));
    py.stdin.write('\n');
    py.stdin.end();
  } catch (err) {
    console.error('Failed to send input to Python:', err.message);
    res.status(500).json({ error: 'Failed to send input to Python script', details: err.message });
  }
});

module.exports = router;