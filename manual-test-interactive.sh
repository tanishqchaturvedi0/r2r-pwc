#!/bin/bash

echo "=== R2R-PWC Browser Test ==="
echo ""
echo "Opening Chrome to http://localhost:3000..."
echo "Please perform the following actions manually:"
echo ""
echo "1. Look at the page - is it a login screen?"
echo "2. Try logging in with: admin@pwc.com / Admin@123"
echo "3. If login succeeds, observe the dashboard loading"
echo "4. Try clicking these navigation items:"
echo "   - Period-Based"
echo "   - Activity-Based"
echo "   - Reports"
echo "   - Dashboard (to return)"
echo ""
echo "5. Open Chrome DevTools (Cmd+Option+I) and check:"
echo "   - Console tab for errors"
echo "   - Network tab for failed requests"
echo ""
echo "Press any key when you've completed testing..."
read -n 1

echo ""
echo ""
echo "Test observations checklist:"
echo "Please answer the following questions:"
echo ""

read -p "1. Did the login page load correctly? (y/n): " login_page
read -p "2. Which credentials worked? (admin@pwc.com, admin@example.com, or other): " credentials
read -p "3. Did you see a loading spinner after login? (y/n): " loading_spinner
read -p "4. Did the dashboard fully load? (y/n): " dashboard_loaded
read -p "5. How many stat cards appeared? (0-8): " stat_cards
read -p "6. Did charts appear? (y/n): " charts
read -p "7. Did the calendar view appear at the bottom? (y/n): " calendar
read -p "8. Did Period-Based page crash or freeze? (y/n): " period_crash
read -p "9. Did Activity-Based page crash or freeze? (y/n): " activity_crash
read -p "10. Did Reports page crash or freeze? (y/n): " reports_crash
read -p "11. Did Dashboard reload correctly when navigating back? (y/n): " dashboard_reload
read -p "12. Any errors in console? (y/n): " console_errors

echo ""
echo ""
echo "=== Test Summary ==="
echo "Login Page Loaded: $login_page"
echo "Credentials Used: $credentials"
echo "Loading Spinner: $loading_spinner"
echo "Dashboard Loaded: $dashboard_loaded"
echo "Stat Cards Count: $stat_cards"
echo "Charts Visible: $charts"
echo "Calendar View: $calendar"
echo "Period-Based Issues: $period_crash"
echo "Activity-Based Issues: $activity_crash"
echo "Reports Issues: $reports_crash"
echo "Dashboard Reload: $dashboard_reload"
echo "Console Errors: $console_errors"

if [ "$console_errors" = "y" ]; then
  read -p "Describe the console errors: " error_description
  echo "Error Details: $error_description"
fi

echo ""
echo "Overall Assessment:"
if [ "$period_crash" = "n" ] && [ "$activity_crash" = "n" ] && [ "$reports_crash" = "n" ] && [ "$console_errors" = "n" ]; then
  echo "✅ System appears to be functioning normally"
else
  echo "⚠️  Issues detected - see details above"
fi

echo ""
echo "Test complete. Results saved."
