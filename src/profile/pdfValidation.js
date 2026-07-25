export const MAX_RESUME_PDF_BYTES = 15 * 1024 * 1024;
export const MAX_RESUME_PDF_PAGES = 40;
export const MAX_RESUME_TEXT_LENGTH = 60000;

export class ResumePdfError extends Error {
  constructor(message) {
    super(message);
    this.name = "ResumePdfError";
  }
}

export function validateResumePdf(file) {
  if (!file || typeof file.arrayBuffer !== "function") throw new ResumePdfError("Choose a PDF resume first.");
  const name = String(file.name || "");
  if (!/\.pdf$/i.test(name)) throw new ResumePdfError("Only PDF resumes are supported.");
  if (Number(file.size) > MAX_RESUME_PDF_BYTES) throw new ResumePdfError("The PDF is too large. Use a file smaller than 15 MB.");
  if (Number(file.size) === 0) throw new ResumePdfError("The PDF file is empty.");
}

export function textFromItems(items) {
  return items.map((item) => `${item.str || ""}${item.hasEOL ? "\n" : " "}`).join("").replace(/[ \t]+\n/g, "\n").replace(/[ \t]{2,}/g, " ").trim();
}
