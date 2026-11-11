import sharp from 'sharp';
for (const size of [192, 512])
  await sharp('apps/web/public/icon.svg')
    .resize(size, size)
    .png()
    .toFile(`apps/web/public/icon-${size}.png`);
await sharp('apps/web/public/icon.svg')
  .resize(320, 320)
  .extend({ top: 96, bottom: 96, left: 96, right: 96, background: '#440031' })
  .png()
  .toFile('apps/web/public/icon-maskable.png');
