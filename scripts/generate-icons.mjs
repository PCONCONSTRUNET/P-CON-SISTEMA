import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const src = path.join(__dirname, '../src/assets/logo-pcon-nova.png');
const publicDir = path.join(__dirname, '../public');
const assetsDir = path.join(__dirname, '../src/assets');

async function generate() {
  try {
    console.log('Generating pwa-192x192.png...');
    await sharp(src)
      .resize(192, 192, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFile(path.join(publicDir, 'pwa-192x192.png'));

    console.log('Generating pwa-512x512.png...');
    await sharp(src)
      .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFile(path.join(publicDir, 'pwa-512x512.png'));

    console.log('Generating favicon.ico (fallback to 32x32 png in public folder)...');
    await sharp(src)
      .resize(32, 32, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
      .toFile(path.join(publicDir, 'favicon.ico'));

    console.log('Generating apple-touch-icon.png...');
    await sharp(src)
      .resize(180, 180, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 1 } })
      .toFile(path.join(publicDir, 'apple-touch-icon.png'));

    // The user also wanted to add the new logo "na imagem ali do site".
    // I should generate a bigger logo version if needed, but they also have `<img src={logo} ...>` 
    // Wait, ClientLogin.tsx imports: `import logo from '@/assets/logo-pcon-pwa-large.png';`
    console.log('Generating logo-pcon-pwa-large.png...');
    await sharp(src)
      .resize(800) // just a large version
      .toFile(path.join(assetsDir, 'logo-pcon-pwa-large.png'));

    console.log('All icons generated successfully!');
  } catch (err) {
    console.error('Error generating icons:', err);
  }
}
generate();
