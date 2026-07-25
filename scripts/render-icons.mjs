/**
 * Render assets/icon-{16,48,128}.svg to matching PNGs.
 *
 * Chrome ignores SVG in manifest.icons, so the shipped icons must be raster.
 * This renders them from the SVG sources instead of committing opaque binaries
 * nobody can regenerate: edit the SVG, re-run `npm run icons`, and the PNGs follow.
 *
 * Supports only the SVG subset these three files use — one <rect> background,
 * filled <path> polygons, and stroked <path> polylines with round caps. Anything
 * else (curves, gradients, transforms) throws rather than rendering silently wrong.
 */
import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SIZES = [16, 48, 128];
const SUPERSAMPLE = 8;
const root = fileURLToPath(new URL("..", import.meta.url));

function main() {
  for (const size of SIZES) {
    const svg = readFileSync(`${root}assets/icon-${size}.svg`, "utf8");
    const png = encodePng(size, size, rasterize(parseSvg(svg), size));
    writeFileSync(`${root}assets/icon-${size}.png`, png);
    console.log(`assets/icon-${size}.png  ${size}x${size}  ${png.length} bytes`);
  }
}

// ---------------------------------------------------------------- SVG parsing

function parseSvg(svg) {
  const viewBox = attr(svg.match(/<svg[^>]*>/)[0], "viewBox");
  const [, , vbWidth] = viewBox.split(/[\s,]+/).map(Number);
  const shapes = [];

  const rect = svg.match(/<rect[^>]*>/);
  if (rect) {
    shapes.push({
      type: "rect",
      width: Number(attr(rect[0], "width")),
      height: Number(attr(rect[0], "height")),
      radius: Number(attr(rect[0], "rx") || 0),
      fill: attr(rect[0], "fill")
    });
  }

  for (const tag of svg.match(/<path[^>]*>/g) || []) {
    const points = parsePathData(attr(tag, "d"));
    const stroke = attr(tag, "stroke");
    if (stroke) {
      shapes.push({ type: "stroke", points, color: stroke, width: Number(attr(tag, "stroke-width")) });
    } else {
      shapes.push({ type: "polygon", points, color: attr(tag, "fill") });
    }
  }
  return { viewBox: vbWidth, shapes };
}

/** Handles M/L/H/V (+ relative) and Z, including implicit command repetition. */
function parsePathData(d) {
  const tokens = d.match(/[MmLlHhVvZz]|-?\d*\.?\d+/g) || [];
  const points = [];
  let command = "";
  let x = 0;
  let y = 0;
  let index = 0;

  while (index < tokens.length) {
    if (/[A-Za-z]/.test(tokens[index])) command = tokens[index++];
    if (command === "Z" || command === "z") break;
    const relative = command === command.toLowerCase();
    const next = () => Number(tokens[index++]);

    if (command === "M" || command === "m" || command === "L" || command === "l") {
      const dx = next();
      const dy = next();
      x = relative ? x + dx : dx;
      y = relative ? y + dy : dy;
      // A second coordinate pair after M is an implicit lineto, which is how
      // these glyphs encode their diagonals — treating it as another moveto
      // would silently drop segments.
      if (command === "M") command = "L";
      if (command === "m") command = "l";
    } else if (command === "H" || command === "h") {
      const dx = next();
      x = relative ? x + dx : dx;
    } else if (command === "V" || command === "v") {
      const dy = next();
      y = relative ? y + dy : dy;
    } else {
      throw new Error(`Unsupported path command "${command}" — this renderer covers only M/L/H/V/Z.`);
    }
    points.push([x, y]);
  }
  return points;
}

function attr(tag, name) {
  return tag.match(new RegExp(`${name}="([^"]*)"`))?.[1] || "";
}

function parseColor(value) {
  const hex = value.replace("#", "");
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16)
  ];
}

// ---------------------------------------------------------------- rasterizing

function rasterize({ viewBox, shapes }, size) {
  const scale = (size * SUPERSAMPLE) / viewBox;
  const dimension = size * SUPERSAMPLE;
  // Premultiplied RGBA so the rounded corners downsample without a light halo.
  const buffer = new Float64Array(dimension * dimension * 4);
  const background = shapes.find((shape) => shape.type === "rect");

  for (let py = 0; py < dimension; py += 1) {
    for (let px = 0; px < dimension; px += 1) {
      const x = (px + 0.5) / scale;
      const y = (py + 0.5) / scale;
      if (background && !insideRoundedRect(x, y, background)) continue;

      let color = background ? parseColor(background.fill) : null;
      for (const shape of shapes) {
        if (shape.type === "polygon" && insidePolygon(x, y, shape.points)) color = parseColor(shape.color);
        if (shape.type === "stroke" && nearPolyline(x, y, shape.points, shape.width / 2)) color = parseColor(shape.color);
      }
      if (!color) continue;

      const offset = (py * dimension + px) * 4;
      buffer[offset] = color[0];
      buffer[offset + 1] = color[1];
      buffer[offset + 2] = color[2];
      buffer[offset + 3] = 255;
    }
  }
  return downsample(buffer, dimension, size);
}

function downsample(buffer, dimension, size) {
  const out = Buffer.alloc(size * size * 4);
  const samples = SUPERSAMPLE * SUPERSAMPLE;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const offset = ((y * SUPERSAMPLE + sy) * dimension + x * SUPERSAMPLE + sx) * 4;
          const alpha = buffer[offset + 3] / 255;
          r += buffer[offset] * alpha;
          g += buffer[offset + 1] * alpha;
          b += buffer[offset + 2] * alpha;
          a += alpha;
        }
      }
      const coverage = a / samples;
      const target = (y * size + x) * 4;
      out[target] = coverage ? Math.round(r / a) : 0;
      out[target + 1] = coverage ? Math.round(g / a) : 0;
      out[target + 2] = coverage ? Math.round(b / a) : 0;
      out[target + 3] = Math.round(coverage * 255);
    }
  }
  return out;
}

function insideRoundedRect(x, y, { width, height, radius }) {
  if (x < 0 || y < 0 || x > width || y > height) return false;
  if (!radius) return true;
  const cx = Math.min(Math.max(x, radius), width - radius);
  const cy = Math.min(Math.max(y, radius), height - radius);
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

function insidePolygon(x, y, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i, i += 1) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Round caps and joins fall out of a plain distance-to-segment test. */
function nearPolyline(x, y, points, radius) {
  for (let i = 1; i < points.length; i += 1) {
    const [x1, y1] = points[i - 1];
    const [x2, y2] = points[i];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared ? Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / lengthSquared)) : 0;
    if ((x - (x1 + t * dx)) ** 2 + (y - (y1 + t * dy)) ** 2 <= radius ** 2) return true;
  }
  return false;
}

// ------------------------------------------------------------- PNG encoding

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0; // filter type: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0))
  ]);
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

main();
