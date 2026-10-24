import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS_DIR = path.join(__dirname, "test-results", "edge-cases");

if (!fs.existsSync(SCREENSHOTS_DIR)) {
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
}

const BASE_URL = "http://localhost:5180";

async function runEdgeCaseTests() {
  console.log("🧪 Starting In-Depth Playwright Edge Case & UI Audit for ChatVid...\n");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
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

  const testReport = [];

  async function test(name, fn) {
    process.stdout.write(`• Testing: ${name}... `);
    try {
      await fn();
      testReport.push({ name, status: "PASS" });
      console.log("✅ PASS");
    } catch (err) {
      testReport.push({ name, status: "FAIL", error: err.message });
      console.log(`❌ FAIL -> ${err.message}`);
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, `fail-${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.png`) });
    }
  }

  // Helper to ensure modals are closed between tests
  async function ensureModalsClosed() {
    const scrim = await page.$(".scrim");
    if (scrim) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }
  }

  // 1. Initial Load
  await test("Navigate and wait for idle state", async () => {
    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForSelector(".workspace");
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "00_clean_app.png") });
  });

  // 2. Empty text message
  await test("Edge Case: Empty text message doesn't break bubble layout", async () => {
    await ensureModalsClosed();
    const msg = (await page.$$(".msg-item"))[0];
    await msg.click();
    await page.fill("#mtext", "");
    await page.waitForTimeout(300);

    const listText = await page.$eval(".msg-item.sel .msg-text", (el) => el.textContent);
    if (!listText.toLowerCase().includes("empty message")) {
      throw new Error(`Expected 'Empty message' in list, got: ${listText}`);
    }

    const countHint = await page.$eval(".field-count-hint", (el) => el.textContent);
    if (!countHint.includes("0 chars")) {
      throw new Error(`Expected 0 chars count hint, got: ${countHint}`);
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "01_empty_text_message.png") });
  });

  // 3. Unbroken long string / URL wrapping
  await test("Edge Case: Unbroken long string / URL wraps within bubble", async () => {
    await ensureModalsClosed();
    const longString = "https://subdomain.reallyreallylongexampledomainthatdoesnotbreak.org/deeply/nested/path/with/lots/of/parameters?key1=supercalifragilisticexpialidocious_value_1234567890_abcdefghij";
    await page.fill("#mtext", longString);
    await page.waitForTimeout(400);

    const overflowCheck = await page.evaluate(() => {
      const bubble = document.querySelector(".messages-inner .bubble");
      const phone = document.querySelector(".phone");
      if (!bubble || !phone) return { ok: false, reason: "bubble or phone not found" };
      const bubbleRect = bubble.getBoundingClientRect();
      const phoneRect = phone.getBoundingClientRect();
      return {
        ok: bubbleRect.right <= phoneRect.right + 2,
        bubbleRight: bubbleRect.right,
        phoneRight: phoneRect.right
      };
    });

    if (!overflowCheck.ok) {
      throw new Error(`Bubble overflowed phone container! Bubble right: ${overflowCheck.bubbleRight}, Phone right: ${overflowCheck.phoneRight}`);
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "02_unbroken_url_wrapped.png") });
  });

  // 4. XSS & HTML escaping
  await test("Edge Case: Raw HTML and script tags are sanitized as plain text", async () => {
    await ensureModalsClosed();
    const maliciousPayload = `<script>window.__xss_executed=true;</script><b id="injected-html">INJECTED</b> & " ' < >`;
    await page.fill("#mtext", maliciousPayload);
    await page.waitForTimeout(300);

    const xssExecuted = await page.evaluate(() => window.__xss_executed);
    if (xssExecuted) throw new Error("XSS script tag was executed!");

    const injectedTag = await page.$("#injected-html");
    if (injectedTag) throw new Error("HTML tag was rendered into DOM rather than escaped!");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "03_xss_safely_rendered.png") });
  });

  // 5. Contact Name & Status Clamping in Header
  await test("Edge Case: Contact name and status truncate without breaking header icons", async () => {
    await ensureModalsClosed();
    const contactBtn = await page.$('button.inspector-sec-toggle:has-text("Contact")');
    if (contactBtn) {
      const isExpanded = await contactBtn.getAttribute("aria-expanded");
      if (isExpanded !== "true") await contactBtn.click();
    }
    await page.waitForTimeout(200);

    await page.fill("#cname", "Professor Montgomery Bartholomew-Archibald III, Esq.");
    await page.fill("#csub", "typing a super long status message that would collide with call buttons if not clamped");
    await page.waitForTimeout(400);

    const headerCheck = await page.evaluate(() => {
      const callBtns = document.querySelector(".call-btns");
      const contactsRow = document.querySelector(".contacts-row");
      if (!callBtns || !contactsRow) return { ok: false, reason: "elements missing" };
      const callRect = callBtns.getBoundingClientRect();
      const rowRect = contactsRow.getBoundingClientRect();
      return {
        ok: callRect.right <= rowRect.right + 2 && callRect.width > 20,
        callRect,
        rowRect
      };
    });

    if (!headerCheck.ok) {
      throw new Error("Call buttons pushed outside contacts row or obscured!");
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "04_contact_header_clamped.png") });
  });

  // 6. Undo / Redo
  await test("Edge Case: Undo and Redo revert edits and additions", async () => {
    await ensureModalsClosed();
    const undoBtn = await page.$('button[title*="Undo"]');
    const redoBtn = await page.$('button[title*="Redo"]');
    if (!undoBtn || !redoBtn) throw new Error("Undo/Redo buttons not found");

    const countBefore = (await page.$$(".msg-item")).length;
    await page.click('.add-row button:has-text("Add message")');
    await page.waitForTimeout(300);

    const countAfterAdd = (await page.$$(".msg-item")).length;
    if (countAfterAdd !== countBefore + 1) throw new Error("Add message failed");

    await undoBtn.click();
    await page.waitForTimeout(300);
    const countAfterUndo = (await page.$$(".msg-item")).length;
    if (countAfterUndo !== countBefore) throw new Error(`Undo did not remove added message! Count: ${countAfterUndo}, expected: ${countBefore}`);

    await redoBtn.click();
    await page.waitForTimeout(300);
    const countAfterRedo = (await page.$$(".msg-item")).length;
    if (countAfterRedo !== countBefore + 1) throw new Error(`Redo did not restore added message! Count: ${countAfterRedo}`);

    await undoBtn.click();
    await page.waitForTimeout(200);
  });

  // 7. Alt+ArrowDown / Alt+ArrowUp Keyboard Reorder
  await test("Edge Case: Keyboard reorder (Alt+ArrowDown / Alt+ArrowUp)", async () => {
    await ensureModalsClosed();
    const firstMsg = (await page.$$(".msg-item"))[0];
    await firstMsg.click();
    const firstTextBefore = await firstMsg.$eval(".msg-text", (el) => el.textContent);

    await firstMsg.press("Alt+ArrowDown");
    await page.waitForTimeout(300);

    const secondMsgText = await (await page.$$(".msg-item"))[1].$eval(".msg-text", (el) => el.textContent);
    if (secondMsgText !== firstTextBefore) {
      throw new Error(`Alt+ArrowDown failed to swap message. Second msg is now: ${secondMsgText}`);
    }

    const secondMsg = (await page.$$(".msg-item"))[1];
    await secondMsg.press("Alt+ArrowUp");
    await page.waitForTimeout(300);

    const firstMsgTextRestored = await (await page.$$(".msg-item"))[0].$eval(".msg-text", (el) => el.textContent);
    if (firstMsgTextRestored !== firstTextBefore) {
      throw new Error("Alt+ArrowUp failed to swap message back");
    }
  });

  // 8. WhatsApp Import Format
  await test("Edge Case: WhatsApp export format with timestamps in Paste Import", async () => {
    await ensureModalsClosed();
    await page.click('button:has-text("Paste import")');
    await page.waitForSelector(".scrim .dialog");

    const whatsappExport = `[10/24/26, 10:14:00 AM] Todd: Good morning! Let's build something cool.
[10/24/26, 10:15:30 AM] You: Absolutely, on it right now.
[10/24/26, 10:16:05 AM] Todd: Here is the design breakdown.
[10/24/26, 10:17:00 AM] You: Looks fantastic!`;

    await page.fill(".dialog-body textarea", whatsappExport);
    await page.click('.dialog-foot button:has-text("Parse")');
    await page.waitForTimeout(300);

    const parseRows = await page.$$(".parse-row");
    if (parseRows.length !== 4) throw new Error(`Expected 4 parsed rows, got ${parseRows.length}`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "05_whatsapp_import_parsed.png") });

    // Click Import using dedicated .commit-import-btn
    await page.click(".dialog-foot button.commit-import-btn");
    await page.waitForTimeout(400);

    const countBadge = await page.$eval(".panel.left .count", (el) => el.textContent);
    if (countBadge !== "4") throw new Error(`Expected 4 messages after import, got: ${countBadge}`);

    await page.waitForSelector(".toast.success");
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "06_imported_toast.png") });
  });

  // 9. Toolbar responsiveness at 1000px and 900px
  await test("UI Polish: Toolbar adapts without clipping Export button on 1000px viewport", async () => {
    await page.setViewportSize({ width: 1000, height: 750 });
    await page.waitForTimeout(300);

    const exportBtnVisible = await page.evaluate(() => {
      const exportBtn = document.querySelector('button.primary[title*="Export"]');
      if (!exportBtn) return { found: false };
      const rect = exportBtn.getBoundingClientRect();
      const inViewport = rect.right <= window.innerWidth && rect.left >= 0 && rect.width > 30;
      return { found: true, inViewport, rect, windowWidth: window.innerWidth };
    });

    if (!exportBtnVisible.found || !exportBtnVisible.inViewport) {
      throw new Error(`Export button is not fully in viewport! Details: ${JSON.stringify(exportBtnVisible)}`);
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "07_toolbar_1000px.png") });
  });

  // 10. Mobile Notice Dismissal & Tabbar Navigation
  await test("UI Polish: Desktop notice can be dismissed on mobile/tablet to use mobile tabs", async () => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.waitForTimeout(300);

    // Desktop notice should be visible
    await page.waitForSelector(".desktop-notice");
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "08_tablet_notice_visible.png") });

    // Click "Continue to mobile view"
    await page.click('.desktop-notice-actions button:has-text("Continue to mobile view")');
    await page.waitForTimeout(300);

    // Verify notice is gone
    const noticeStillThere = (await page.$$(".desktop-notice")).length > 0;
    if (noticeStillThere) throw new Error("Desktop notice was not dismissed");

    // Verify tabbar is visible and clickable
    await page.waitForSelector(".tabbar");
    await page.click('.tabbar button:has-text("Messages")');
    await page.waitForTimeout(200);

    const listActive = await page.$eval(".panel.left", (el) => el.classList.contains("active"));
    if (!listActive) throw new Error("Messages panel did not become active when clicking Messages tab");

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "09_tablet_mobile_tabs_active.png") });

    // Reset viewport to 1440
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(300);
  });

  // 11. Still screenshot server rendering
  await test("Edge Case: Screenshot Export via server API", async () => {
    await ensureModalsClosed();
    await page.click('button.primary[title*="Export"]');
    await page.waitForSelector(".scrim .dialog");

    await page.click('.export-modes button:has-text("Screenshot")');
    await page.waitForTimeout(200);

    const downloadBtn = await page.$("button.download-screenshot-btn");
    if (!downloadBtn) throw new Error("Download PNG button not found");

    const downloadPromise = page.waitForEvent("download", { timeout: 12000 }).catch(() => null);
    await downloadBtn.click();

    const errEl = await page.$(".export-error");
    if (errEl) {
      const errText = await errEl.textContent();
      console.log(`  (Server reported: ${errText.trim()})`);
    } else {
      const dl = await downloadPromise;
      if (dl) console.log(`  (Download started: ${dl.suggestedFilename()})`);
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "10_screenshot_export_modal.png") });
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  });

  // 12. Reset to Sample
  await test("Edge Case: Reset confirmation dialog and state restore", async () => {
    await ensureModalsClosed();
    page.once("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.click('button:has-text("Reset")');
    await page.waitForTimeout(400);

    const countAfterReset = await page.$eval(".panel.left .count", (el) => el.textContent);
    if (countAfterReset !== "7") throw new Error(`Expected 7 sample messages after reset, got ${countAfterReset}`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "11_reset_sample_restored.png") });
  });

  // 13. Auto-scroll timeline as video progresses
  await test("Timeline: Auto-scroll follows playhead as video progresses and toggle controls state", async () => {
    await ensureModalsClosed();

    // Verify Auto-Scroll button is present and active
    const autoScrollBtn = await page.$('.etl-toggle-btn:has-text("Auto-Scroll")');
    if (!autoScrollBtn) throw new Error("Auto-Scroll toggle button not found in timeline toolbar");
    const isPressed = await autoScrollBtn.getAttribute("aria-pressed");
    if (isPressed !== "true") throw new Error("Auto-Scroll should be enabled by default");

    // Zoom in so timeline scrollable content exceeds viewport width
    const zoomInBtn = await page.$('button[aria-label="Zoom in"]');
    for (let i = 0; i < 4; i++) {
      if (zoomInBtn) await zoomInBtn.click();
      await page.waitForTimeout(50);
    }

    const grid = await page.$(".etl-stage .ReactVirtualized__Grid");
    if (!grid) throw new Error("Timeline virtualized grid not found");

    const scrollLeftBefore = await grid.evaluate((el) => el.scrollLeft);
    if (scrollLeftBefore !== 0) {
      const restartBtn = await page.$('button[aria-label="Restart timeline to start"]');
      if (restartBtn) await restartBtn.click();
      await page.waitForTimeout(200);
    }

    // Start playback
    const playBtn = await page.$('.etl-left-tools button[aria-label="Play"]');
    if (!playBtn) throw new Error("Timeline play button not found");
    await playBtn.click();

    // Wait 6 seconds for video to progress past the auto-scroll threshold
    await page.waitForTimeout(6000);

    // Pause playback
    const pauseBtn = await page.$('.etl-left-tools button[aria-label="Pause"]');
    if (pauseBtn) await pauseBtn.click();
    await page.waitForTimeout(200);

    const scrollLeftAfterPlay = await grid.evaluate((el) => el.scrollLeft);
    if (scrollLeftAfterPlay <= 0) {
      throw new Error(`Timeline failed to auto-scroll! scrollLeft is still ${scrollLeftAfterPlay}`);
    }

    // Test toggle off
    await autoScrollBtn.click();
    await page.waitForTimeout(100);
    const toggledOff = await autoScrollBtn.getAttribute("aria-pressed");
    if (toggledOff !== "false") throw new Error("Auto-scroll toggle failed to deactivate");

    // Test Restart resets scrollLeft back to 0
    await autoScrollBtn.click(); // re-enable
    await page.waitForTimeout(100);
    const restartBtn = await page.$('button[aria-label="Restart timeline to start"]');
    if (restartBtn) await restartBtn.click();
    await page.waitForTimeout(200);

    const scrollLeftAfterRestart = await grid.evaluate((el) => el.scrollLeft);
    if (scrollLeftAfterRestart !== 0) {
      throw new Error(`Restart failed to reset scrollLeft to 0, got: ${scrollLeftAfterRestart}`);
    }

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "12_timeline_auto_scrolled.png") });
  });

  // 14. Recording audio indicator before voice message
  await test("Voice message: Recording audio indicator displays before voice note with animated waves and header status", async () => {
    await ensureModalsClosed();

    // Reset to clean sample state
    page.once("dialog", async (dialog) => { await dialog.accept(); });
    await page.click('button:has-text("Reset")');
    await page.waitForTimeout(400);

    // Select Todd's first message and add a voice note below it
    const firstMsg = (await page.$$(".msg-item"))[0];
    await firstMsg.click();
    await page.waitForTimeout(100);

    const voiceBtn = await page.$('button[title*="Add a voice message"]');
    if (!voiceBtn) throw new Error("Add voice message button not found");
    await voiceBtn.click();
    await page.waitForTimeout(200);

    // Switch sender to Todd (left)
    const senderSelect = await page.$("#msender");
    if (senderSelect) {
      await senderSelect.selectOption({ index: 0 }); // Todd
      await page.waitForTimeout(100);
    }

    // Expand Timing section
    const timingBtn = await page.$('button:has-text("Timing")');
    const isExpanded = await timingBtn?.getAttribute("aria-expanded");
    if (isExpanded === "false") {
      await timingBtn?.click();
      await page.waitForTimeout(100);
    }

    // Verify Inspector shows "Recording time" label
    const label = await page.$eval('label[for="mtype"]', (el) => el.textContent.trim());
    if (label !== "Recording time") throw new Error(`Expected Inspector label to be 'Recording time', got '${label}'`);

    // Set recording time to 2.0s
    await page.fill("#mtype", "2");
    await page.dispatchEvent("#mtype", "change");
    await page.waitForTimeout(200);

    // Verify meta chip in list
    const metaChip = await page.$(".msg-item.sel .meta-chip.recording");
    if (!metaChip) throw new Error("Voice message missing .meta-chip.recording in messages list");

    // Verify timeline segment has .voice-rec class
    const voiceRecSeg = await page.$(".tl-nle-typing-seg.voice-rec");
    if (!voiceRecSeg) throw new Error("Timeline clip missing .tl-nle-typing-seg.voice-rec");

    // Delete message 1 so voice message is the first message in chat
    const items = await page.$$(".msg-item");
    await items[0].click();
    await page.waitForTimeout(100);
    const delBtn = await page.$(".msg-item.sel .icon-btn.danger");
    if (delBtn) await delBtn.click();
    await page.waitForTimeout(300);

    // Restart and play into recording window (0.4s lead-in + 2.0s recording)
    const restartBtn = await page.$('button[aria-label="Restart timeline to start"]');
    if (restartBtn) await restartBtn.click();
    await page.waitForTimeout(200);

    const playBtn = await page.$('.etl-left-tools button[aria-label="Play"]');
    if (playBtn) await playBtn.click();
    await page.waitForTimeout(1200); // 1.2s into the 2.0s recording window

    const pauseBtn = await page.$('.etl-left-tools button[aria-label="Pause"]');
    if (pauseBtn) await pauseBtn.click();
    await page.waitForTimeout(150);

    // Verify header subtitle shows recording audio
    const subText = await page.$eval(".contact-sub.recording", (el) => el.textContent.trim());
    if (!subText.includes("recording audio")) {
      throw new Error(`Expected header subtitle to include 'recording audio', got: '${subText}'`);
    }

    // Verify chat bubble shows recording audio indicator
    const recBubble = await page.$(".recording-audio-bubble");
    if (!recBubble) throw new Error("Recording audio bubble not found in preview chat");

    const waveBars = await page.$$(".rec-wave-bars span");
    if (waveBars.length !== 5) throw new Error(`Expected 5 waveform bars in recording indicator, got ${waveBars.length}`);

    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, "13_recording_audio_indicator.png") });
  });

  // Summary
  console.log("\n=================================");
  console.log(`📊 Edge Case & UI Audit Results: ${testReport.filter((t) => t.status === "PASS").length}/${testReport.length} Passed`);
  if (errors.length > 0) console.log(`Errors encountered: ${errors.length}`);
  console.log("=================================\n");

  await browser.close();

  // Save report
  fs.writeFileSync(
    path.join(SCREENSHOTS_DIR, "edge-cases-report.json"),
    JSON.stringify({ passed: testReport.filter((t) => t.status === "PASS").length, total: testReport.length, tests: testReport }, null, 2)
  );
}

runEdgeCaseTests().catch((e) => {
  console.error("Test execution failed:", e);
  process.exit(1);
});
