import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Create a professional sales/POS app icon SVG
const iconSvg = `
<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg">
  <!-- Background with rounded corners and rich gradient -->
  <rect width="512" height="512" rx="120" fill="url(#bg_gradient)"/>
  
  <defs>
    <linearGradient id="bg_gradient" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#0f172a"/>
      <stop offset="50%" stop-color="#1e1b4b"/>
      <stop offset="100%" stop-color="#312e81"/>
    </linearGradient>
    <linearGradient id="card_grad" x1="0" y1="0" x2="280" y2="180" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#38bdf8"/>
      <stop offset="100%" stop-color="#818cf8"/>
    </linearGradient>
    <linearGradient id="accent_grad" x1="0" y1="0" x2="300" y2="300" gradientUnits="userSpaceOnUse">
      <stop offset="0%" stop-color="#fbbf24"/>
      <stop offset="100%" stop-color="#f59e0b"/>
    </linearGradient>
    <filter id="shadow" x="-10%" y="-10%" width="130%" height="130%">
      <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000000" flood-opacity="0.4"/>
    </filter>
  </defs>

  <!-- Glowing background ring -->
  <circle cx="256" cy="256" r="190" stroke="#38bdf8" stroke-opacity="0.15" stroke-width="8"/>
  <circle cx="256" cy="256" r="160" stroke="#818cf8" stroke-opacity="0.25" stroke-width="4" stroke-dasharray="12 12"/>

  <!-- Shopping Cart / Cashier Card Vector Motif -->
  <g filter="url(#shadow)">
    <!-- Credit/Network Card floating at angle -->
    <rect x="116" y="140" width="280" height="170" rx="24" fill="url(#card_grad)"/>
    <!-- Card Chip -->
    <rect x="150" y="180" width="46" height="36" rx="8" fill="#fef08a" stroke="#d97706" stroke-width="2"/>
    <line x1="150" y1="198" x2="196" y2="198" stroke="#d97706" stroke-width="1.5"/>
    <line x1="173" y1="180" x2="173" y2="216" stroke="#d97706" stroke-width="1.5"/>
    
    <!-- Signal/Wifi Icon on card -->
    <path d="M330 190 A16 16 0 0 1 352 212" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
    <path d="M338 198 A8 8 0 0 1 348 208" stroke="#ffffff" stroke-width="4" stroke-linecap="round"/>
    <circle cx="344" cy="214" r="3" fill="#ffffff"/>

    <!-- Shopping Cart Front overlay -->
    <path d="M140 370 H350 L380 260 H170 L140 370 Z" fill="#ffffff" fill-opacity="0.95"/>
    <path d="M120 230 L150 260 H380 L400 230" stroke="url(#accent_grad)" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
    
    <!-- Cart wheels -->
    <circle cx="180" cy="395" r="22" fill="url(#accent_grad)"/>
    <circle cx="180" cy="395" r="8" fill="#ffffff"/>
    <circle cx="320" cy="395" r="22" fill="url(#accent_grad)"/>
    <circle cx="320" cy="395" r="8" fill="#ffffff"/>

    <!-- Checkmark Badge in top corner -->
    <circle cx="370" cy="140" r="32" fill="url(#accent_grad)"/>
    <path d="M356 140 L366 150 L386 130" stroke="#ffffff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
  </g>
</svg>
`;

async function generateAllIcons() {
    try {
        console.log('Generating crisp 512x512 PNG master icon...');
        const masterBuffer = await sharp(Buffer.from(iconSvg))
            .resize(512, 512)
            .png({ quality: 100 })
            .toBuffer();

        // 1. Save Public PWA and Assets icons
        await fs.promises.mkdir('./public', { recursive: true });
        await sharp(masterBuffer).toFile('./public/icon.png');
        await sharp(masterBuffer).resize(64, 64).toFile('./public/favicon.png');

        await fs.promises.mkdir('./assets', { recursive: true });
        await sharp(masterBuffer).toFile('./assets/icon.png');
        await sharp(masterBuffer).toFile('./assets/icon-only.png');

        // Splash screen image
        const darkBg = { r: 15, g: 23, b: 42, alpha: 1 };
        const splashBuffer = await sharp({
            create: { width: 1080, height: 1920, channels: 4, background: darkBg }
        })
        .composite([{ input: await sharp(masterBuffer).resize(360, 360).toBuffer(), gravity: 'center' }])
        .png()
        .toBuffer();

        await sharp(splashBuffer).toFile('./assets/splash.png');
        await sharp(splashBuffer).toFile('./assets/splash-dark.png');

        // 2. Android Mipmaps
        const mipmaps = [
            { folder: 'mipmap-ldpi', size: 36, fgSize: 81 },
            { folder: 'mipmap-mdpi', size: 48, fgSize: 108 },
            { folder: 'mipmap-hdpi', size: 72, fgSize: 162 },
            { folder: 'mipmap-xhdpi', size: 96, fgSize: 216 },
            { folder: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
            { folder: 'mipmap-xxxhdpi', size: 192, fgSize: 432 }
        ];

        for (const mip of mipmaps) {
            const dirPath = `./android/app/src/main/res/${mip.folder}`;
            await fs.promises.mkdir(dirPath, { recursive: true });

            // Standard Launcher Icon
            await sharp(masterBuffer)
                .resize(mip.size, mip.size)
                .toFile(path.join(dirPath, 'ic_launcher.png'));

            // Round Launcher Icon
            const circleMask = Buffer.from(
                `<svg width="${mip.size}" height="${mip.size}">
                    <circle cx="${mip.size / 2}" cy="${mip.size / 2}" r="${mip.size / 2}" fill="#fff"/>
                </svg>`
            );
            await sharp(masterBuffer)
                .resize(mip.size, mip.size)
                .composite([{ input: circleMask, blend: 'dest-in' }])
                .toFile(path.join(dirPath, 'ic_launcher_round.png'));

            // Foreground Icon (centered in safe zone)
            const fgSubSize = Math.round(mip.fgSize * 0.65);
            const fgLogo = await sharp(masterBuffer).resize(fgSubSize, fgSubSize).toBuffer();
            await sharp({
                create: {
                    width: mip.fgSize,
                    height: mip.fgSize,
                    channels: 4,
                    background: { r: 0, g: 0, b: 0, alpha: 0 }
                }
            })
            .composite([{ input: fgLogo, gravity: 'center' }])
            .toFile(path.join(dirPath, 'ic_launcher_foreground.png'));

            // Background PNG
            await sharp({
                create: {
                    width: mip.fgSize,
                    height: mip.fgSize,
                    channels: 4,
                    background: { r: 15, g: 23, b: 42, alpha: 1 }
                }
            })
            .toFile(path.join(dirPath, 'ic_launcher_background.png'));
        }

        // Colors XML
        const colorsXmlPath = './android/app/src/main/res/values/colors.xml';
        await fs.promises.mkdir(path.dirname(colorsXmlPath), { recursive: true });
        const colorsContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0F172A</color>
    <color name="colorPrimary">#0F172A</color>
    <color name="colorPrimaryDark">#090D16</color>
    <color name="colorAccent">#38BDF8</color>
</resources>`;
        await fs.promises.writeFile(colorsXmlPath, colorsContent);

        // Update Splash Screen drawables
        const resDir = './android/app/src/main/res';
        const drawables = (await fs.promises.readdir(resDir)).filter(d => d.startsWith('drawable'));
        for (const drawableFolder of drawables) {
            const folderPath = path.join(resDir, drawableFolder);
            const splashPath = path.join(folderPath, 'splash.png');
            if (fs.existsSync(splashPath)) {
                let targetW = 1080;
                let targetH = 1920;
                if (drawableFolder.includes('land')) {
                    targetW = 1920;
                    targetH = 1080;
                }
                const logoDim = Math.round(Math.min(targetW, targetH) * 0.35);
                const logoResized = await sharp(masterBuffer).resize(logoDim, logoDim).toBuffer();
                await sharp({
                    create: { width: targetW, height: targetH, channels: 4, background: darkBg }
                })
                .composite([{ input: logoResized, gravity: 'center' }])
                .toFile(splashPath);
            }
        }

        console.log('✅ Successfully generated all Android icons, mipmaps, and drawables!');
    } catch (err) {
        console.error('Error generating icons:', err);
    }
}

generateAllIcons();
