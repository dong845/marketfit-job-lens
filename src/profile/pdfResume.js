import { MAX_RESUME_PDF_PAGES, MAX_RESUME_TEXT_LENGTH, ResumePdfError, textFromItems, validateResumePdf } from "./pdfValidation.js";

export { MAX_RESUME_PDF_BYTES, MAX_RESUME_PDF_PAGES, MAX_RESUME_TEXT_LENGTH, ResumePdfError, textFromItems, validateResumePdf } from "./pdfValidation.js";

let runtimePromise;

export async function configurePdfWorker(workerUrl) {
  const pdfjs = await loadPdfRuntime();
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
}

export async function extractResumePdf(file, { getDocument } = {}) {
  validateResumePdf(file);
  let documentProxy;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    const loadingTask = (getDocument || (await loadPdfRuntime()).getDocument)({ data, disableAutoFetch: true, disableStream: true });
    documentProxy = await loadingTask.promise;
    if (documentProxy.numPages > MAX_RESUME_PDF_PAGES) throw new ResumePdfError("The PDF has too many pages. Use a resume of 40 pages or fewer.");
    const pages = [];
    for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
      const page = await documentProxy.getPage(pageNumber);
      pages.push(textFromItems((await page.getTextContent()).items));
    }
    const text = pages.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
    if (!text) throw new ResumePdfError("No selectable text was found. Upload a text-based PDF, not a scanned image.");
    return {
      fileName: file.name,
      pageCount: documentProxy.numPages,
      text: text.slice(0, MAX_RESUME_TEXT_LENGTH),
      truncated: text.length > MAX_RESUME_TEXT_LENGTH
    };
  } catch (error) {
    if (error instanceof ResumePdfError) throw error;
    const message = String(error?.message || "");
    if (/password/i.test(message)) throw new ResumePdfError("This PDF is password protected. Upload an unlocked copy.");
    if (/invalid|format|corrupt/i.test(message)) throw new ResumePdfError("This file is not a readable PDF.");
    throw new ResumePdfError("The PDF could not be read on this device.");
  } finally {
    await documentProxy?.destroy?.();
  }
}

function loadPdfRuntime() {
  runtimePromise ||= import("../../vendor/pdfjs/pdf.mjs");
  return runtimePromise;
}
