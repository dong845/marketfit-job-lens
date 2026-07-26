export const MAX_RESUME_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_RESUME_PDF_PAGES = 40;
export const MAX_RESUME_TEXT_LENGTH = 60000;

/** Carries a code so the panel can say this in the reader's language; see i18n.js. */
export class ResumePdfError extends Error {
  constructor(message, code = "", params = {}) {
    super(message);
    this.name = "ResumePdfError";
    this.code = code;
    this.params = params;
  }
}

export function validateResumePdf(file) {
  if (!file || typeof file.arrayBuffer !== "function") throw new ResumePdfError("Choose a PDF resume first.", "pdfMissing");
  const name = String(file.name || "");
  if (!/\.pdf$/i.test(name)) throw new ResumePdfError("Only PDF resumes are supported.", "pdfNotPdf");
  if (Number(file.size) > MAX_RESUME_PDF_BYTES) throw new ResumePdfError("The PDF is too large. Use a file smaller than 15 MB.", "pdfTooLarge", { mb: Math.round(MAX_RESUME_PDF_BYTES / (1024 * 1024)) });
  if (Number(file.size) === 0) throw new ResumePdfError("The PDF file is empty.", "pdfEmpty");
}

export function textFromItems(items) {
  return items.map((item) => `${item.str || ""}${item.hasEOL ? "\n" : " "}`).join("").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}
