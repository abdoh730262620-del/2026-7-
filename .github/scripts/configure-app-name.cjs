const fs = require('fs');

try {
  const capConfig = fs.readFileSync('capacitor.config.ts', 'utf8');
  const appNameMatch = capConfig.match(/appName:\s*['"]([^'"]+)['"]/);
  const appName = (appNameMatch && appNameMatch[1]) ? appNameMatch[1].trim() : 'نظام المبيعات';

  const appIdMatch = capConfig.match(/appId:\s*['"]([^'"]+)['"]/);
  const appId = (appIdMatch && appIdMatch[1]) ? appIdMatch[1].trim() : 'rashed.app.sala';

  console.log('Extracted App Name:', appName);
  console.log('Extracted App ID:', appId);

  fs.writeFileSync('app_name.txt', appName, 'utf8');

  const stringsPath = 'android/app/src/main/res/values/strings.xml';
  if (fs.existsSync(stringsPath)) {
    let stringsXml = fs.readFileSync(stringsPath, 'utf8');
    stringsXml = stringsXml.replace(/<string name="app_name">.*?<\/string>/, `<string name="app_name">${appName}</string>`);
    stringsXml = stringsXml.replace(/<string name="title_activity_main">.*?<\/string>/, `<string name="title_activity_main">${appName}</string>`);
    stringsXml = stringsXml.replace(/<string name="package_name">.*?<\/string>/, `<string name="package_name">${appId}</string>`);
    stringsXml = stringsXml.replace(/<string name="custom_url_scheme">.*?<\/string>/, `<string name="custom_url_scheme">${appId}</string>`);
    fs.writeFileSync(stringsPath, stringsXml, 'utf8');
    console.log('Updated Android strings.xml with app name & appId:', appName, appId);
  } else {
    console.log('strings.xml not found, skipping XML update');
  }
} catch (err) {
  console.error('Error configuring app name:', err);
  fs.writeFileSync('app_name.txt', 'نظام المبيعات', 'utf8');
}
