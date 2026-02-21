import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testR2RPwcApplication() {
  const browser = await puppeteer.launch({ 
    headless: false,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    defaultViewport: { width: 1920, height: 1080 },
    args: ['--start-maximized']
  });
  
  const page = await browser.newPage();

  const screenshotsDir = path.join(__dirname, 'test-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  const report = [];
  const consoleMessages = [];
  const errors = [];

  // Capture console messages
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push(`[${msg.type()}] ${text}`);
  });

  // Capture page errors
  page.on('pageerror', error => {
    errors.push(`Page error: ${error.message}`);
  });

  try {
    // Step 1: Navigate to the application
    report.push('\n=== STEP 1: Navigate to http://localhost:3000 ===');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle2', timeout: 10000 });
    await page.waitForTimeout(1000);
    
    // Step 2: Take screenshot and describe login page
    report.push('\n=== STEP 2: Login Page ===');
    await page.screenshot({ path: path.join(screenshotsDir, '01-login-page.png'), fullPage: true });
    
    const hasLoginForm = await page.$('input[type="email"], input[type="text"][name*="email"]') !== null;
    const hasPasswordField = await page.$('input[type="password"]') !== null;
    const hasLoginButton = await page.$('button:has-text("Sign in"), button:has-text("Login"), button[type="submit"]') !== null;
    
    report.push(`Login form detected: ${hasLoginForm}`);
    report.push(`Password field detected: ${hasPasswordField}`);
    report.push(`Login button detected: ${hasLoginButton}`);
    
    const pageTitle = await page.title();
    const bodyText = await page.evaluate(() => document.body.innerText.substring(0, 300));
    
    report.push(`Page title: ${pageTitle}`);
    report.push(`Visible text snippet: ${bodyText}...`);

    // Step 3: Attempt login with credentials
    report.push('\n=== STEP 3: Attempting Login ===');
    
    const credentials = [
      { email: 'admin@pwc.com', password: 'Admin@123' },
      { email: 'admin@example.com', password: 'admin123' },
      { email: 'admin', password: 'admin' }
    ];

    let loginSuccessful = false;
    for (const cred of credentials) {
      try {
        report.push(`\nTrying credentials: ${cred.email} / ${cred.password}`);
        
        // Find and fill email field
        const emailInput = await page.$('input[type="email"], input[type="text"][placeholder*="mail"], input[name*="email"], input[name*="username"]');
        if (emailInput) {
          await emailInput.click({ clickCount: 3 });
          await emailInput.type(cred.email, { delay: 50 });
        }
        
        // Find and fill password field
        const passwordInput = await page.$('input[type="password"]');
        if (passwordInput) {
          await passwordInput.click({ clickCount: 3 });
          await passwordInput.type(cred.password, { delay: 50 });
        }
        
        await page.screenshot({ path: path.join(screenshotsDir, `02-login-filled-${cred.email.replace(/[@.]/g, '_')}.png`), fullPage: true });
        
        // Click login button
        const loginButton = await page.$('button[type="submit"]');
        if (loginButton) {
          await loginButton.click();
          
          // Wait for navigation or error
          await page.waitForTimeout(3000);
          
          // Check if login was successful
          const currentUrl = page.url();
          const hasDashboardElements = await page.$('nav, aside, [role="navigation"]') !== null;
          
          report.push(`Current URL after login attempt: ${currentUrl}`);
          report.push(`Dashboard elements detected: ${hasDashboardElements}`);
          
          if ((currentUrl !== 'http://localhost:3000/' && currentUrl !== 'http://localhost:3000/login') || hasDashboardElements) {
            report.push(`✅ Login successful with ${cred.email}`);
            loginSuccessful = true;
            break;
          } else {
            report.push(`❌ Login failed with ${cred.email}`);
            // Check for error messages
            const errorText = await page.evaluate(() => {
              const errorEl = document.querySelector('[role="alert"], .error, [class*="error"]');
              return errorEl ? errorEl.textContent : 'No error message found';
            });
            report.push(`Error message: ${errorText}`);
          }
        }
      } catch (error) {
        report.push(`Error during login attempt: ${error.message}`);
      }
    }

    if (!loginSuccessful) {
      report.push('\n⚠️ Could not login with any credentials. Stopping test.');
      await page.screenshot({ path: path.join(screenshotsDir, '02-login-failed.png'), fullPage: true });
      console.log(report.join('\n'));
      await browser.close();
      return;
    }

    // Step 4: After login - describe dashboard
    report.push('\n=== STEP 4: After Login - Dashboard ===');
    await page.screenshot({ path: path.join(screenshotsDir, '03-after-login.png'), fullPage: true });
    
    const dashboardText = await page.evaluate(() => document.body.innerText.substring(0, 400));
    report.push(`Dashboard visible text: ${dashboardText}...`);
    
    // Check for common dashboard elements
    const hasLoadingSpinner = await page.$('[class*="spinner"], [class*="loading"], svg[class*="animate-spin"]') !== null;
    const hasStatCards = await page.$$('[class*="card"], [class*="stat"]').then(els => els.length);
    const hasChart = await page.$('canvas, svg[class*="chart"]') !== null;
    const hasCalendar = await page.$('[class*="calendar"], [class*="Calendar"]') !== null;
    
    report.push(`Loading spinner present: ${hasLoadingSpinner}`);
    report.push(`Stat cards count: ${hasStatCards}`);
    report.push(`Chart present: ${hasChart}`);
    report.push(`Calendar present: ${hasCalendar}`);

    // Step 5: Wait for dashboard to fully load
    report.push('\n=== STEP 5: Waiting for Dashboard to Load (8 seconds) ===');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: path.join(screenshotsDir, '04-dashboard-loaded.png'), fullPage: true });
    
    // Check again after waiting
    const hasLoadingSpinnerAfter = await page.$('[class*="spinner"], [class*="loading"], svg[class*="animate-spin"]') !== null;
    const hasStatCardsAfter = await page.$$('[class*="card"], [class*="stat"]').then(els => els.length);
    const hasChartAfter = await page.$('canvas, svg[class*="chart"]') !== null;
    const hasCalendarAfter = await page.$('[class*="calendar"], [class*="Calendar"]') !== null;
    
    report.push(`After 8s - Loading spinner: ${hasLoadingSpinnerAfter}`);
    report.push(`After 8s - Stat cards count: ${hasStatCardsAfter}`);
    report.push(`After 8s - Chart: ${hasChartAfter}`);
    report.push(`After 8s - Calendar: ${hasCalendarAfter}`);

    // Step 6: Click on "Period-Based" navigation
    report.push('\n=== STEP 6: Navigate to Period-Based ===');
    try {
      const periodBasedLink = await page.evaluateHandle(() => {
        const links = Array.from(document.querySelectorAll('a, button'));
        return links.find(el => 
          el.textContent.includes('Period-Based') || 
          el.textContent.includes('Period Based') ||
          el.getAttribute('href')?.includes('period-based') ||
          el.getAttribute('href')?.includes('period_based')
        );
      });
      
      if (periodBasedLink) {
        await periodBasedLink.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(screenshotsDir, '05-period-based.png'), fullPage: true });
        
        const currentUrl = page.url();
        const pageContent = await page.evaluate(() => document.body.innerText.substring(0, 300));
        const hasCrashMessage = pageContent.toLowerCase().includes('error') || 
                               pageContent.toLowerCase().includes('crash') || 
                               pageContent.toLowerCase().includes('something went wrong');
        
        report.push(`Current URL: ${currentUrl}`);
        report.push(`Page crashed/error: ${hasCrashMessage}`);
        report.push(`Page content snippet: ${pageContent}...`);
      } else {
        report.push('❌ Could not find Period-Based link');
      }
    } catch (error) {
      report.push(`❌ Error navigating to Period-Based: ${error.message}`);
      await page.screenshot({ path: path.join(screenshotsDir, '05-period-based-error.png'), fullPage: true });
    }

    // Step 7: Click on "Activity-Based"
    report.push('\n=== STEP 7: Navigate to Activity-Based ===');
    try {
      const activityBasedLink = await page.evaluateHandle(() => {
        const links = Array.from(document.querySelectorAll('a, button'));
        return links.find(el => 
          el.textContent.includes('Activity-Based') || 
          el.textContent.includes('Activity Based') ||
          el.getAttribute('href')?.includes('activity-based') ||
          el.getAttribute('href')?.includes('activity_based')
        );
      });
      
      if (activityBasedLink) {
        await activityBasedLink.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(screenshotsDir, '06-activity-based.png'), fullPage: true });
        
        const currentUrl = page.url();
        const pageContent = await page.evaluate(() => document.body.innerText.substring(0, 300));
        const hasCrashMessage = pageContent.toLowerCase().includes('error') || 
                               pageContent.toLowerCase().includes('crash') || 
                               pageContent.toLowerCase().includes('something went wrong');
        
        report.push(`Current URL: ${currentUrl}`);
        report.push(`Page crashed/error: ${hasCrashMessage}`);
        report.push(`Page content snippet: ${pageContent}...`);
      } else {
        report.push('❌ Could not find Activity-Based link');
      }
    } catch (error) {
      report.push(`❌ Error navigating to Activity-Based: ${error.message}`);
      await page.screenshot({ path: path.join(screenshotsDir, '06-activity-based-error.png'), fullPage: true });
    }

    // Step 8: Click on "Reports"
    report.push('\n=== STEP 8: Navigate to Reports ===');
    try {
      const reportsLink = await page.evaluateHandle(() => {
        const links = Array.from(document.querySelectorAll('a, button'));
        return links.find(el => 
          el.textContent.includes('Reports') || 
          el.textContent.includes('Report') ||
          el.getAttribute('href')?.includes('reports') ||
          el.getAttribute('href')?.includes('report')
        );
      });
      
      if (reportsLink) {
        await reportsLink.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(screenshotsDir, '07-reports.png'), fullPage: true });
        
        const currentUrl = page.url();
        const pageContent = await page.evaluate(() => document.body.innerText.substring(0, 300));
        const hasCrashMessage = pageContent.toLowerCase().includes('error') || 
                               pageContent.toLowerCase().includes('crash') || 
                               pageContent.toLowerCase().includes('something went wrong');
        
        report.push(`Current URL: ${currentUrl}`);
        report.push(`Page crashed/error: ${hasCrashMessage}`);
        report.push(`Page content snippet: ${pageContent}...`);
      } else {
        report.push('❌ Could not find Reports link');
      }
    } catch (error) {
      report.push(`❌ Error navigating to Reports: ${error.message}`);
      await page.screenshot({ path: path.join(screenshotsDir, '07-reports-error.png'), fullPage: true });
    }

    // Step 9: Click back on "Dashboard"
    report.push('\n=== STEP 9: Navigate back to Dashboard ===');
    try {
      const dashboardLink = await page.evaluateHandle(() => {
        const links = Array.from(document.querySelectorAll('a, button'));
        return links.find(el => 
          el.textContent.includes('Dashboard') ||
          el.getAttribute('href') === '/' ||
          el.getAttribute('href')?.includes('dashboard')
        );
      });
      
      if (dashboardLink) {
        await dashboardLink.click();
        await page.waitForTimeout(3000);
        await page.screenshot({ path: path.join(screenshotsDir, '08-dashboard-return.png'), fullPage: true });
        
        const currentUrl = page.url();
        const pageContent = await page.evaluate(() => document.body.innerText.substring(0, 300));
        const hasCrashMessage = pageContent.toLowerCase().includes('error') || 
                               pageContent.toLowerCase().includes('crash') || 
                               pageContent.toLowerCase().includes('something went wrong');
        const hasLoadingSpinner = await page.$('[class*="spinner"], [class*="loading"], svg[class*="animate-spin"]') !== null;
        
        report.push(`Current URL: ${currentUrl}`);
        report.push(`Page crashed/error: ${hasCrashMessage}`);
        report.push(`Loading spinner present: ${hasLoadingSpinner}`);
        report.push(`Page content snippet: ${pageContent}...`);
      } else {
        report.push('❌ Could not find Dashboard link');
      }
    } catch (error) {
      report.push(`❌ Error navigating back to Dashboard: ${error.message}`);
      await page.screenshot({ path: path.join(screenshotsDir, '08-dashboard-return-error.png'), fullPage: true });
    }

    // Step 10: Overall assessment
    report.push('\n=== STEP 10: Overall Assessment ===');
    report.push(`Browser is responsive: ${!page.isClosed()}`);
    report.push(`Total console messages: ${consoleMessages.length}`);
    report.push(`Total page errors: ${errors.length}`);
    
    if (consoleMessages.length > 0) {
      report.push(`\nRecent console messages (last 20):`);
      consoleMessages.slice(-20).forEach(msg => report.push(`  ${msg}`));
    }
    
    if (errors.length > 0) {
      report.push(`\nPage errors:`);
      errors.forEach(err => report.push(`  ${err}`));
    }

  } catch (error) {
    report.push(`\n❌ CRITICAL ERROR: ${error.message}`);
    report.push(`Stack: ${error.stack}`);
    await page.screenshot({ path: path.join(screenshotsDir, 'error.png'), fullPage: true });
  } finally {
    // Write report to file
    const reportText = report.join('\n');
    fs.writeFileSync(
      path.join(__dirname, 'test-report.txt'),
      reportText
    );
    
    console.log(reportText);
    console.log(`\n📸 Screenshots saved to: ${screenshotsDir}`);
    console.log(`📝 Report saved to: ${path.join(__dirname, 'test-report.txt')}`);
    
    await browser.close();
  }
}

testR2RPwcApplication().catch(console.error);
