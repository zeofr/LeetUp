#!/usr/bin/env node
// scripts/validate-zip.js
// Validates dist/leetup.zip using pure Node.js — no external tools (unzip,
// PowerShell, etc.) required. Works identically on Linux CI and Windows dev.
//
// Checks:
//   1. ZIP file exists and is non-empty.
//   2. manifest.json is present and parses as valid JSON.
//   3. manifest.json contains required fields (manifest_version, name, version).
//   4. Every file referenced by the manifest is present in the ZIP.
//   5. No dangerous files are included (node_modules, .env, *.key, *.pem).
//   6. No test files are included (*.test.js).

'use strict';

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const ZIP  = path.join(ROOT, 'dist', 'leetup.zip');

// ─── Minimal ZIP parser ───────────────────────────────────────────────────
// Reads the ZIP Central Directory to enumerate all entries and extract files.
// Supports DEFLATE (method 8) and STORE (method 0) entries only — which is
// exactly what both `zip` (Linux) and Compress-Archive (Windows) produce.

const SIG_LOCAL    = 0x04034b50;
const SIG_CENTRAL  = 0x02014b50;
const SIG_EOCD     = 0x06054b50;

function readUInt16LE(buf, off) { return buf.readUInt16LE(off); }
function readUInt32LE(buf, off) { return buf.readUInt32LE(off); }

/** Returns array of { name: string, data: Buffer } for every entry in the ZIP. */
function parseZip(buf) {
  // Locate the End of Central Directory record by scanning backwards.
  let eocdOffset = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset === -1) throw new Error('EOCD record not found — not a valid ZIP file.');

  const cdOffset = readUInt32LE(buf, eocdOffset + 16);
  const cdSize   = readUInt32LE(buf, eocdOffset + 12);

  const entries = [];
  let pos = cdOffset;
  const end = cdOffset + cdSize;

  while (pos < end) {
    if (readUInt32LE(buf, pos) !== SIG_CENTRAL) break;

    const method       = readUInt16LE(buf, pos + 10);
    const compSize     = readUInt32LE(buf, pos + 20);
    const uncompSize   = readUInt32LE(buf, pos + 24);
    const fnameLen     = readUInt16LE(buf, pos + 28);
    const extraLen     = readUInt16LE(buf, pos + 30);
    const commentLen   = readUInt16LE(buf, pos + 32);
    const localOffset  = readUInt32LE(buf, pos + 42);
    const fname        = buf.slice(pos + 46, pos + 46 + fnameLen).toString('utf8')
                             .replace(/\\/g, '/');   // normalise Windows separators

    pos += 46 + fnameLen + extraLen + commentLen;

    // Skip directory entries
    if (fname.endsWith('/')) continue;

    // Read the local file header to find the actual data offset
    const localExtraLen = readUInt16LE(buf, localOffset + 28);
    const localFnLen    = readUInt16LE(buf, localOffset + 26);
    const dataStart     = localOffset + 30 + localFnLen + localExtraLen;
    const compressed    = buf.slice(dataStart, dataStart + compSize);

    let data;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = zlib.inflateRawSync(compressed);
    } else {
      throw new Error(`Unsupported compression method ${method} for entry: ${fname}`);
    }

    entries.push({ name: fname, data });
  }

  return entries;
}

// ─── Load and parse ZIP ───────────────────────────────────────────────────
if (!fs.existsSync(ZIP)) {
  console.error('✗  dist/leetup.zip not found. Run scripts/package-extension.js first.');
  process.exit(1);
}

const zipBuf = fs.readFileSync(ZIP);
if (zipBuf.length === 0) {
  console.error('✗  dist/leetup.zip is empty.');
  process.exit(1);
}

let entries;
try {
  entries = parseZip(zipBuf);
} catch (err) {
  console.error(`✗  Could not parse ZIP: ${err.message}`);
  process.exit(1);
}

// Build lookup: name → data Buffer
const zipMap = new Map(entries.map(e => [e.name, e.data]));
console.log(`ZIP contains ${zipMap.size} file entries: ${[...zipMap.keys()].join(', ')}`);

const errors = [];

// ─── Forbidden file patterns ──────────────────────────────────────────────
const FORBIDDEN = [
  /node_modules\//,
  /\.env($|\.)/,
  /\.pem$/,
  /\.key$/,
  /\.test\.js$/,
  /^package(-lock)?\.json$/,
  /\.gitignore/,
  /\.git\//,
];

for (const name of zipMap.keys()) {
  for (const pat of FORBIDDEN) {
    if (pat.test(name)) {
      errors.push(`Forbidden entry in ZIP: "${name}"  (matches ${pat})`);
    }
  }
}

// ─── manifest.json validation ─────────────────────────────────────────────
if (!zipMap.has('manifest.json')) {
  errors.push('manifest.json is missing from the ZIP.');
} else {
  let manifest;
  try {
    manifest = JSON.parse(zipMap.get('manifest.json').toString('utf8'));
  } catch (err) {
    errors.push(`manifest.json inside ZIP is invalid JSON: ${err.message}`);
  }

  if (manifest) {
    for (const field of ['manifest_version', 'name', 'version']) {
      if (manifest[field] == null || manifest[field] === '') {
        errors.push(`manifest.json in ZIP missing required field: "${field}"`);
      }
    }

    // Collect every locally-referenced file path
    const refs = [];
    if (manifest.background?.service_worker) refs.push(manifest.background.service_worker);
    (manifest.content_scripts || []).forEach(cs => {
      (cs.js  || []).forEach(f => refs.push(f));
      (cs.css || []).forEach(f => refs.push(f));
    });
    const action = manifest.action || manifest.browser_action;
    if (action?.default_popup) refs.push(action.default_popup);
    if (action?.default_icon && typeof action.default_icon === 'object') {
      Object.values(action.default_icon).forEach(f => refs.push(f));
    }
    Object.values(manifest.icons || {}).forEach(f => refs.push(f));

    for (const ref of refs) {
      if (!zipMap.has(ref)) {
        errors.push(`Manifest references "${ref}" but it is not in the ZIP.`);
      }
    }
  }
}

// ─── Report ───────────────────────────────────────────────────────────────
if (errors.length) {
  errors.forEach(e => console.error(`✗  ${e}`));
  process.exit(1);
}

console.log('✓  dist/leetup.zip is valid (manifest OK, all assets present, no forbidden files)');
