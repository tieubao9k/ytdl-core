const { spawn } = require('child_process');
const { request } = require('undici');

const DEFAULT_CIPHER_SERVER = 'https://cipher.kikkia.dev';

async function autoGeneratePoToken() {
  console.log('🔄 Auto-generating poToken...');

  try {
    const result = await tryNpmGlobal();
    if (result) {
      console.log('✅ poToken generated via npm global');
      return result;
    }
  } catch (e) {
  }

  try {
    const result = await tryDocker();
    if (result) {
      console.log('✅ poToken generated via Docker');
      return result;
    }
  } catch (e) {
  }

  try {
    const result = await tryLocalInstall();
    if (result) {
      console.log('✅ poToken generated via local install');
      return result;
    }
  } catch (e) {
  }

  throw new Error(
    'Failed to auto-generate poToken. Please install youtube-trusted-session-generator:\n' +
    '  npm install -g youtube-trusted-session-generator\n' +
    'Or use Docker:\n' +
    '  docker pull quay.io/invidious/youtube-trusted-session-generator'
  );
}

function tryNpmGlobal() {
  return new Promise((resolve, reject) => {
    const proc = spawn('youtube-trusted-session-generator', [], {
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

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout'));
    }, 30000); // 30 second timeout

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(`Exit code: ${code}`));
      }

      const result = parsePoTokenOutput(stdout);
      if (result) {
        resolve(result);
      } else {
        reject(new Error('Could not parse output'));
      }
    });

    proc.on('error', reject);
  });
}

function tryDocker() {
  return new Promise((resolve, reject) => {
    const proc = spawn('docker', [
      'run',
      '--rm',
      'quay.io/invidious/youtube-trusted-session-generator'
    ], {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout'));
    }, 30000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(`Exit code: ${code}`));
      }

      const result = parsePoTokenOutput(stdout);
      if (result) {
        resolve(result);
      } else {
        reject(new Error('Could not parse output'));
      }
    });

    proc.on('error', reject);
  });
}

function tryLocalInstall() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npx', ['youtube-trusted-session-generator'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      shell: true
    });

    let stdout = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    const timeout = setTimeout(() => {
      proc.kill();
      reject(new Error('Timeout'));
    }, 30000);

    proc.on('close', (code) => {
      clearTimeout(timeout);
      if (code !== 0) {
        return reject(new Error(`Exit code: ${code}`));
      }

      const result = parsePoTokenOutput(stdout);
      if (result) {
        resolve(result);
      } else {
        reject(new Error('Could not parse output'));
      }
    });

    proc.on('error', reject);
  });
}

function parsePoTokenOutput(output) {
  const poTokenMatch = output.match(/po_token[:\s]+([A-Za-z0-9_-]+)/i);
  const visitorDataMatch = output.match(/visitor_data[:\s]+([A-Za-z0-9_-]+)/i);

  if (poTokenMatch && visitorDataMatch) {
    return {
      poToken: poTokenMatch[1],
      visitorData: visitorDataMatch[1]
    };
  }

  return null;
}

/**
 * Test remote cipher server availability
 */
async function testCipherServer(url) {
  try {
    const response = await request(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'ytdl-core-enhanced'
      }
    });

    return response.statusCode === 200 || response.statusCode === 404; // 404 is OK (means server is up)
  } catch (error) {
    return false;
  }
}

/**
 * Auto-configure everything
 * Sets up poToken and remote cipher server automatically
 */
async function autoConfig(options = {}) {
  const config = {
    poToken: null,
    visitorData: null,
    cipherServer: null,
    errors: []
  };

  if (options.skipPoToken !== true) {
    try {
      console.log('🔧 Auto-configuring poToken...');
      const result = await autoGeneratePoToken();
      config.poToken = result.poToken;
      config.visitorData = result.visitorData;
      console.log('✅ poToken configured');
    } catch (error) {
      config.errors.push({
        component: 'poToken',
        message: error.message
      });
      console.warn('⚠️  poToken auto-config failed:', error.message);
    }
  }

  if (options.skipCipher !== true) {
    try {
      console.log('🔧 Auto-configuring cipher server...');
      const cipherUrl = options.cipherServer || DEFAULT_CIPHER_SERVER;

      const isAvailable = await testCipherServer(cipherUrl);
      if (isAvailable) {
        config.cipherServer = cipherUrl;
        console.log(`✅ Cipher server configured: ${cipherUrl}`);
      } else {
        throw new Error(`Cipher server not available: ${cipherUrl}`);
      }
    } catch (error) {
      config.errors.push({
        component: 'cipher',
        message: error.message
      });
      console.warn('⚠️  Cipher server auto-config failed:', error.message);
    }
  }

  return config;
}

async function applyAutoConfig(ytdl, options = {}) {
  const config = await autoConfig(options);

  if (config.poToken && config.visitorData) {
    ytdl.setPoTokenAndVisitorData(config.poToken, config.visitorData);
  }

  if (config.cipherServer) {
    ytdl.setRemoteCipher(config.cipherServer, options.cipherPassword || '');
  }

  return config;
}

module.exports = {
  autoGeneratePoToken,
  testCipherServer,
  autoConfig,
  applyAutoConfig,
  DEFAULT_CIPHER_SERVER
};
