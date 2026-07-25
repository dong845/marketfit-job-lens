import { cp, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const source = join(root, "node_modules", "pdfjs-dist");
const target = join(root, "vendor", "pdfjs");

await rm(target, { recursive: true, force: true });
await mkdir(target, { recursive: true });
await Promise.all([
  cp(join(source, "build", "pdf.min.mjs"), join(target, "pdf.mjs")),
  cp(join(source, "build", "pdf.worker.min.mjs"), join(target, "pdf.worker.mjs")),
  cp(join(source, "cmaps"), join(target, "cmaps"), { recursive: true }),
  cp(join(source, "standard_fonts"), join(target, "standard_fonts"), { recursive: true }),
  cp(join(source, "wasm"), join(target, "wasm"), { recursive: true }),
  cp(join(source, "LICENSE"), join(target, "LICENSE"))
]);

console.log("Copied local PDF.js runtime into vendor/pdfjs");
