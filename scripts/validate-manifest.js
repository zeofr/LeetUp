#!/usr/bin/env node
// scripts/validate-manifest.js
// Validates manifest.json required fields and checks every locally-referenced
// file actually exists on disk.
//
// Required fields checked:   manifest_version, name, version
// File references checked:   background.service_worker
//                            content_scripts[*].js[]
//                            content_scripts[*].css[]
//                            action.default_popup
//                            action.default_icon values
//                            icons values

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT     = path.resolve(__dirname, '..');
const MANIFEST = path.join(ROOT, 'manifest.json');

// ── Load and parse ────────────────────────────────────────────────────────
let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
} catch (err) {
  console.error(`✗ manifest.json parse error: ${err.message}`);
  process.exit(1);
}

const errors   = [];
const warnings = [];

// ── Required top-level fields ─────────────────────────────────────────────
const REQUIRED_FIELDS = ['manifest_version', 'name', 'version'];
for (const field of REQUIRED_FIELDS) {
  if (manifest[field] == null || manifest[field] === '') {
    errors.push(`Missing required field: "${field}"`);
  }
}

// manifest_version must be 2 or 3
if (manifest.manifest_version !== 2 && manifest.manifest_version !== 3) {
  errors.push(`manifest_version must be 2 or 3, got: ${manifest.manifest_version}`);
}

// ── Helper: assert a relative file path exists ────────────────────────────
function checkFile(relPath, context) {
  if (!relPath || typeof relPath !== 'string') {
    errors.push(`${context}: expected a non-empty string path`);
    return;
  }
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) {
    errors.push(`${context}: file not found → ${relPath}`);
  }
}

// ── Background service worker ─────────────────────────────────────────────
if (manifest.background) {
  if (manifest.background.service_worker) {
    checkFile(manifest.background.service_worker, 'background.service_worker');
  } else if (manifest.background.scripts) {
    manifest.background.scripts.forEach((s, i) =>
      checkFile(s, `background.scripts[${i}]`));
  }
}

// ── Content scripts ───────────────────────────────────────────────────────
if (Array.isArray(manifest.content_scripts)) {
  manifest.content_scripts.forEach((cs, csIdx) => {
    (cs.js  || []).forEach((f, i) => checkFile(f, `content_scripts[${csIdx}].js[${i}]`));
    (cs.css || []).forEach((f, i) => checkFile(f, `content_scripts[${csIdx}].css[${i}]`));
  });
}

// ── Action / browser action ───────────────────────────────────────────────
const action = manifest.action || manifest.browser_action;
if (action) {
  if (action.default_popup) {
    checkFile(action.default_popup, 'action.default_popup');
  }
  if (action.default_icon && typeof action.default_icon === 'object') {
    for (const [size, iconPath] of Object.entries(action.default_icon)) {
      checkFile(iconPath, `action.default_icon[${size}]`);
    }
  }
}

// ── Top-level icons ───────────────────────────────────────────────────────
if (manifest.icons && typeof manifest.icons === 'object') {
  for (const [size, iconPath] of Object.entries(manifest.icons)) {
    checkFile(iconPath, `icons[${size}]`);
  }
}

// ── Report ────────────────────────────────────────────────────────────────
if (warnings.length) {
  warnings.forEach(w => console.warn(`⚠  ${w}`));
}

if (errors.length) {
  errors.forEach(e => console.error(`✗  ${e}`));
  process.exit(1);
}

console.log('manifest.json ✓  (all required fields present, all referenced files exist)');
