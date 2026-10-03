import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import QRCode from 'qrcode';
import { FAKE_CAMERA_VIDEO } from './playwright.config.js';

// Genera el video que Chrome usa como cámara simulada (--use-file-for-fake-video-capture):
// 2 s de un QR fijo con el número de la tarjeta demo, en formato Y4M (YUV 4:2:0 sin comprimir).
export default function globalSetup() {
  if (existsSync(FAKE_CAMERA_VIDEO)) return;
  mkdirSync(dirname(FAKE_CAMERA_VIDEO), { recursive: true });
  writeFileSync(FAKE_CAMERA_VIDEO, qrVideo('DEMO-0001'));
}

function qrVideo(text: string) {
  const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
  const W = 640;
  const H = 480;
  const n = qr.modules.size;
  const scale = Math.floor(320 / (n + 8)); // QR + margen de 4 módulos por lado
  const ox = Math.floor((W - (n + 8) * scale) / 2);
  const oy = Math.floor((H - (n + 8) * scale) / 2);

  const luma = Buffer.alloc(W * H, 235); // fondo claro
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!qr.modules.get(r, c)) continue;
      for (let y = 0; y < scale; y++) {
        const row = (oy + (r + 4) * scale + y) * W;
        luma.fill(16, row + ox + (c + 4) * scale, row + ox + (c + 5) * scale);
      }
    }
  }
  const chroma = Buffer.alloc((W / 2) * (H / 2) * 2, 128); // sin color

  const frames: Buffer[] = [Buffer.from(`YUV4MPEG2 W${W} H${H} F15:1 Ip A1:1 C420jpeg\n`)];
  for (let i = 0; i < 30; i++) frames.push(Buffer.from('FRAME\n'), luma, chroma);
  return Buffer.concat(frames);
}
