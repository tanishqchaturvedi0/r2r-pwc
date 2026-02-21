import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function testR2RPwcApplication() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });
  const page = await context.newPage();

  const screenshotsDir = path.join(__dirname, 'test-screenshots');
  if (!fs.existsSync(screenshotsDir)) {
    fs.mkdirSync(screenshotsDir);
  }

  const report = [];

  try {
    // Step 1: Navigate to the application
    report.push('\n=== STEP 1: Navigate to http://localhost:3000 ===');
    await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
    await page.waitForTimeout(1000);
    
    // Step 2: Take screenshot and describe login page
    report.push('\n=== STEP 2: Login Page ===');
    await page.screenshot({ path: path.join(screenshotsDir, '01-login-page.png'), fullPage: true });
    
    const loginPageContent = await page.content();
    const hasLoginForm = await page.locator('input[type="email"], input[type="text"][name*="email"]').count() > 0;
    const hasPasswordField = await page.locator('input[type="password"]').count() > 0;
    const hasLoginButton = await page.locator('button:has-text("Sign in"), button:has-text("Login"), button[type="submit"]').count() > 0;
    
    report.push(`Login form detected: ${hasLoginForm}`);
    report.push(`Password field detected: ${hasPasswordField}`);
    report.push(`Login button detected: ${hasLoginButton}`);
    
    const visibleText = await page.textContent('body').catch(() => '');
    report.push(`Page title/heading: ${await page.title()}`);
    report.push(`Visible text snippet: ${visibleText.substring(0, 200)}...`);

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
        const emailInput = page.locator('input[type="email"], input[type="text"][name*="email"], input[name*="username"]').first();
        await emailInput.fill(cred.email);
        
        // Find and fill password field
        const passwordInput = page.locator('input[type="password"]').first();
        await passwordInput.fill(cred.password);
        
        await page.screenshot({ path: path.join(screenshotsDir, `02-login-filled-${cred.email}.png`), fullPage: true });
        
        // Click login button
        const loginButton = page.locator('button:has-text("Sign in"), button:has-text("Login"), button[type="submit"]').first();
        await loginButton.click();
        
        // Wait for navigation or error
        await page.waitForTimeout(2000);
        
        // Check if login was successful (URL change or dashboard elements present)
        const currentUrl = page.url();
        const hasDashboardElements = await page.locator('nav, aside, [role="navigation"]').count() > 0;
        
        report.push(`Current URL after login attempt: ${currentUrl}`);
        report.push(`Dashboard elements detected: ${hasDashboardElements}`);
        
        if (currentUrl !== 'http://localhost:3000/' && currentUrl !== 'http://localhost:3000/login' || hasDashboardElements) {
          report.push(`✅ Login successful with ${cred.email}`);
          loginSuccessful = true;
          break;
        } else {
          report.push(`❌ Login failed with ${cred.email}`);
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
    
    const dashboardText = await page.textContent('body').catch(() => '');
    report.push(`Dashboard visible text: ${dashboardText.substring(0, 300)}...`);
    
    // Check for common dashboard elements
    const hasLoadingSpinner = await page.locator('[class*="spinner"], [class*="loading"], svg[class*="animate-spin"]').count() > 0;
    const hasStatCards = await page.locator('[class*="card"], [class*="stat"]').count() > 0;
    const hasChart = await page.locator('canvas, svg[class*="chart"]').count() > 0;
    const hasCalendar = await page.locator('[class*="calendar"], [class*="Calendar"]').count() > 0;
    
    report.push(`Loading spinner present: ${hasLoadingSpinner}`);
    report.push(`Stat cards present: ${hasStatCards}`);
    report.push(`Chart present: ${hasChart}`);
    report.push(`Calendar present: ${hasCalendar}`);

    // Step 5: Wait for dashboard to fully load
    report.push('\n=== STEP 5: Waiting for Dashboard to Load (8 seconds) ===');
    await page.waitForTimeout(8000);
    await page.screenshot({ path: path.join(screenshotsDir, '04-dashboard-loaded.png'), fullPage: true });
    
    // Check again after waiting
    const hasLoadingSpinnerAfter = await page.locator('[class*="spinner"], [class*="loading"], svg[class*="animate-spin"]').count() > 0;
    const hasStatCardsAfter = await page.locator('[class*="card"], [class*="stat"]').count() > 0;
    const hasChartAfter = await page.locator('canvas, svg[class*="chart"]').count() > 0;
    const hasCalendarAfter = await page.locator('[class*="calendar"], [class*="Calendar"]').count() > 0;
    
    report.push(`After 8s - Loading spinner: ${hasLoadingSpinnerAfter}`);
    report.push(`After 8s - Stat cards: ${hasStatCardsAfter}`);
    report.push(`After 8s - Chart: ${hasChartAfter}`);
    report.push(`After 8s - Calendar: ${hasCalendarAfter}`);

    // Step 6: Click on "Period-Based" navigation
    report.push('\n=== STEP 6: Navigate to Period-Based ===');
    try {
      // Look for Period-Based link in sidebar
      const periodBasedLink = page.locator('a:has-text("Period-Based"), a:has-text("Period Based"), [href*="period-based"], [href*="period_based"]').first();
      await periodBasedLink.waitFor({ timeout: 5000 });
      await periodBasedLink.click();
      
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotsDir, '05-period-based.png'), fullPage: true });
      
      const currentUrl = page.url();
      const pageContent = await page.textContent('body').catch(() => '');
      const hasCrashMessage = pageContent.includes('error') || pageContent.includes('crash') || pageContent.includes('Something went wrong');
      
      report.push(`Current URL: ${currentUrl}`);
      report.push(`Page crashed/error: ${hasCrashMessage}`);
      report.push(`Page content snippet: ${pageContent.substring(0, 200)}...`);
    } catch (error) {
      report.push(`❌ Error navigating to Period-Based: ${error.message}`);
      await page.screenshot({ path: path.join(screenshotsDir, '05-period-based-error.png'), fullPage: true });
    }

    // Step 7: Click on "Activity-Based"
    report.push('\n=== STEP 7: Navigate to Activity-Based ===');
    try {
      const activityBasedLink = page.locator('a:has-text("Activity-Based"), a:has-text("Activity Based"), [href*="activity-based"], [href*="activity_based"]').first();
      await activityBasedLink.waitFor({ timeout: 5000 });
      await activityBasedLink.click();
      
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotsDir, '06-activity-based.png'), fullPage: true });
      
      const currentUrl = page.url();
      const pageContent = await page.textContent('body').catch(() => '');
      const hasCrashMessage = pageContent.includes('error') || pageContent.includes('crash') || pageContent.includes('Something went wrong');
      
      report.push(`Current URL: ${currentUrl}`);
      report.push(`Page crashed/error: ${hasCrashMessage}`);
      report.push(`Page content snippet: ${pageContent.substring(0, 200)}...`);
    } catch (error) {
      report.push(`❌ Error navigating to Activity-Based: ${error.message}`);
      await page.screenshot({ path: path.join(screenshotsDir, '06-activity-based-error.png'), fullPage: true });
    }

    // Step 8: Click on "Reports"
    report.push('\n=== STEP 8: Navigate to Reports ===');
    try {
      const reportsLink = page.locator('a:has-text("Reports"), [href*="reports"], [href*="report"]').first();
      await reportsLink.waitFor({ timeout: 5000 });
      await reportsLink.click();
      
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotsDir, '07-reports.png'), fullPage: true });
      
      const currentUrl = page.url();
      const pageContent = await page.textContent('body').catch(() => '');
      const hasCrashMessage = pageContent.includes('error') || pageContent.includes('crash') || pageContent.includes('Something went wrong');
      
      report.push(`Current URL: ${currentUrl}`);
      report.push(`Page crashed/error: ${hasCrashMessage}`);
      report.push(`Page content snippet: ${pageContent.substring(0, 200)}...`);
    } catch (error) {
      report.push(`❌ Error navigating to Reports: ${error.message}`);
      await page.screenshot({ path: path.join(screenshotsDir, '07-reports-error.png'), fullPage: true });
    }

    // Step 9: Click back on "Dashboard"
    report.push('\n=== STEP 9: Navigate back to Dashboard ===');
    try {
      const dashboardLink = page.locator('a:has-text("Dashboard"), [href="/"], [href*="dashboard"]').first();
      await dashboardLink.waitFor({ timeout: 5000 });
      await dashboardLink.click();
      
      await page.waitForTimeout(3000);
      await page.screenshot({ path: path.join(screenshotsDir, '08-dashboard-return.png'), fullPage: true });
      
      const currentUrl = page.url();
      const pageContent = await page.textContent('body').catch(() => '');
      const hasCrashMessage = pageContent.includes('error') || pageContent.includes('crash') || pageContent.includes('Something went wrong');
      const hasLoadingSpinner = await page.locator('[class*="spinner"], [class*="loading"], svg[class*="animate-spin"]').count() > 0;
      
      report.push(`Current URL: ${currentUrl}`);
      report.push(`Page crashed/error: ${hasCrashMessage}`);
      report.push(`Loading spinner present: ${hasLoadingSpinner}`);
      report.push(`Page content snippet: ${pageContent.substring(0, 200)}...`);
    } catch (error) {
      report.push(`❌ Error navigating back to Dashboard: ${error.message}`);
      await page.screenshot({ path: path.join(screenshotsDir, '08-dashboard-return-error.png'), fullPage: true });
    }

    // Step 10: Overall assessment
    report.push('\n=== STEP 10: Overall Assessment ===');
    report.push(`Browser context is responsive: ${!page.isClosed()}`);
    
    // Check console errors
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push(`${msg.type()}: ${msg.text()}`));
    
    report.push(`Console messages captured: ${consoleMessages.length}`);
    if (consoleMessages.length > 0) {
      report.push(`Recent console messages: ${consoleMessages.slice(-10).join(', ')}`);
    }

  } catch (error) {
    report.push(`\n❌ CRITICAL ERROR: ${error.message}`);
    report.push(`Stack: ${error.stack}`);
    await page.screenshot({ path: path.join(screenshotsDir, 'error.png'), fullPage: true });
  } finally {
    // Write report to file
    fs.writeFileSync(
      path.join(__dirname, 'test-report.txt'),
      report.join('\n')
    );
    
    console.log(report.join('\n'));
    console.log(`\n📸 Screenshots saved to: ${screenshotsDir}`);
    console.log(`📝 Report saved to: ${path.join(__dirname, 'test-report.txt')}`);
    
    await browser.close();
  }
}

testR2RPwcApplication().catch(console.error);
