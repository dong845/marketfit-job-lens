const MAX_BLOCK_CHARS = 900;
const MAX_BLOCKS_PER_SOURCE = 80;

export function buildEvidenceBlockBundle(request) {
  const resume = buildEvidenceBlocks(request.input.resumeText, "CV", "resume");
  const job = buildEvidenceBlocks(request.input.job.description, "JD", "job");
  const all = [...resume, ...job];
  return {
    resume,
    job,
    all,
    byId: new Map(all.map((block) => [block.id, block]))
  };
}

export function resolveEvidenceRef(ref, request) {
  const bundle = buildEvidenceBlockBundle(request);
  return bundle.byId.get(String(ref || "").trim()) || null;
}

function buildEvidenceBlocks(text, prefix, source) {
  const chunks = splitIntoChunks(text).slice(0, MAX_BLOCKS_PER_SOURCE);
  return chunks.map((quote, index) => ({
    id: `${prefix}-${String(index + 1).padStart(3, "0")}`,
    source,
    quote
  }));
}

function splitIntoChunks(text) {
  const paragraphs = normalizeBlockText(text).split(/\n{2,}|\n(?=\s*[-*0-9一二三四五六七八九十])/).map((item) => item.trim()).filter(Boolean);
  const chunks = [];
  let current = "";
  for (const paragraph of paragraphs.length ? paragraphs : [normalizeBlockText(text)]) {
    for (const piece of splitLongParagraph(paragraph)) {
      if (!current) {
        current = piece;
      } else if (`${current}\n${piece}`.length <= MAX_BLOCK_CHARS) {
        current = `${current}\n${piece}`;
      } else {
        chunks.push(current);
        current = piece;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks.filter((item) => item.length >= 8);
}

function splitLongParagraph(paragraph) {
  if (paragraph.length <= MAX_BLOCK_CHARS) return [paragraph];
  const sentences = paragraph.split(/(?<=[。.!?])\s+/).filter(Boolean);
  if (sentences.length <= 1) return paragraph.match(new RegExp(`.{1,${MAX_BLOCK_CHARS}}`, "g")) || [];
  const chunks = [];
  let current = "";
  for (const sentence of sentences) {
    if (!current) current = sentence;
    else if (`${current} ${sentence}`.length <= MAX_BLOCK_CHARS) current = `${current} ${sentence}`;
    else {
      chunks.push(current);
      current = sentence;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function normalizeBlockText(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
