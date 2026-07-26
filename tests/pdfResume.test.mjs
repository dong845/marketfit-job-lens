import assert from "node:assert/strict";
import test from "node:test";
import { MAX_RESUME_PDF_BYTES, ResumePdfError, textFromItems, validateResumePdf } from "../src/profile/pdfValidation.js";
import { extractResumePdf } from "../src/profile/pdfResume.js";
import { format } from "../src/ui/i18n.js";
import { readFile } from "node:fs/promises";

test("resume upload accepts a local PDF-shaped file and rejects unsafe inputs", () => {
  const pdf = { name: "resume.pdf", size: 2048, async arrayBuffer() { return new ArrayBuffer(0); } };
  assert.doesNotThrow(() => validateResumePdf(pdf));
  assert.throws(() => validateResumePdf({ ...pdf, name: "resume.docx" }), ResumePdfError);
  assert.throws(() => validateResumePdf({ ...pdf, size: MAX_RESUME_PDF_BYTES + 1 }), ResumePdfError);
});

test("PDF text item reconstruction preserves line boundaries", () => {
  assert.equal(textFromItems([{ str: "Experience", hasEOL: true }, { str: "Built Python services", hasEOL: false }]), "Experience\nBuilt Python services");
});

test("resume status formatting replaces file metadata placeholders", () => {
  assert.equal(format("en", "pdfReady", { name: "resume.pdf", pages: 2 }), "resume.pdf ready: 2 page(s).");
  assert.equal(format("zh", "pdfReady", { name: "简历.pdf", pages: 2 }), "简历.pdf 已就绪：2 页。");
});

test("manifest requests website access only as an optional permission", async () => {
  const manifest = JSON.parse(await readFile(new URL("../manifest.json", import.meta.url), "utf8"));
  assert.equal(manifest.permissions.includes("tabs"), true);
  // chrome.permissions needs no manifest declaration. Declaring "permissions" makes Chrome
  // drop it and warn "Permission 'permissions' is unknown or URL pattern is malformed".
  assert.equal(manifest.permissions.includes("permissions"), false);
  // The local bridge is gone, so nothing needs a host permission at install time.
  assert.equal("host_permissions" in manifest, false);
  // https only: an http origin the manifest cannot grant produces a denial the user
  // cannot act on, and a broad http://*/* is the permission most likely to stall a
  // Web Store review for something real job boards never need.
  assert.deepEqual(manifest.optional_host_permissions, ["https://*/*"]);
});

test("PDF extraction joins local page text and rejects an image-only resume", async () => {
  const file = { name: "resume.pdf", size: 2048, async arrayBuffer() { return new ArrayBuffer(8); } };
  const documentProxy = {
    numPages: 2,
    async getPage(pageNumber) { return { async getTextContent() { return { items: [{ str: `Page ${pageNumber}`, hasEOL: true }, { str: "Built Python services", hasEOL: false }] }; } }; },
    async destroy() {}
  };
  const extracted = await extractResumePdf(file, { getDocument: () => ({ promise: Promise.resolve(documentProxy) }) });
  assert.match(extracted.text, /Page 1/);
  assert.equal(extracted.pageCount, 2);
  await assert.rejects(() => extractResumePdf(file, { getDocument: () => ({ promise: Promise.resolve({ numPages: 1, async getPage() { return { async getTextContent() { return { items: [] }; } }; }, async destroy() {} }) }) }), ResumePdfError);
});
