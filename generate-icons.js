import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

const sourceImage = './src/assets/images/app_launcher_icon_new_1785296330939.jpg';

async function generateAllIcons() {
    try {
        if (!fs.existsSync(sourceImage)) {
            console.error(`Source image not found: ${sourceImage}`);
            return;
        }

        console.log('Generating PWA Icons...');
        // Public PWA icon (512x512)
        await sharp(sourceImage)
            .resize(512, 512)
            .png()
            .toFile('./public/icon.png');
        console.log('Generated: ./public/icon.png');

        // Android Mipmap definitions
        const mipmaps = [
            { folder: 'mipmap-ldpi', size: 36 },
            { folder: 'mipmap-mdpi', size: 48 },
            { folder: 'mipmap-hdpi', size: 72 },
            { folder: 'mipmap-xhdpi', size: 96 },
            { folder: 'mipmap-xxhdpi', size: 144 },
            { folder: 'mipmap-xxxhdpi', size: 192 }
        ];

        console.log('Generating Android Mipmap Icons...');
        for (const mip of mipmaps) {
            const dirPath = `./android/app/src/main/res/${mip.folder}`;
            if (fs.existsSync(dirPath)) {
                // Generate standard icon
                await sharp(sourceImage)
                    .resize(mip.size, mip.size)
                    .png()
                    .toFile(path.join(dirPath, 'ic_launcher.png'));

                // Generate round icon
                await sharp(sourceImage)
                    .resize(mip.size, mip.size)
                    .png()
                    .toFile(path.join(dirPath, 'ic_launcher_round.png'));

                // Generate adaptive foreground icon
                await sharp(sourceImage)
                    .resize(mip.size, mip.size)
                    .png()
                    .toFile(path.join(dirPath, 'ic_launcher_foreground.png'));

                console.log(`Updated icons in: ${dirPath} (${mip.size}x${mip.size})`);
            } else {
                console.warn(`Android resource directory not found: ${dirPath}`);
            }
        }

        console.log('✨ All launcher icons successfully generated and applied!');
    } catch (error) {
        console.error('Error generating icons:', error);
    }
}

generateAllIcons();
