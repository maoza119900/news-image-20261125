// news-image-20261125: a newspaper front page for Wednesday 25 November 2026,
// drawn entirely in code (Node 22, standard library only) and written as a PNG.
// No network, no fonts, no clock, no randomness: two runs write identical bytes.
//
// Run:  mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

// ---------------------------------------------------------------------------
// PNG encoder (CRC32 + zlib deflate, filter 0 on every scanline)
// ---------------------------------------------------------------------------

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

function encodePng(w: number, h: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    const row = y * (1 + w * 3);
    raw[row] = 0; // filter: none
    Buffer.from(rgb.buffer, rgb.byteOffset + y * w * 3, w * 3).copy(raw, row + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Framebuffer and drawing primitives
// ---------------------------------------------------------------------------

const W = 1024;
const H = 1024;

type RGB = [number, number, number];
const PAPER: RGB = [251, 250, 243];
const INK: RGB = [17, 17, 17];
const RED: RGB = [158, 27, 27];
const NAVY: RGB = [16, 32, 64];
const SKY: RGB = [58, 96, 150];
const EARTH: RGB = [38, 84, 138];
const CLOUD: RGB = [210, 226, 240];
const FLAME: RGB = [232, 120, 40];
const GREY: RGB = [96, 94, 86];
const WHITE: RGB = [255, 255, 255];
const GOLD: RGB = [198, 148, 40];

class Canvas {
  readonly w = W;
  readonly h = H;
  readonly px = new Uint8Array(W * H * 3);

  constructor() {
    for (let i = 0; i < W * H; i++) {
      this.px[i * 3] = PAPER[0];
      this.px[i * 3 + 1] = PAPER[1];
      this.px[i * 3 + 2] = PAPER[2];
    }
  }

  set(x: number, y: number, c: RGB): void {
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    const i = (y * W + x) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }

  fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
    const x0 = Math.max(0, x);
    const y0 = Math.max(0, y);
    const x1 = Math.min(W, x + w);
    const y1 = Math.min(H, y + h);
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * W + xx) * 3;
        this.px[i] = c[0];
        this.px[i + 1] = c[1];
        this.px[i + 2] = c[2];
      }
    }
  }

  hline(x: number, y: number, w: number, c: RGB): void {
    this.fillRect(x, y, w, 1, c);
  }

  vline(x: number, y: number, h: number, c: RGB): void {
    this.fillRect(x, y, 1, h, c);
  }

  rect(x: number, y: number, w: number, h: number, c: RGB): void {
    this.hline(x, y, w, c);
    this.hline(x, y + h - 1, w, c);
    this.vline(x, y, h, c);
    this.vline(x + w - 1, y, h, c);
  }

  line(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    const dx = Math.abs(x1 - x0);
    const dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    let x = x0;
    let y = y0;
    for (;;) {
      this.set(x, y, c);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) {
        err += dy;
        x += sx;
      }
      if (e2 <= dx) {
        err += dx;
        y += sy;
      }
    }
  }

  // Filled circle, clipped to the given box (used for the Earth arc inside
  // the lead picture panel so it never paints over the stories below).
  fillCircleClip(cx: number, cy: number, r: number, c: RGB, clip: [number, number, number, number]): void {
    const [cx0, cy0, cx1, cy1] = clip;
    for (let y = Math.max(cy0, cy - r); y <= Math.min(cy1 - 1, cy + r); y++) {
      const dy = y - cy;
      const dx = Math.floor(Math.sqrt(r * r - dy * dy));
      const x0 = Math.max(cx0, cx - dx);
      const x1 = Math.min(cx1 - 1, cx + dx);
      for (let x = x0; x <= x1; x++) this.set(x, y, c);
    }
  }

  fillCircle(cx: number, cy: number, r: number, c: RGB): void {
    this.fillCircleClip(cx, cy, r, c, [0, 0, W, H]);
  }

  // Filled triangle (scanline fill between the three edges).
  fillTriangle(x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, c: RGB): void {
    const minY = Math.min(y0, y1, y2);
    const maxY = Math.max(y0, y1, y2);
    for (let y = minY; y <= maxY; y++) {
      const xs: number[] = [];
      const edges: Array<[number, number, number, number]> = [
        [x0, y0, x1, y1],
        [x1, y1, x2, y2],
        [x2, y2, x0, y0],
      ];
      for (const [ax, ay, bx, by] of edges) {
        if ((ay <= y && by > y) || (by <= y && ay > y)) {
          xs.push(ax + ((y - ay) * (bx - ax)) / (by - ay));
        }
      }
      if (xs.length >= 2) {
        const xa = Math.floor(Math.min(...xs));
        const xb = Math.ceil(Math.max(...xs));
        for (let x = xa; x <= xb; x++) this.set(x, y, c);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5x7 bitmap font. Each glyph is 7 rows; each row is a 5-bit number, bit 4 is
// the leftmost pixel. Only upper-case ASCII and common punctuation: the text
// is sanitised to this set before drawing.
// ---------------------------------------------------------------------------

const FONT: Record<string, number[]> = {
  A: [14, 17, 17, 31, 17, 17, 17],
  B: [30, 17, 17, 30, 17, 17, 30],
  C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30],
  E: [31, 16, 16, 30, 16, 16, 31],
  F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15],
  H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12],
  K: [17, 18, 20, 24, 20, 18, 17],
  L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17],
  N: [17, 25, 21, 19, 17, 17, 17],
  O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13],
  R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30],
  T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4],
  W: [17, 17, 17, 21, 21, 21, 10],
  X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 10, 4, 4, 4, 4],
  Z: [31, 1, 2, 4, 8, 16, 31],
  '0': [14, 17, 19, 21, 25, 17, 14],
  '1': [4, 12, 4, 4, 4, 4, 14],
  '2': [14, 17, 1, 6, 8, 16, 31],
  '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2],
  '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14],
  '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8],
  ':': [0, 12, 12, 0, 12, 12, 0],
  ';': [0, 12, 12, 0, 12, 4, 8],
  "'": [4, 4, 8, 0, 0, 0, 0],
  '!': [4, 4, 4, 4, 4, 0, 4],
  '?': [14, 17, 1, 6, 4, 0, 4],
  '-': [0, 0, 0, 31, 0, 0, 0],
  '/': [1, 1, 2, 4, 8, 16, 16],
  '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8],
  '%': [24, 25, 2, 4, 8, 19, 3],
  $: [4, 15, 20, 14, 5, 30, 4],
  '&': [12, 18, 20, 8, 21, 18, 13],
  '+': [0, 4, 4, 31, 4, 4, 0],
  '=': [0, 0, 31, 0, 31, 0, 0],
  '"': [10, 10, 10, 0, 0, 0, 0],
  '#': [10, 10, 31, 10, 31, 10, 10],
  '*': [0, 4, 21, 14, 21, 4, 0],
  '@': [14, 17, 23, 21, 23, 16, 14],
  _: [0, 0, 0, 0, 0, 0, 31],
  '[': [14, 8, 8, 8, 8, 8, 14],
  ']': [14, 2, 2, 2, 2, 2, 14],
};

function sanitise(s: string): string {
  return s
    .toUpperCase()
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, '-')
    .replace(/…/g, '...')
    .split('')
    .map((ch) => (FONT[ch] ? ch : '?'))
    .join('');
}

function textWidth(s: string, scale: number): number {
  const t = sanitise(s);
  return t.length === 0 ? 0 : t.length * 6 * scale - scale;
}

function drawText(cv: Canvas, x: number, y: number, s: string, scale: number, c: RGB): void {
  const t = sanitise(s);
  let cx = x;
  for (const ch of t) {
    const glyph = FONT[ch];
    for (let row = 0; row < 7; row++) {
      const bits = glyph[row];
      for (let col = 0; col < 5; col++) {
        if (bits & (1 << (4 - col))) {
          cv.fillRect(cx + col * scale, y + row * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawTextCentred(cv: Canvas, cx: number, y: number, s: string, scale: number, c: RGB): void {
  drawText(cv, cx - Math.floor(textWidth(s, scale) / 2), y, s, scale, c);
}

// Greedy word wrap to a pixel width; returns the lines.
function wrap(s: string, maxWidth: number, scale: number): string[] {
  const words = sanitise(s).split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur === '' ? w : cur + ' ' + w;
    if (textWidth(trial, scale) <= maxWidth || cur === '') {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur !== '') lines.push(cur);
  return lines;
}

// Draws a wrapped block; returns the y just below the last line.
function drawBlock(cv: Canvas, x: number, y: number, s: string, scale: number, c: RGB, maxWidth: number, linePitch: number): number {
  const lines = wrap(s, maxWidth, scale);
  for (let i = 0; i < lines.length; i++) {
    drawText(cv, x, y + i * linePitch, lines[i], scale, c);
  }
  return y + lines.length * linePitch;
}

// ---------------------------------------------------------------------------
// Lead picture: night sky, rocket, Earth arc, space station
// ---------------------------------------------------------------------------

function drawLeadPicture(cv: Canvas, x: number, y: number, w: number, h: number): void {
  cv.fillRect(x, y, w, h, NAVY);
  // Stars (fixed positions, deterministic).
  const stars: Array<[number, number, number]> = [
    [18, 26, 2], [52, 66, 3], [96, 18, 2], [140, 52, 3], [188, 30, 2],
    [228, 78, 2], [268, 22, 3], [302, 58, 2], [40, 108, 2], [120, 128, 2],
    [210, 118, 3], [282, 108, 2], [160, 88, 2], [72, 150, 2], [250, 150, 2],
    [310, 140, 2], [20, 180, 2], [300, 190, 2],
  ];
  for (const [sx, sy, s] of stars) cv.fillRect(x + sx, y + sy, s, s, WHITE);
  // Earth arc along the bottom of the panel.
  cv.fillCircleClip(x + Math.floor(w / 2), y + h + 150, 230, EARTH, [x, y, x + w, y + h]);
  cv.fillCircleClip(x + Math.floor(w / 2), y + h + 150, 230, EARTH, [x, y, x + w, y + h]);
  // Clouds on the arc.
  cv.fillRect(x + 40, y + h - 34, 90, 8, CLOUD);
  cv.fillRect(x + 200, y + h - 22, 70, 7, CLOUD);
  // Space station, top right: body plus two solar panels.
  cv.fillRect(x + 252, y + 96, 34, 10, WHITE);
  cv.fillRect(x + 226, y + 99, 24, 4, SKY);
  cv.fillRect(x + 288, y + 99, 24, 4, SKY);
  // Rocket, centre: flame, fins, body, nose, window.
  const cx = x + 118;
  cv.fillTriangle(cx - 12, y + 168, cx + 12, y + 168, cx, y + 206, FLAME);
  cv.fillTriangle(cx - 26, y + 128, cx - 10, y + 128, cx - 10, y + 168, WHITE);
  cv.fillTriangle(cx + 10, y + 128, cx + 26, y + 128, cx + 10, y + 168, WHITE);
  cv.fillRect(cx - 10, y + 78, 20, 92, WHITE);
  cv.fillTriangle(cx - 10, y + 78, cx + 10, y + 78, cx, y + 46, RED);
  cv.fillCircle(cx, y + 104, 6, SKY);
  cv.fillRect(cx - 10, y + 138, 20, 4, RED);
  // Caption.
  drawTextCentred(cv, x + Math.floor(w / 2), y + 12, 'SHENZHOU-24 LIFTS OFF', 2, WHITE);
}

// ---------------------------------------------------------------------------
// Page layout: newspaper front page, 1024 x 1024
// ---------------------------------------------------------------------------

const M = 36; // margin
const CW = W - 2 * M; // 952 content width
const COLW = 464; // story column width
const COL2X = 524; // second column x

function kicker(cv: Canvas, x: number, y: number, s: string): void {
  drawText(cv, x, y, s, 2, RED);
}

function headline(cv: Canvas, x: number, y: number, s: string): number {
  return drawBlock(cv, x, y, s, 3, INK, COLW, 24);
}

function body(cv: Canvas, x: number, y: number, s: string): number {
  return drawBlock(cv, x, y, s, 2, INK, COLW, 16);
}

function story(cv: Canvas, x: number, y: number, kick: string, head: string, text: string): number {
  kicker(cv, x, y, kick);
  const hy = y + 16;
  const by = headline(cv, x, hy, head);
  return body(cv, x, by + 6, text);
}

function buildPage(): Canvas {
  const cv = new Canvas();

  // Masthead.
  drawTextCentred(cv, 512, 28, 'THE WORLD TODAY', 7, INK);
  drawTextCentred(cv, 512, 88, "ONE DAY - ONE PAGE - THE WORLD'S NEWS", 2, GREY);
  cv.fillRect(M, 112, CW, 3, INK);
  cv.fillRect(M, 118, CW, 1, INK);
  drawTextCentred(cv, 512, 128, 'WEDNESDAY, 25 NOVEMBER 2026', 3, RED);
  cv.fillRect(M, 158, CW, 1, INK);

  // ---- Lead story -------------------------------------------------------
  kicker(cv, M, 172, 'SPACE - CHINA');
  drawText(cv, M, 192, 'FIRST PAKISTANI', 6, INK);
  drawText(cv, M, 242, 'IN ORBIT', 6, INK);
  let ly = drawBlock(cv, M, 296, 'SHENZHOU-24 BLASTS OFF FROM JIUQUAN AT 08:18, CARRYING TANG HONGBO, WU YI AND MUHAMMAD ZEESHAN ALI TO THE TIANGONG STATION.', 2, INK, 600, 18);
  drawBlock(cv, M, ly + 10, 'ALI IS THE FIRST PAKISTANI IN ORBIT AND THE FIRST FOREIGN ASTRONAUT EVER TO VISIT TIANGONG. HE WILL SPEND ABOUT A WEEK ON BOARD, RUNNING EXPERIMENTS.', 2, INK, 600, 18);
  drawLeadPicture(cv, 660, 172, 328, 236);
  cv.fillRect(M, 428, CW, 1, INK);

  // ---- Middle band: two columns ----------------------------------------
  cv.vline(512, 436, 388, INK);

  // Column 1.
  let y1 = story(cv, M, 436, 'CYBER - USA', 'CIA AND ODNI HIT BY CYBER BREACH',
    'AN UNCLASSIFIED NETWORK FOR OPEN-SOURCE INTELLIGENCE WAS BREACHED, REPORTS SAY. THE ODNI SAID CLASSIFIED SYSTEMS WERE NOT HIT.');
  y1 = story(cv, M, y1 + 10, 'TECH - LAW', 'HUAWEI GUILTY ON 10 OF 12 COUNTS IN US TRIAL',
    'A US JURY FOUND HUAWEI GUILTY ON 10 OF 12 COUNTS, INCLUDING STEALING TRADE SECRETS. HUAWEI REJECTED THE VERDICTS.');
  y1 = story(cv, M, y1 + 10, 'TECH - MICROSOFT', "MICROSOFT DECLARES 'CODE RED' AFTER WORST OUTAGE",
    'MICROSOFT 365 WAS DOWN FOR NEARLY A DAY ON 12-13 NOV, ITS WORST OUTAGE YET.');

  // Column 2.
  let y2 = story(cv, COL2X, 436, 'MIDDLE EAST - RIYADH', "DRONE HITS RIYADH'S TALLEST TOWER, 11 WOUNDED",
    'HOUTHIS STRUCK THE TALLEST TOWER IN RIYADH ON TUESDAY, THE SECOND HIT IN UNDER A WEEK. 11 PEOPLE WERE WOUNDED.');
  y2 = story(cv, COL2X, y2 + 10, 'WAR - UKRAINE', 'KYIV CONFIRMS SHIP STRIKE IN THE BALTIC',
    'ZELENSKIY SAID UKRAINE HIT A RUSSIAN CARGO SHIP IN THE GULF OF FINLAND. NORWAY URGED CAUTION.');
  // The day in numbers.
  const boxY = y2 + 14;
  const boxH = 824 - boxY;
  cv.rect(COL2X, boxY, COLW, boxH, INK);
  drawText(cv, COL2X + 12, boxY + 10, 'THE DAY IN NUMBERS', 2, RED);
  drawText(cv, COL2X + 12, boxY + 36, '115BN EUROS - UKRAINE AID ASK, 2027', 2, INK);
  drawText(cv, COL2X + 12, boxY + 58, '11 WOUNDED IN RIYADH TOWER STRIKE', 2, INK);
  drawText(cv, COL2X + 12, boxY + 80, '10 OF 12 COUNTS: HUAWEI FOUND GUILTY', 2, INK);
  drawText(cv, COL2X + 12, boxY + 102, '5-10 DAYS: ALI ON BOARD TIANGONG', 2, INK);
  void y1;
  void y2;

  // ---- In brief ---------------------------------------------------------
  cv.fillRect(M, 832, CW, 1, INK);
  drawText(cv, M, 842, 'IN BRIEF', 2, RED);
  const briefs = [
    'GAZA: ISRAELI STRIKE KILLS NAEEM ABU NAHEL, HEAD OF HAMAS INTERNAL SECURITY.',
    'UKRAINE: ZELENSKIY SAYS KYIV NEEDS 115BN EUROS IN FOREIGN AID FOR 2027.',
    'FRANCE: SARKOZY CORRUPTION CASE ORDERED TO TRIAL; FIRST HEARING 1 APRIL 2027.',
    'DR CONGO: WHO EVACUATES STAFF FROM EBOLA-ZONE HOSPITAL AFTER FIGHTING.',
    'MARKETS: NASDAQ FELL 1.5% ON TUESDAY AS US TARIFF REPORT HIT AI STOCKS.',
  ];
  for (let i = 0; i < briefs.length; i++) {
    drawText(cv, M, 866 + i * 20, briefs[i], 2, INK);
  }

  // ---- Footer -----------------------------------------------------------
  cv.fillRect(M, 970, CW, 1, INK);
  drawTextCentred(cv, 512, 980, 'SOURCES: REUTERS, XINHUA, AP, CNN, AFP, THE HINDU', 2, GREY);
  return cv;
}

function main(): void {
  const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
  mkdirSync(outDir, { recursive: true });
  const cv = buildPage();
  const png = encodePng(W, H, cv.px);
  writeFileSync(join(outDir, 'entry.png'), png);
}

main();
