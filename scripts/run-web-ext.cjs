const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function firstExistingPath(candidates) {
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function findChromiumBinary() {
  const envBinary = process.env.VIVALDI_BINARY
    || process.env.CHROMIUM_BINARY
    || process.env.BROWSER_BINARY;

  const candidates = [envBinary];

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\Vivaldi\\Application\\vivaldi.exe',
      'C:\\Program Files (x86)\\Vivaldi\\Application\\vivaldi.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Vivaldi', 'Application', 'vivaldi.exe'),
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe'
    );
  }

  return firstExistingPath(candidates);
}

const chromiumBinary = findChromiumBinary();
if (!chromiumBinary) {
  console.error('Could not find Vivaldi/Chromium. Set VIVALDI_BINARY to the browser executable path.');
  process.exit(1);
}

const webExtBin = path.join(process.cwd(), 'node_modules', 'web-ext', 'bin', 'web-ext.js');
if (!fs.existsSync(webExtBin)) {
  console.error(`Could not find web-ext CLI at ${webExtBin}`);
  process.exit(1);
}

const args = [
  webExtBin,
  'run',
  '--target',
  'chromium',
  '--chromium-binary',
  chromiumBinary
];

const result = spawnSync(process.execPath, args, {
  stdio: 'inherit',
  env: process.env
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 0);
