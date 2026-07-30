import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sourceImage = './src/assets/images/app_launcher_icon_new_1785296330939.jpg';

async function processIcons() {
    try {
        if (!fs.existsSync(sourceImage)) {
            console.error(`Source image not found: ${sourceImage}`);
            return;
        }

        console.log('🚀 Step 1: Optimizing source launcher icon...');
        const sourceBuffer = await sharp(sourceImage)
            .resize(512, 512, { fit: 'cover' })
            .png({ quality: 85, compressionLevel: 9 })
            .toBuffer();

        await sharp(sourceBuffer).toFile(sourceImage);
        console.log('Optimized source image saved.');

        // Public PWA Icons
        await sharp(sourceBuffer).toFile('./public/icon.png');
        await sharp(sourceBuffer).resize(64, 64).toFile('./public/favicon.png');
        console.log('Updated PWA icons in ./public');

        // Root Assets folder optimization
        if (fs.existsSync('./assets')) {
            await sharp(sourceBuffer).toFile('./assets/icon.png');
            await sharp(sourceBuffer).toFile('./assets/icon-only.png');

            const darkBg = { r: 11, g: 19, b: 43, alpha: 1 };
            const splashBuffer = await sharp({
                create: {
                    width: 1080,
                    height: 1920,
                    channels: 4,
                    background: darkBg
                }
            })
            .composite([{
                input: await sharp(sourceBuffer).resize(360, 360).toBuffer(),
                gravity: 'center'
            }])
            .png({ quality: 75, compressionLevel: 9, palette: true })
            .toBuffer();

            await sharp(splashBuffer).toFile('./assets/splash.png');
            await sharp(splashBuffer).toFile('./assets/splash-dark.png');
            console.log('Optimized root assets/ folder (icon.png, splash.png)');
        }

        // Android Mipmaps (App Launcher Icons)
        const mipmaps = [
            { folder: 'mipmap-ldpi', size: 36, fgSize: 81 },
            { folder: 'mipmap-mdpi', size: 48, fgSize: 108 },
            { folder: 'mipmap-hdpi', size: 72, fgSize: 162 },
            { folder: 'mipmap-xhdpi', size: 96, fgSize: 216 },
            { folder: 'mipmap-xxhdpi', size: 144, fgSize: 324 },
            { folder: 'mipmap-xxxhdpi', size: 192, fgSize: 432 }
        ];

        console.log('Generating Android Mipmap Icons & Adaptive Icon Foreground...');
        for (const mip of mipmaps) {
            const dirPath = `./android/app/src/main/res/${mip.folder}`;
            if (fs.existsSync(dirPath)) {
                // Standard Launcher Icon
                await sharp(sourceBuffer)
                    .resize(mip.size, mip.size)
                    .png({ quality: 85, compressionLevel: 9 })
                    .toFile(path.join(dirPath, 'ic_launcher.png'));

                // Round Launcher Icon
                const circleMask = Buffer.from(
                    `<svg width="${mip.size}" height="${mip.size}">
                        <circle cx="${mip.size / 2}" cy="${mip.size / 2}" r="${mip.size / 2}" fill="#fff"/>
                    </svg>`
                );
                await sharp(sourceBuffer)
                    .resize(mip.size, mip.size)
                    .composite([{ input: circleMask, blend: 'dest-in' }])
                    .png({ quality: 85, compressionLevel: 9 })
                    .toFile(path.join(dirPath, 'ic_launcher_round.png'));

                // Adaptive Foreground Icon (Centered inside canvas with safe zone padding)
                const logoSubSize = Math.round(mip.fgSize * 0.65);
                const fgLogo = await sharp(sourceBuffer).resize(logoSubSize, logoSubSize).toBuffer();
                await sharp({
                    create: {
                        width: mip.fgSize,
                        height: mip.fgSize,
                        channels: 4,
                        background: { r: 0, g: 0, b: 0, alpha: 0 }
                    }
                })
                .composite([{ input: fgLogo, gravity: 'center' }])
                .png({ quality: 85, compressionLevel: 9 })
                .toFile(path.join(dirPath, 'ic_launcher_foreground.png'));

                // Background PNG (Solid Dark Blue)
                await sharp({
                    create: {
                        width: mip.fgSize,
                        height: mip.fgSize,
                        channels: 4,
                        background: { r: 11, g: 19, b: 43, alpha: 1 }
                    }
                })
                .png({ quality: 85, compressionLevel: 9 })
                .toFile(path.join(dirPath, 'ic_launcher_background.png'));

                console.log(`Updated icons in: ${dirPath}`);
            }
        }

        // Colors XML for Android Launcher Background
        const colorsXmlPath = './android/app/src/main/res/values/colors.xml';
        const colorsContent = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">#0B132B</color>
</resources>`;
        fs.writeFileSync(colorsXmlPath, colorsContent);

        // Optimize all Android Splash Screen Drawables (reduce 48MB to ~1MB)
        console.log('Replacing & Optimizing all Android Splash Screen Drawables...');
        const resDir = './android/app/src/main/res';
        const drawables = fs.readdirSync(resDir).filter(d => d.startsWith('drawable'));
        
        for (const drawableFolder of drawables) {
            const folderPath = path.join(resDir, drawableFolder);
            if (!fs.statSync(folderPath).isDirectory()) continue;
            
            const files = fs.readdirSync(folderPath);
            for (const file of files) {
                if (file === 'splash.png') {
                    const filePath = path.join(folderPath, file);
                    let targetW = 1080;
                    let targetH = 1920;
                    if (drawableFolder.includes('land')) {
                        targetW = 1920;
                        targetH = 1080;
                    }
                    if (drawableFolder.includes('ldpi')) {
                        targetW = Math.round(targetW * 0.25);
                        targetH = Math.round(targetH * 0.25);
                    } else if (drawableFolder.includes('mdpi')) {
                        targetW = Math.round(targetW * 0.35);
                        targetH = Math.round(targetH * 0.35);
                    } else if (drawableFolder.includes('hdpi')) {
                        targetW = Math.round(targetW * 0.5);
                        targetH = Math.round(targetH * 0.5);
                    } else if (drawableFolder.includes('xhdpi')) {
                        targetW = Math.round(targetW * 0.7);
                        targetH = Math.round(targetH * 0.7);
                    }

                    const darkBg = { r: 11, g: 19, b: 43, alpha: 1 };
                    const logoDimension = Math.round(Math.min(targetW, targetH) * 0.35);
                    const resizedLogo = await sharp(sourceBuffer).resize(logoDimension, logoDimension).toBuffer();

                    const freshSplash = await sharp({
                        create: {
                            width: targetW,
                            height: targetH,
                            channels: 4,
                            background: darkBg
                        }
                    })
                    .composite([{ input: resizedLogo, gravity: 'center' }])
                    .png({ quality: 75, compressionLevel: 9, palette: true })
                    .toBuffer();

                    fs.writeFileSync(filePath, freshSplash);
                    console.log(`Updated splash in ${drawableFolder}: ${targetW}x${targetH} (${(freshSplash.length/1024).toFixed(0)}KB)`);
                }
            }
        }

        console.log('✅ Optimization & Icon generation completed successfully!');
    } catch (error) {
        console.error('Error in optimization script:', error);
    }
}

processIcons();
