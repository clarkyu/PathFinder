/**
 * 生成 PWA 图标（零依赖：用 Node 内置 zlib 手写 PNG 编码）
 * 用法：node tools/gen-icons.mjs
 * 产物：icons/icon-192.png icon-512.png maskable-512.png apple-touch-icon.png
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

/* ---------- PNG 编码 ---------- */
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const t = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
}
function encodePng(width, height, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type RGBA
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    sig,
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/* ---------- 绘制：渐变底 + 罗盘环 + 东北向指针 ---------- */
const C1 = [20, 80, 163];   // #1450A3
const C2 = [25, 167, 206];  // #19A7CE
const lerp = (a, b, t) => a + (b - a) * t;

function inTriangle(px, py, [ax, ay], [bx, by], [cx, cy]) {
  const s1 = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
  const s2 = (cx - bx) * (py - by) - (cy - by) * (px - bx);
  const s3 = (ax - cx) * (py - cy) - (ay - cy) * (px - cx);
  return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
}

function draw(size, { rounded, scale }) {
  const k = scale;
  const cx = size / 2, cy = size / 2;
  const cornerR = rounded ? size * 0.225 : 0;
  const ringR = size * 0.335 * k;
  const ringW = size * 0.052 * k;
  const needleL = size * 0.27 * k;
  const needleW = size * 0.085 * k;
  const dotR = size * 0.05 * k;
  const dir = [Math.SQRT1_2, -Math.SQRT1_2];            // 东北方向
  const perp = [Math.SQRT1_2, Math.SQRT1_2];
  const tipNE = [cx + dir[0] * needleL, cy + dir[1] * needleL];
  const tipSW = [cx - dir[0] * needleL, cy - dir[1] * needleL];
  const pA = [cx + perp[0] * needleW, cy + perp[1] * needleW];
  const pB = [cx - perp[0] * needleW, cy - perp[1] * needleW];

  const SS = 3; // 3x3 超采样抗锯齿
  const rgba = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const px = x + (sx + 0.5) / SS;
          const py = y + (sy + 0.5) / SS;

          // 圆角矩形裁剪
          let inside = true;
          if (cornerR > 0) {
            const qx = Math.max(Math.abs(px - cx) - (size / 2 - cornerR), 0);
            const qy = Math.max(Math.abs(py - cy) - (size / 2 - cornerR), 0);
            inside = qx * qx + qy * qy <= cornerR * cornerR;
          }
          if (!inside) continue;

          // 渐变底色（左上 → 右下）
          const t = (px + py) / (2 * size);
          let pr = lerp(C1[0], C2[0], t);
          let pg = lerp(C1[1], C2[1], t);
          let pb = lerp(C1[2], C2[2], t);

          const dx = px - cx, dy = py - cy;
          const dist = Math.hypot(dx, dy);

          // 罗盘外环
          if (Math.abs(dist - ringR) <= ringW / 2) {
            pr = pg = pb = 255;
          }
          // 指针：东北半（纯白）+ 西南半（半透明白叠加）
          if (inTriangle(px, py, tipNE, pA, pB)) {
            pr = pg = pb = 255;
          } else if (inTriangle(px, py, tipSW, pA, pB)) {
            pr = lerp(pr, 255, 0.55);
            pg = lerp(pg, 255, 0.55);
            pb = lerp(pb, 255, 0.55);
          }
          // 中心轴点
          if (dist <= dotR) pr = pg = pb = 255;

          r += pr; g += pg; b += pb; a += 255;
        }
      }
      const n = SS * SS;
      const o = (y * size + x) * 4;
      rgba[o] = Math.round(r / n);
      rgba[o + 1] = Math.round(g / n);
      rgba[o + 2] = Math.round(b / n);
      rgba[o + 3] = Math.round(a / n);
    }
  }
  return encodePng(size, size, rgba);
}

mkdirSync(join(ROOT, "icons"), { recursive: true });
const jobs = [
  ["icon-192.png", 192, { rounded: true, scale: 1 }],
  ["icon-512.png", 512, { rounded: true, scale: 1 }],
  ["maskable-512.png", 512, { rounded: false, scale: 0.78 }],
  ["apple-touch-icon.png", 180, { rounded: false, scale: 1 }],
];
for (const [name, size, opt] of jobs) {
  const buf = draw(size, opt);
  writeFileSync(join(ROOT, "icons", name), buf);
  console.log("✓ icons/" + name, size + "x" + size, (buf.length / 1024).toFixed(1) + " KB");
}
