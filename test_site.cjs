const puppeteer = require('puppeteer');

(async () => {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.toString()));
    page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

    console.log('Navigating...');
    await page.goto('https://pconassinantes.site', { waitUntil: 'networkidle2', timeout: 15000 }).catch(e => console.log("GOTO error:", e.message));
    
    // Wait a bit
    await new Promise(r => setTimeout(r, 6000));
    
    const content = await page.content();
    console.log("ROOT CONTENT:", await page.evaluate(() => document.getElementById('root')?.innerHTML));

    await browser.close();
})();
