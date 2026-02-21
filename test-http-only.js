import http from 'http';
import https from 'https';

// Simple HTTP client to test the application
async function makeRequest(url, method = 'GET', headers = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname + urlObj.search,
      method,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        ...headers
      }
    };

    const client = urlObj.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function testR2RPwc() {
  console.log('=== R2R-PWC Application Test Report ===\n');
  
  try {
    // Step 1: Check if app is running
    console.log('STEP 1: Checking if application is accessible at http://localhost:3000');
    const homeResponse = await makeRequest('http://localhost:3000');
    console.log(`✅ Status: ${homeResponse.statusCode}`);
    console.log(`Response includes login form: ${homeResponse.body.includes('email') || homeResponse.body.includes('Email')}`);
    console.log(`Response includes password field: ${homeResponse.body.includes('password') || homeResponse.body.includes('Password')}`);
    console.log(`Page title: ${homeResponse.body.match(/<title>(.*?)<\/title>/)?.[1] || 'Not found'}\n`);
    
    // Step 2: Check API endpoints
    console.log('STEP 2: Testing API endpoints');
    try {
      const apiResponse = await makeRequest('http://localhost:3000/api/health');
      console.log(`✅ Health check: ${apiResponse.statusCode}`);
      console.log(`Response: ${apiResponse.body.substring(0, 200)}\n`);
    } catch (error) {
      console.log(`⚠️ No health endpoint or error: ${error.message}\n`);
    }
    
    // Step 3: Attempt login via API
    console.log('STEP 3: Attempting login via API');
    const credentials = [
      { email: 'admin@pwc.com', password: 'Admin@123' },
      { email: 'admin@example.com', password: 'admin123' }
    ];
    
    for (const cred of credentials) {
      try {
        const loginResponse = await makeRequest(
          'http://localhost:3000/api/login',
          'POST',
          {
            'Content-Type': 'application/json'
          },
          JSON.stringify(cred)
        );
        console.log(`Credentials ${cred.email}: Status ${loginResponse.statusCode}`);
        console.log(`Response: ${loginResponse.body.substring(0, 200)}`);
        
        if (loginResponse.statusCode === 200 || loginResponse.statusCode === 302) {
          console.log(`✅ Login successful with ${cred.email}\n`);
          
          // Extract session cookie if available
          const setCookie = loginResponse.headers['set-cookie'];
          if (setCookie) {
            console.log(`Session cookie received: ${setCookie}\n`);
            
            // Step 4: Test authenticated endpoints
            console.log('STEP 4: Testing authenticated endpoints');
            const cookieHeader = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie;
            
            const endpoints = [
              '/api/dashboard',
              '/api/accruals/period-based',
              '/api/accruals/activity-based',
              '/api/reports'
            ];
            
            for (const endpoint of endpoints) {
              try {
                const authResponse = await makeRequest(
                  `http://localhost:3000${endpoint}`,
                  'GET',
                  { 'Cookie': cookieHeader }
                );
                console.log(`${endpoint}: Status ${authResponse.statusCode}`);
              } catch (error) {
                console.log(`${endpoint}: Error - ${error.message}`);
              }
            }
          }
          break;
        } else {
          console.log(`❌ Login failed with ${cred.email}\n`);
        }
      } catch (error) {
        console.log(`Error with ${cred.email}: ${error.message}\n`);
      }
    }
    
    // Step 5: Check static routes
    console.log('\nSTEP 5: Checking client-side routes');
    const routes = [
      '/dashboard',
      '/period-based',
      '/activity-based',
      '/reports'
    ];
    
    for (const route of routes) {
      try {
        const routeResponse = await makeRequest(`http://localhost:3000${route}`);
        console.log(`${route}: Status ${routeResponse.statusCode} (${routeResponse.body.length} bytes)`);
      } catch (error) {
        console.log(`${route}: Error - ${error.message}`);
      }
    }
    
    console.log('\n=== Test Complete ===');
    console.log('\nNote: This is an HTTP-only test. For full UI testing including');
    console.log('screenshots and interaction, a browser-based test would be needed.');
    console.log('The browser-based tests are having issues launching Chrome on this system.\n');
    
  } catch (error) {
    console.error(`\n❌ CRITICAL ERROR: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
  }
}

testR2RPwc().catch(console.error);
