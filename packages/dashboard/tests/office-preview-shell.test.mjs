import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_SRC = path.resolve(TEST_DIR, "../src");

test("office preview shell keeps the pixel viewport dominant at laptop width", () => {
  const pixelOfficeSource = readDashboardSource("components/PixelOffice.tsx");
  const officeCssSource = readDashboardSource("office.module.css");

  assert.match(
    pixelOfficeSource,
    /data-office-preview-shell="viewport-dominant"/,
  );
  assert.match(
    officeCssSource,
    /\.office-frame\[data-office-preview-shell="viewport-dominant"\] \.office-summary-band/,
  );
  assert.match(
    officeCssSource,
    /grid-template-columns: minmax\(260px, 0\.78fr\) minmax\(390px, 1\.22fr\);/,
  );
  assert.match(
    officeCssSource,
    /\.office-frame\[data-office-preview-shell="viewport-dominant"\] \.office-summary-text \{\s+display: none;/,
  );
});

function readDashboardSource(relativePath) {
  return readFileSync(path.join(DASHBOARD_SRC, relativePath), "utf8");
}
