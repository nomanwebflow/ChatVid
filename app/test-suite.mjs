import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, "test-results");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const BASE_URL = "http://localhost:5180";

async function runTestSuite() {
  console.log("🚀 Starting Playwright Test Suite for ChatVid...");
  const browser = await chromium.launch({
    headless: true,
  });

  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();

  const consoleLogs = [];
  const errors = [];

  page.on("console", (msg) => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    if (msg.type() === "error") {
      errors.push(text);
      console.error(`🔴 Console Error: ${text}`);
    }
  });

  page.on("pageerror", (err) => {
    errors.push(err.message);
    console.error(`💥 Page Error: ${err.message}`);
  });

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: [],
  };

  async function test(name, fn) {
    results.total++;
    process.stdout.write(`• Testing: ${name}... `);
    try {
      await fn();
      results.passed++;
      results.tests.push({ name, status: "PASS" });
      console.log("✅ PASS");
    } catch (err) {
      results.failed++;
      results.tests.push({ name, status: "FAIL", error: err.message });
      console.log(`❌ FAIL\n  Error: ${err.message}`);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `fail-${name.replace(/\s+/g, "_")}.png`) });
    }
  }

  // 1. Initial Page Load
  await test("Initial page load & basic structure", async () => {
    await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
    const title = await page.title();
    if (!title.includes("ChatVid")) throw new Error(`Unexpected title: ${title}`);
    
    // Check toolbar brand
    await page.waitForSelector(".toolbar .brand");
    // Check panels
    await page.waitForSelector(".panel.left");
    await page.waitForSelector(".panel.preview");
    await page.waitForSelector(".panel.right");
    await page.waitForSelector(".editor-timeline-panel");
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "01_initial_load.png") });
  });

  // 2. Message Selection & Inspector Data Sync
  await test("Message selection updates Inspector panel", async () => {
    const messages = await page.$$(".msg-item");
    if (messages.length === 0) throw new Error("No messages found in initial project");

    // Click first message
    await messages[0].click();
    await page.waitForSelector(".msg-item.sel");
    
    // Check textarea in inspector has value
    const textVal = await page.$eval("#mtext", (el) => el.value);
    if (!textVal) throw new Error("Inspector textarea is empty for selected message");

    // Check count in inspector
    const countText = await page.$eval(".panel.right .panel-head-actions .count", (el) => el.textContent);
    if (!countText.includes("Message 1")) throw new Error(`Unexpected inspector count: ${countText}`);
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "02_message_selected.png") });
  });

  // 3. Edit Message Text & Verify Update
  await test("Editing message text reflects in list and state", async () => {
    const newText = "Hello from Playwright automated test!";
    await page.fill("#mtext", newText);
    await page.waitForTimeout(300);

    // Verify message list shows updated text
    const listText = await page.$eval(".msg-item.sel .msg-text", (el) => el.textContent);
    if (!listText.includes(newText)) throw new Error(`List did not reflect edited text. Got: ${listText}`);
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "03_edited_text.png") });
  });

  // 4. Toggle Read Receipt
  await test("Toggle read receipt updates indicator", async () => {
    const switchBtn = await page.$('.switch[aria-label="Read receipt toggle"]');
    if (!switchBtn) throw new Error("Read receipt switch not found");
    
    const wasChecked = await switchBtn.getAttribute("aria-checked") === "true";
    await switchBtn.click();
    await page.waitForTimeout(200);

    const isChecked = await switchBtn.getAttribute("aria-checked") === "true";
    if (isChecked === wasChecked) throw new Error("Switch aria-checked did not toggle");

    // Check checkmarks meta chip in selected message
    const hasChip = await page.$eval(".msg-item.sel", (el) => !!el.querySelector(".meta-chip.read-receipt"));
    if (hasChip !== isChecked) throw new Error(`Message item chip (${hasChip}) does not match switch state (${isChecked})`);
  });

  // 5. Add New Text Message
  await test("Add text message button appends and selects", async () => {
    const countBefore = (await page.$$(".msg-item")).length;
    await page.click('button:has-text("Add message")');
    await page.waitForTimeout(300);

    const countAfter = (await page.$$(".msg-item")).length;
    if (countAfter !== countBefore + 1) throw new Error(`Expected ${countBefore + 1} messages, got ${countAfter}`);

    const selectedText = await page.$eval(".msg-item.sel .msg-text", (el) => el.textContent);
    if (!selectedText.includes("New message")) throw new Error(`Expected new message to be selected, got: ${selectedText}`);
    
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "04_added_message.png") });
  });

  // 6. Add Voice Message
  await test("Add voice message adds microphone bubble", async () => {
    const countBefore = (await page.$$(".msg-item")).length;
    await page.click('button:has-text("Voice")');
    await page.waitForTimeout(300);

    const countAfter = (await page.$$(".msg-item")).length;
    if (countAfter !== countBefore + 1) throw new Error(`Expected ${countBefore + 1} messages, got ${countAfter}`);

    const isVoice = await page.$eval(".msg-item.sel .msg-voice", (el) => !!el);
    if (!isVoice) throw new Error("New voice message does not have voice badge");
    
    // Check VoicePanel in Inspector
    await page.waitForSelector(".voice-panel");
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "05_voice_message.png") });
  });

  // 7. Duplicate Message
  await test("Duplicate message copies message right below", async () => {
    const countBefore = (await page.$$(".msg-item")).length;
    await page.hover(".msg-item.sel");
    const dupBtn = await page.$(".msg-item.sel button[title='Duplicate']");
    if (!dupBtn) throw new Error("Duplicate button not found on selected message");
    await dupBtn.click();
    await page.waitForTimeout(300);

    const countAfter = (await page.$$(".msg-item")).length;
    if (countAfter !== countBefore + 1) throw new Error(`Expected ${countBefore + 1} messages after duplicate, got ${countAfter}`);
  });

  // 8. Delete Message
  await test("Delete message removes it from the list", async () => {
    const countBefore = (await page.$$(".msg-item")).length;
    await page.hover(".msg-item.sel");
    const delBtn = await page.$(".msg-item.sel button[title*='Delete']");
    if (!delBtn) throw new Error("Delete button not found on selected message");
    await delBtn.click();
    await page.waitForTimeout(300);

    const countAfter = (await page.$$(".msg-item")).length;
    if (countAfter !== countBefore - 1) throw new Error(`Expected ${countBefore - 1} messages after delete, got ${countAfter}`);
  });

  // 9. Video Player Controls: Play, Pause, Restart, Speed
  await test("Video playback controls toggle state", async () => {
    const playBtn = await page.$(".preview-controls .play-btn");
    if (!playBtn) throw new Error("Play button not found");

    // Play
    await playBtn.click();
    await page.waitForTimeout(600);
    const isPlaying = await playBtn.getAttribute("aria-label");
    if (isPlaying !== "Pause") throw new Error(`Expected aria-label 'Pause', got '${isPlaying}'`);

    // Pause
    await playBtn.click();
    await page.waitForTimeout(200);
    const isPaused = await playBtn.getAttribute("aria-label");
    if (isPaused !== "Play") throw new Error(`Expected aria-label 'Play', got '${isPaused}'`);

    // Change speed
    await page.selectOption(".pc-speed", "1.5");
    const speedVal = await page.$eval(".pc-speed", (el) => el.value);
    if (speedVal !== "1.5") throw new Error(`Expected speed 1.5, got ${speedVal}`);
  });

  // 10. Appearance Settings: Layout, Contact, Background
  await test("Appearance settings update preview frame and stage", async () => {
    // Toggle to Fullscreen
    await page.click('button:has-text("Full screen")');
    await page.waitForTimeout(300);
    let isFullPressed = await page.$eval('button:has-text("Full screen")', (el) => el.getAttribute("aria-pressed"));
    if (isFullPressed !== "true") throw new Error("Fullscreen layout button not pressed");

    // Toggle back to Phone
    await page.click('button:has-text("Phone")');
    await page.waitForTimeout(300);
    let isPhonePressed = await page.$eval('button:has-text("Phone")', (el) => el.getAttribute("aria-pressed"));
    if (isPhonePressed !== "true") throw new Error("Phone layout button not pressed");

    // Expand Contact section
    const contactSecToggle = await page.$('button.inspector-sec-toggle:has-text("Contact")');
    if (contactSecToggle) {
      await contactSecToggle.click();
      await page.waitForTimeout(200);
      await page.fill("#cname", "Dr. Alexander");
      await page.waitForTimeout(300);
    }

    // Change scene background preset to Sunset Glow
    const sunsetBtn = await page.$('button[title="Sunset Glow"]');
    if (sunsetBtn) {
      await sunsetBtn.click();
      await page.waitForTimeout(300);
    }
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "06_appearance_customized.png") });
  });

  // 11. Import Dialog modal & parse
  await test("Paste Import dialog opens, parses, and cancels with ESC", async () => {
    await page.click('button:has-text("Paste import")');
    await page.waitForSelector(".scrim .dialog");
    
    // Check dialog header
    const headText = await page.$eval(".dialog-head h3", (el) => el.textContent);
    if (!headText.includes("Paste conversation")) throw new Error(`Unexpected dialog header: ${headText}`);

    // Click Parse with default placeholder
    await page.click('button:has-text("Parse")');
    await page.waitForTimeout(300);

    // Verify preview list rendered
    const parseRows = await page.$$(".parse-row");
    if (parseRows.length === 0) throw new Error("No parse rows generated after clicking Parse");

    // Press Escape to dismiss
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
    const modalGone = (await page.$$(".scrim")).length === 0;
    if (!modalGone) throw new Error("Dialog was not closed by Escape key");
  });

  // 12. Export Dialog modal
  await test("Export dialog opens with tabs and duration info", async () => {
    await page.click('button:has-text("Export")');
    await page.waitForSelector(".scrim .dialog");

    const headText = await page.$eval(".dialog-head h3", (el) => el.textContent);
    if (!headText.includes("Export")) throw new Error(`Unexpected dialog header: ${headText}`);

    // Check mode tabs (Video / Screenshot)
    await page.waitForSelector('.export-modes button:has-text("Video")');
    await page.waitForSelector('.export-modes button:has-text("Screenshot")');

    // Switch to Screenshot tab
    await page.click('.export-modes button:has-text("Screenshot")');
    await page.waitForTimeout(200);
    await page.waitForSelector('button:has-text("Download PNG")');

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "07_export_dialog.png") });

    // Close
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });

  // 13. Edge Case: Empty Messages State
  await test("Edge Case: Delete all messages displays friendly empty state", async () => {
    // Delete all messages until empty
    let msgs = await page.$$(".msg-item");
    while (msgs.length > 0) {
      const delBtn = await msgs[0].$('button[title*="Delete"]');
      if (delBtn) await delBtn.click({ force: true });
      await page.waitForTimeout(100);
      msgs = await page.$$(".msg-item");
    }

    // Verify empty state is displayed
    await page.waitForSelector(".empty-list");
    const emptyText = await page.$eval(".empty-list p", (el) => el.textContent);
    if (!emptyText.includes("No messages yet")) throw new Error(`Unexpected empty list text: ${emptyText}`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "08_empty_messages.png") });

    // Click "Add the first message" button
    await page.click('.empty-list button:has-text("Add the first message")');
    await page.waitForTimeout(300);

    const restoredCount = (await page.$$(".msg-item")).length;
    if (restoredCount !== 1) throw new Error(`Expected 1 message after adding from empty, got ${restoredCount}`);
  });

  // 14. Edge Case: Extreme long text and special characters
  await test("Edge Case: Extremely long text and emojis in message", async () => {
    const extremeText = "🔥✨🚀 Very long message with special characters: <script>alert(1)</script> &amp; quote \"test\" and multiline \n\n🎉 Line 3 with lots of text that could potentially break flexbox or overflow message bubble boundaries in video rendering or editor list!";
    await page.fill("#mtext", extremeText);
    await page.waitForTimeout(400);

    // Verify text displayed without crashing
    const displayed = await page.$eval(".msg-item.sel .msg-text", (el) => el.textContent);
    if (!displayed.includes("Very long message")) throw new Error("Long text not found in message item");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "09_long_text_edge_case.png") });
  });

  // 15. Viewport Responsiveness: 1440, 1200, 900, 768, 480
  await test("Responsiveness across screen widths", async () => {
    // 1200px
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "10_viewport_1200.png") });

    // 900px
    await page.setViewportSize({ width: 900, height: 700 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "11_viewport_900.png") });

    // 768px (Tablet)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(200);
    // Notice or drawer should handle it
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "12_viewport_768.png") });

    // 480px (Mobile)
    await page.setViewportSize({ width: 480, height: 844 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "13_viewport_480.png") });

    // Reset to 1440
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(200);
  });

  // Summary Report
  console.log("\n=================================");
  console.log(`📊 Test Results: ${results.passed}/${results.total} Passed (${results.failed} Failed)`);
  console.log(`Console Errors detected: ${errors.length}`);
  if (errors.length > 0) {
    console.log("Logged Errors:\n" + errors.map((e) => ` - ${e}`).join("\n"));
  }
  console.log("=================================\n");

  await browser.close();

  // Save report JSON
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, "report.json"),
    JSON.stringify({ ...results, errors, consoleLogs }, null, 2)
  );

  return results;
}

runTestSuite().catch((e) => {
  console.error("Test suite crashed:", e);
  process.exit(1);
});
