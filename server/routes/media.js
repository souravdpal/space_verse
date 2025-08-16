const { spawn } = require('child_process');
const path = require('path');

let timeoutId = null;

// Core loop to run the Python script
const runPythonLoop = () => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] Running Python script...`);

  try {
    const pythonScriptPath = path.resolve(__dirname, '../python/mediaHandler.py');

    // Spawn Python process with unbuffered output
    const py = spawn('python3', ['-u', pythonScriptPath], {
      stdio: ['pipe', 'pipe', 'pipe'] // stdin, stdout, stderr
    });

    // Capture stdout
    py.stdout.on('data', (data) => {
      process.stdout.write(`[Python stdout] ${data.toString()}`);
    });

    // Capture stderr
    py.stderr.on('data', (data) => {
      process.stderr.write(`[Python stderr] ${data.toString()}`);
    });

    // Handle close
    py.on('close', (code) => {
      if (code !== 0) {
        console.error(`[${timestamp}] Python exited with code ${code}`);
      }
      scheduleNextRun();
    });

  } catch (err) {
    console.error(`[${timestamp}] Unexpected error in loop:`, err);
    scheduleNextRun();
  }
};

// Schedule the next run at a random interval (5–60 mins)
const scheduleNextRun = () => {
  const randomInterval = Math.floor(Math.random() * (3600000 - 300000 + 1)) + 300000;
  const nextRunTime = new Date(Date.now() + randomInterval).toISOString();
  console.log(`Next Python run scheduled for ${nextRunTime} (~${Math.floor(randomInterval / 60000)} mins)`);
  timeoutId = setTimeout(runPythonLoop, randomInterval);
};

// Start automatically on server boot
runPythonLoop();

// Optional control functions for manual start/stop
const stopLoop = () => {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
    console.log('Python loop stopped manually');
  }
};

const startLoop = () => {
  if (!timeoutId) {
    console.log('Python loop started manually');
    runPythonLoop();
  }
};

module.exports = { runPythonLoop, stopLoop, startLoop };
