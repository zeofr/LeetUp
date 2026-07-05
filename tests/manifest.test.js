/**
 * Manifest smoke tests for leetcode-github-sync
 * Requirements: 8.1–8.9, 9.1
 */

const path = require("path");
const fs = require("fs");

const manifestPath = path.resolve(__dirname, "..", "manifest.json");
const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));

describe("manifest.json — Manifest V3 declarations (Requirements 8.1–8.9)", () => {
  // Requirement 8.1
  test("manifest_version is 3", () => {
    expect(manifest.manifest_version).toBe(3);
  });

  // Requirements 8.2 & 8.3 — exactly ["storage", "activeTab"], nothing more
  test('permissions contains exactly ["storage", "activeTab"]', () => {
    expect(Array.isArray(manifest.permissions)).toBe(true);
    expect(manifest.permissions).toHaveLength(2);
    expect(manifest.permissions).toContain("storage");
    expect(manifest.permissions).toContain("activeTab");
  });

  // Requirements 8.4, 8.5 & 8.9 — host permissions are exactly the two required ones
  test("host_permissions contains only the two required origins", () => {
    expect(Array.isArray(manifest.host_permissions)).toBe(true);
    expect(manifest.host_permissions).toHaveLength(2);
    expect(manifest.host_permissions).toContain("https://leetcode.com/*");
    expect(manifest.host_permissions).toContain("https://api.github.com/*");
  });

  // Requirement 8.6
  test("background.service_worker is background.js", () => {
    expect(manifest.background).toBeDefined();
    expect(manifest.background.service_worker).toBe("background.js");
  });

  // Requirement 8.7 — content script matches pattern, run_at, and js entry
  describe("content_scripts", () => {
    let contentScript;

    beforeAll(() => {
      expect(Array.isArray(manifest.content_scripts)).toBe(true);
      expect(manifest.content_scripts.length).toBeGreaterThanOrEqual(1);
      // Pick the entry that targets LeetCode problems
      contentScript = manifest.content_scripts.find(
        (cs) =>
          Array.isArray(cs.matches) &&
          cs.matches.includes("https://leetcode.com/problems/*")
      );
    });

    test("has a content script entry targeting https://leetcode.com/problems/*", () => {
      expect(contentScript).toBeDefined();
    });

    test("content script run_at is document_idle", () => {
      expect(contentScript.run_at).toBe("document_idle");
    });

    test("content script js includes content.js", () => {
      expect(Array.isArray(contentScript.js)).toBe(true);
      expect(contentScript.js).toContain("content.js");
    });
  });

  // Requirement 8.8
  test("action.default_popup is popup.html", () => {
    expect(manifest.action).toBeDefined();
    expect(manifest.action.default_popup).toBe("popup.html");
  });

  // Requirement 8.9 — no extra permissions beyond storage + activeTab
  test("no extra permissions beyond storage and activeTab", () => {
    const allowed = new Set(["storage", "activeTab"]);
    const declared = manifest.permissions ?? [];
    const extras = declared.filter((p) => !allowed.has(p));
    expect(extras).toHaveLength(0);
  });

  // Requirement 8.9 — no extra host permissions
  test("no extra host permissions beyond leetcode.com and api.github.com", () => {
    const allowed = new Set([
      "https://leetcode.com/*",
      "https://api.github.com/*",
    ]);
    const declared = manifest.host_permissions ?? [];
    const extras = declared.filter((p) => !allowed.has(p));
    expect(extras).toHaveLength(0);
  });
});

// Requirement 9.1 — credentials stored only in chrome.storage.local, never chrome.storage.sync
describe("credential storage — chrome.storage.sync must never be used (Requirement 9.1)", () => {
  const sourceFiles = [
    { name: "popup.js", filePath: path.resolve(__dirname, "..", "popup.js") },
    {
      name: "background.js",
      filePath: path.resolve(__dirname, "..", "background.js"),
    },
  ];

  sourceFiles.forEach(({ name, filePath }) => {
    test(`${name} does not reference chrome.storage.sync`, () => {
      const source = fs.readFileSync(filePath, "utf-8");
      expect(source).not.toMatch(/chrome\.storage\.sync/);
    });
  });
});
