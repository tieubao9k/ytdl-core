/**
 * poToken Helper
 * Helper utilities for generating and managing poToken (Proof of Origin Token)
 *
 * poToken is required to bypass YouTube's bot detection for WEB and WEBEMBEDDED clients.
 * It must be generated using a browser environment that can execute JavaScript challenges.
 *
 * Recommended tool: https://github.com/iv-org/youtube-trusted-session-generator
 */

const { spawn } = require('child_process');
const { existsSync } = require('fs');
const path = require('path');

/**
 * Generate poToken using youtube-trusted-session-generator
 *
 * Prerequisites:
 * 1. Install youtube-trusted-session-generator:
 *    npm install -g youtube-trusted-session-generator
 *    OR
 *    git clone https://github.com/iv-org/youtube-trusted-session-generator
 *
 * @param {Object} options - Generation options
 * @param {string} options.generatorPath - Path to youtube-trusted-session-generator (optional)
 * @returns {Promise<{poToken: string, visitorData: string}>}
 */
async function generatePoToken(options = {}) {
  return new Promise((resolve, reject) => {
    const generatorPath = options.generatorPath || 'youtube-trusted-session-generator';

    const proc = spawn(generatorPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(
          `Failed to generate poToken. Exit code: ${code}\n` +
          `Error: ${stderr}\n\n` +
          `Make sure youtube-trusted-session-generator is installed:\n` +
          `  npm install -g youtube-trusted-session-generator\n` +
          `Or download from: https://github.com/iv-org/youtube-trusted-session-generator`
        ));
      }

      const poTokenMatch = stdout.match(/po_token[:\s]+([A-Za-z0-9_-]+)/i);
      const visitorDataMatch = stdout.match(/visitor_data[:\s]+([A-Za-z0-9_-]+)/i);

      if (!poTokenMatch || !visitorDataMatch) {
        return reject(new Error(
          `Could not parse poToken from generator output.\n` +
          `Output: ${stdout}`
        ));
      }

      resolve({
        poToken: poTokenMatch[1],
        visitorData: visitorDataMatch[1]
      });
    });

    proc.on('error', (error) => {
      reject(new Error(
        `Failed to run youtube-trusted-session-generator: ${error.message}\n\n` +
        `Installation instructions:\n` +
        `  npm install -g youtube-trusted-session-generator\n` +
        `Or download from: https://github.com/iv-org/youtube-trusted-session-generator`
      ));
    });
  });
}

/**
 * Generate poToken using Docker (recommended for production)
 *
 * Prerequisites:
 * 1. Docker must be installed
 * 2. Pull the image: docker pull quay.io/invidious/youtube-trusted-session-generator
 *
 * @returns {Promise<{poToken: string, visitorData: string}>}
 */
async function generatePoTokenDocker() {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', [
      'run',
      '--rm',
      'quay.io/invidious/youtube-trusted-session-generator'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code !== 0) {
        return reject(new Error(
          `Docker poToken generation failed. Exit code: ${code}\n` +
          `Error: ${stderr}\n\n` +
          `Make sure Docker is installed and the image is pulled:\n` +
          `  docker pull quay.io/invidious/youtube-trusted-session-generator`
        ));
      }

      const poTokenMatch = stdout.match(/po_token[:\s]+([A-Za-z0-9_-]+)/i);
      const visitorDataMatch = stdout.match(/visitor_data[:\s]+([A-Za-z0-9_-]+)/i);

      if (!poTokenMatch || !visitorDataMatch) {
        return reject(new Error(`Could not parse poToken from Docker output`));
      }

      resolve({
        poToken: poTokenMatch[1],
        visitorData: visitorDataMatch[1]
      });
    });

    proc.on('error', (error) => {
      reject(new Error(
        `Failed to run Docker: ${error.message}\n\n` +
        `Make sure Docker is installed and running.`
      ));
    });
  });
}

/**
 * Manual poToken generation instructions
 * Returns instructions for manually generating poToken
 */
function getManualInstructions() {
  return `
Manual poToken Generation Instructions:
========================================

Method 1: Using npm package (Recommended)
------------------------------------------
1. Install the generator:
   npm install -g youtube-trusted-session-generator

2. Run the generator:
   youtube-trusted-session-generator

3. Copy the output values:
   - po_token: [your_token_here]
   - visitor_data: [your_visitor_data_here]

4. Use in your code:
   const ytdl = require('ytdl-core-enhanced');
   ytdl.setPoTokenAndVisitorData('your_po_token', 'your_visitor_data');


Method 2: Using Docker
----------------------
1. Pull the Docker image:
   docker pull quay.io/invidious/youtube-trusted-session-generator

2. Run the container:
   docker run --rm quay.io/invidious/youtube-trusted-session-generator

3. Copy the output and use as shown above


Method 3: From source
---------------------
1. Clone the repository:
   git clone https://github.com/iv-org/youtube-trusted-session-generator
   cd youtube-trusted-session-generator

2. Install dependencies:
   npm install

3. Run the generator:
   npm start

4. Copy the output and use as shown above


Notes:
------
- poToken expires after some time (typically 24-48 hours)
- You'll need to regenerate it periodically
- Store tokens securely (environment variables recommended)
- Don't commit tokens to version control

For more information:
https://github.com/iv-org/youtube-trusted-session-generator
`;
}

module.exports = {
  generatePoToken,
  generatePoTokenDocker,
  getManualInstructions
};
