// Static responsive rules (scripts/check-responsive.mjs): the rules themselves, and the codebase.
// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { checkSource } from "../../scripts/check-responsive.mjs";

const rules = (source) => checkSource(source).map((finding) => finding.rule);

test("a table without a horizontal scroller is flagged", () => {
  assert.deepEqual(rules(`<div>\n  <table className="min-w-full">\n  </table>\n</div>`), ["table-scroll"]);
});

test("a table inside overflow-x-auto is fine", () => {
  assert.deepEqual(rules(`<div className="overflow-x-auto">\n  <table className="min-w-full">\n  </table>\n</div>`), []);
});

test("a bare 4-column grid is flagged, a responsive one is not", () => {
  assert.deepEqual(rules(`<div className="grid grid-cols-4 gap-2" />`), ["fixed-grid"]);
  assert.deepEqual(rules(`<div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4" />`), []);
});

test("very wide fixed widths are flagged unless capped", () => {
  assert.deepEqual(rules(`<div className="w-[480px]" />`), ["wide-fixed"]);
  assert.deepEqual(rules(`<div className="w-[480px] max-w-full" />`), []);
  assert.deepEqual(rules(`<div className="min-w-[8rem]" />`), []);
});

test("a row of 3 buttons that cannot wrap is flagged (the lot page header bug)", () => {
  const row = [
    `      <div className="flex items-center gap-2">`,
    `        <BookmarkButton lotId={lot.id} />`,
    `        <EntityEditButton label="Edit details" />`,
    `        <EntityDeleteButton label="Delete lot + everything" />`,
    `      </div>`,
  ].join("\n");
  assert.deepEqual(rules(row), ["nowrap-row"]);
  assert.deepEqual(rules(row.replace("flex items-center", "flex flex-wrap items-center")), []);
});

test("two buttons in a row are fine", () => {
  const row = [`<div className="flex gap-2">`, `  <button className="btn btn-sm btn-primary">Save</button>`, `  <button className="btn btn-sm btn-secondary">Cancel</button>`, `</div>`].join("\n");
  assert.deepEqual(rules(row), []);
});

test("responsive-ok suppresses a reviewed line", () => {
  assert.deepEqual(rules(`{/* responsive-ok: five tabs fit */}\n<div className="grid grid-cols-5" />`), []);
});

test("the codebase passes the responsive checks", () => {
  // Throws (non-zero exit) and prints every finding if anything regressed.
  execFileSync(process.execPath, ["scripts/check-responsive.mjs"], { stdio: "pipe" });
});
