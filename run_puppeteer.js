import puppeteer from 'puppeteer';

(async () => {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
    page.on('requestfailed', request => {
      console.log('REQUEST FAILED:', request.url(), request.failure().errorText);
    });
    page.on('response', response => {
      if (!response.ok()) {
        console.log('RESPONSE FAILED:', response.url(), response.status());
      }
    });
    
    try {
        await page.goto('http://127.0.0.1:3000', { waitUntil: 'networkidle0' });
        console.log('Page loaded');
        
        await page.type('input[type="text"]', 'admin');
        await page.type('input[type="password"]', 'admin');
        await page.click('button[type="submit"]');
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        const content = await page.$eval('#root', el => el.innerHTML);
        console.log('Root HTML contains:', content.substring(0, 1500));
    } catch (e) {
        console.error('Error loading page:', e);
    }
    
    await browser.close();
})();
