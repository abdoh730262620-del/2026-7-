const fs = require('fs');
const path = require('path');

try {
  let appName = 'نظام المبيعات';
  if (fs.existsSync('app_name.txt')) {
    const content = fs.readFileSync('app_name.txt', 'utf8').trim();
    if (content) appName = content;
  }

  const safeAppName = appName.replace(/[\s\/\\?%*:|"<>]+/g, '_');
  const apkDir = 'android/app/build/outputs/apk/debug';
  const srcApk = path.join(apkDir, 'app-debug.apk');
  const destApk = path.join(apkDir, `${safeAppName}.apk`);

  if (fs.existsSync(srcApk)) {
    fs.renameSync(srcApk, destApk);
    console.log('Successfully renamed APK to single Arabic file:', destApk);
  } else {
    console.error('Source app-debug.apk was not found at:', srcApk);
    process.exit(1);
  }
} catch (err) {
  console.error('Error preparing APK:', err);
  process.exit(1);
}
