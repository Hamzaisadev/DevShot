const sharp = require('sharp');
const path = require('path');

const sizes = [16, 32, 48, 128];
const svgPath = path.join(__dirname, 'icon.svg');

async function generateIcons() {
  for (const size of sizes) {
    const outputPath = path.join(__dirname, `icon-${size}.png`);
    await sharp(svgPath)
      .resize(size, size)
      .png()
      .toFile(outputPath);
    console.log(`Generated: icon-${size}.png`);
  }
  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
