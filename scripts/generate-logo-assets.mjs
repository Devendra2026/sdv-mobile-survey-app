/**
 * Builds display assets from assets/images/logo.png:
 * - logo-display.png — trimmed padding for in-app use (auth hero, loaders)
 * - logo-icon.png — square 1024×1024 for app / adaptive icon
 *
 * Run: node scripts/generate-logo-assets.mjs
 * Requires: npm install --save-dev sharp
 */
import { mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'assets/images/logo.png');
const outDir = path.join(root, 'assets/images');

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('Install sharp first: npm install --save-dev sharp');
    process.exit(1);
  }

  await access(src);
  await mkdir(outDir, { recursive: true });

  const trimmed = await sharp(src).trim({ threshold: 12 }).png().toBuffer();
  const meta = await sharp(trimmed).metadata();

  await sharp(trimmed).png({ compressionLevel: 9 }).toFile(path.join(outDir, 'logo-display.png'));

  const side = Math.max(meta.width ?? 512, meta.height ?? 512);
  const iconPad = Math.round(side * 0.08);
  const iconSize = side + iconPad * 2;

  await sharp(trimmed)
    .resize({
      width: iconSize - iconPad * 2,
      height: iconSize - iconPad * 2,
      fit: 'inside',
      withoutEnlargement: false,
    })
    .extend({
      top: iconPad,
      bottom: iconPad,
      left: iconPad,
      right: iconPad,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    })
    .resize(1024, 1024, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
    .png()
    .toFile(path.join(outDir, 'logo-icon.png'));

  console.log('Wrote assets/images/logo-display.png and logo-icon.png');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
