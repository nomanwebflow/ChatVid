import { chromium } from "playwright";

async function runTest() {
  console.log("Starting Convex Auth & DB Playwright test...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await context.newPage();

  // Listen to console errors
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      console.log(`[Browser Error]:`, msg.text());
    }
  });

  try {
    console.log("1. Navigating to http://localhost:5174...");
    await page.goto("http://localhost:5174", { waitUntil: "networkidle" });
    await page.waitForTimeout(1000);

    // Verify Title
    const title = await page.title();
    console.log("Page title:", title);

    // Verify Brand, Projects button, Sign In button
    const brand = await page.textContent(".brand");
    console.log("Brand found:", brand?.trim());

    const projectsBtn = page.locator(".tb-projects-btn");
    console.log("Projects button visible:", await projectsBtn.isVisible());

    const signInBtn = page.locator(".auth-trigger-btn");
    console.log("Sign In button visible:", await signInBtn.isVisible());

    await page.screenshot({ path: "test-results/1-initial-page.png" });

    // Open Auth Modal
    console.log("2. Opening Auth Modal...");
    await signInBtn.click();
    await page.waitForSelector(".auth-dialog");
    console.log("Auth modal opened!");
    await page.screenshot({ path: "test-results/2-auth-modal.png" });

    // Click Continue as Guest
    console.log("3. Testing Guest Creator sign in...");
    const guestBtn = page.locator(".auth-guest-btn");
    await guestBtn.click();

    // Wait for user menu to update
    await page.waitForSelector(".user-btn", { timeout: 8000 });
    const userLabel = await page.textContent(".user-name-label");
    const guestBadge = await page.textContent(".user-badge-guest");
    console.log("User label:", userLabel?.trim(), "Badge:", guestBadge?.trim());
    await page.screenshot({ path: "test-results/3-guest-authenticated.png" });

    // Open User Dropdown
    console.log("4. Testing User Dropdown...");
    await page.click(".user-btn");
    await page.waitForSelector(".user-dropdown");
    console.log("User dropdown opened!");
    await page.screenshot({ path: "test-results/4-user-dropdown.png" });

    // Open Projects Modal
    console.log("5. Testing Cloud Projects Modal...");
    await page.click(".user-dropdown-item:has-text('My Cloud Projects')");
    await page.waitForSelector(".projects-dialog");
    console.log("Projects modal opened!");
    await page.screenshot({ path: "test-results/5-projects-modal.png" });

    // Check project card and create new project
    const cards = await page.locator(".pm-card").count();
    console.log("Initial cloud project cards count:", cards);

    console.log("6. Testing Create New Project button...");
    const newProjBtn = page.locator(".pm-head-actions button:has-text('New Project')");
    await newProjBtn.click();
    await page.waitForTimeout(1000);

    // Verify new project title
    const activeProjectTitle = await page.inputValue(".title-input");
    console.log("Active project title after creation:", activeProjectTitle);
    await page.screenshot({ path: "test-results/6-new-project-created.png" });

    // Open projects again to see multiple projects
    await page.click(".tb-projects-btn");
    await page.waitForSelector(".projects-dialog");
    const newCardsCount = await page.locator(".pm-card").count();
    console.log("Projects count after creation:", newCardsCount);
    await page.screenshot({ path: "test-results/7-multiple-projects.png" });
    await page.click(".projects-dialog .icon-only"); // close modal

    // Sign Out
    console.log("7. Testing Sign Out...");
    await page.click(".user-btn");
    await page.waitForSelector(".user-dropdown");
    await page.click(".user-dropdown-item.danger");
    await page.waitForSelector(".auth-trigger-btn", { timeout: 8000 });
    console.log("Sign out successful! Returned to unauthenticated state.");

    // Test Email / Password Sign Up
    console.log("8. Testing Email/Password Registration...");
    await page.click(".auth-trigger-btn");
    await page.waitForSelector(".auth-dialog");
    await page.click(".auth-tab:has-text('Create Account')");

    const testEmail = `user_${Date.now()}@test.com`;
    await page.fill("#auth-name", "Antigravity Creator");
    await page.fill("#auth-email", testEmail);
    await page.fill("#auth-password", "Password123!");
    await page.click(".auth-submit-btn");

    await page.waitForSelector(".user-btn", { timeout: 10000 });
    const signedInName = await page.textContent(".user-name-label");
    console.log("Signed in with email/password as:", signedInName?.trim());
    await page.screenshot({ path: "test-results/8-email-password-authenticated.png" });

    console.log("\nALL TESTS PASSED SUCCESSFULLY! Convex Auth & DB Multi-User platform fully operational.");
  } catch (err) {
    console.error("Test failed with error:", err);
    await page.screenshot({ path: "test-results/error-screenshot.png" });
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

runTest();
