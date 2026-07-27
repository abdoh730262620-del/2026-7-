const fs = require('fs');

try {
  const capConfig = fs.readFileSync('capacitor.config.ts', 'utf8');
  const match = capConfig.match(/appName:\s*['"]([^'"]+)['"]/);
  const appName = (match && match[1]) ? match[1].trim() : 'نظام المبيعات';
  console.log('Extracted App Name:', appName);

  fs.writeFileSync('app_name.txt', appName, 'utf8');

  const stringsPath = 'android/app/src/main/res/values/strings.xml';
  if (fs.existsSync(stringsPath)) {
    let stringsXml = fs.readFileSync(stringsPath, 'utf8');
    stringsXml = stringsXml.replace(/<string name="app_name">.*?<\/string>/, `<string name="app_name">${appName}</string>`);
    stringsXml = stringsXml.replace(/<string name="title_activity_main">.*?<\/string>/, `<string name="title_activity_main">${appName}</string>`);
    fs.writeFileSync(stringsPath, stringsXml, 'utf8');
    console.log('Updated Android strings.xml with app name:', appName);
  } else {
    console.log('strings.xml not found, skipping XML update');
  }
} catch (err) {
  console.error('Error configuring app name:', err);
  fs.writeFileSync('app_name.txt', 'نظام المبيعات', 'utf8');
}
