#!/usr/bin/env node
// scripts/package-extension.js
// Builds a clean, distributable ZIP for the LeetUp Chrome extension.
//
// Included files (only what Chrome needs):
//   manifest.json
//   content.js
//   background.js
//   popup.html
//   popup.js
//   popup.css
//   modal.css
//   icons/icon16.png
//   icons/icon48.png
//   icons/icon128.png
//
// Explicitly excluded:
//   node_modules/, tests/, .git/, docs/, .kiro/, .github/
//   *.test.js, *.lock, package*.json, README*, LICENSE
//   *.zip, *.crx, coverage/, dist/ (previous builds)
//   Any file matching secret patterns (.env, *.pem, *.key)
//
// Output: dist/leetup.zip

'use strict';

const fs        = require('fs');
const path      = require('path');
const zlib      = require('zlib');

const ROOT    = path.resolve(__dirname, '..');
const DIST    = path.join(ROOT, 'dist');
const OUT_ZIP = path.join(DIST, 'leetup.zip');

// The exact set of files to include (paths relative to ROOT).
// This list is intentionally explicit to avoid accidentally packaging
// sensitive or irrelevant files. Update it whenever the extension's
// file structure changes.
const EXTENSION_FILES = [
  'manifest.json',
  'content.js',
  'background.js',
  'popup.html',
  'popup.js',
  'popup.css',
  'modal.css',
  'icons/icon16.png',
  'icons/icon48.png',
  'icons/icon128.png',
];

// ── Verify every listed file exists before attempting to zip ─────────────
const missing = EXTENSION_FILES.filter(f => !fs.existsSync(path.join(ROOT, f)));
if (missing.length) {
  console.error('✗  Cannot build ZIP — the following files are missing:');
  missing.forEach(f => console.error(`   ${f}`));
  process.exit(1);
}

// ── Prepare output directory ──────────────────────────────────────────────
fs.mkdirSync(DIST, { recursive: true });

// Remove any previous zip so the artifact is always fresh.
if (fs.existsSync(OUT_ZIP)) {
  fs.unlinkSync(OUT_ZIP);
}

// ── Create ZIP using the system `zip` (Linux/macOS) or PowerShell (Windows)
// GitHub Actions runners use Ubuntu — the `zip` branch is the CI path.
// The PowerShell branch allows local validation on Windows dev machines.
const { execSync, spawnSync } = require('child_process');
const isWindows = process.platform === 'win32';

console.log('Building extension ZIP…');
console.log(`  Contents: ${EXTENSION_FILES.join(', ')}`);

if (isWindows) {
  // PowerShell Compress-Archive flattens paths when given a list of files.
  // Work around this by staging all files into a temp directory that mirrors
  // the extension layout, then zipping the whole staging directory.
  const os = require('os');
  const stagingDir = fs.mkdtempSync(require('path').join(os.tmpdir(), 'leetup-stage-'));

  try {
    for (const f of EXTENSION_FILES) {
      const src = path.join(ROOT, f);
      const dst = path.join(stagingDir, f);
      fs.mkdirSync(path.dirname(dst), { recursive: true });
      fs.copyFileSync(src, dst);
    }

    const psCmd = `Compress-Archive -Path '${stagingDir}\\*' -DestinationPath '${OUT_ZIP}' -Force`;
    const result = require('child_process').spawnSync(
      'powershell', ['-NoProfile', '-Command', psCmd],
      { cwd: ROOT, stdio: 'inherit' }
    );
    if (result.status !== 0) {
      console.error('✗  PowerShell Compress-Archive failed.');
      process.exit(1);
    }
  } finally {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }
} else {
  // Linux/macOS: use system `zip` (standard on all GitHub-hosted runners).
  const fileArgs = EXTENSION_FILES.map(f => `"${f}"`).join(' ');
  const cmd = `zip -r "${OUT_ZIP}" ${fileArgs}`;
  try {
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  } catch (err) {
    console.error(`✗  zip command failed: ${err.message}`);
    process.exit(1);
  }
}

const stats = fs.statSync(OUT_ZIP);
console.log(`✓  dist/leetup.zip created (${(stats.size / 1024).toFixed(1)} KB)`);
