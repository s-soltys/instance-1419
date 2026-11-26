import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(process.cwd());
const DIST_DIR = path.join(ROOT, 'dist');
const OUT_DIR = path.join(ROOT, 'artifacts', 'e2e-visual');
const CAPTURE_ALL = process.env.E2E_CAPTURE_ALL === '1';

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

function findBrowserExecutable() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) {
    return process.env.CHROME_PATH;
  }

  const macChrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (fs.existsSync(macChrome)) return macChrome;

  const cacheDir = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
  if (fs.existsSync(cacheDir)) {
    const dirs = fs.readdirSync(cacheDir).sort().reverse();
    for (const d of dirs) {
      const candidates = [
        path.join(cacheDir, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'),
        path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'),
        path.join(cacheDir, d, 'chrome-linux', 'chrome'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) return c;
      }
    }
  }

  if (fs.existsSync('/usr/bin/google-chrome')) return '/usr/bin/google-chrome';
  throw new Error('No Chromium or Google Chrome executable found. Set CHROME_PATH or install Chrome.');
}

function startStaticServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqPath = (req.url || '/').split('?')[0];
      const safeRel = path.normalize(reqPath === '/' ? 'index.html' : reqPath).replace(/^(\.\.[/\\])+/, '');
      let filePath = path.join(DIST_DIR, safeRel);
      if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        filePath = path.join(DIST_DIR, 'index.html');
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      fs.createReadStream(filePath).pipe(res);
    });
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve({ server, port: addr.port });
    });
  });
}

async function ensureQaOpen(page) {
  const isOpen = await page.evaluate(() =>
    document.querySelector('#qa-drawer')?.classList.contains('open')
  );
  if (!isOpen) {
    await page.click('#qa-pull-tab');
    await page.waitForSelector('#qa-drawer.open');
  }
}

async function ensureQaClosed(page) {
  const isOpen = await page.evaluate(() =>
    document.querySelector('#qa-drawer')?.classList.contains('open')
  );
  if (isOpen) {
    await page.click('#qa-close-btn');
    await page.waitForSelector('#qa-drawer:not(.open)', { timeout: 3000 });
    await page.waitForTimeout(260);
  }
}

async function saveCheckedScreenshot(page, filename) {
  const fullPath = path.join(OUT_DIR, filename);
  await page.screenshot({ path: fullPath, animations: 'disabled', timeout: 45000 });
  const stat = fs.statSync(fullPath);
  if (stat.size < 8000) {
    throw new Error(`Screenshot ${filename} is suspiciously small (${stat.size} bytes)`);
  }
  return fullPath;
}

async function run() {
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    throw new Error('dist/index.html missing. Run `npm run build` before E2E verification.');
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const executablePath = findBrowserExecutable();
  const { server, port } = await startStaticServer();
  const url = `http://127.0.0.1:${port}/?dev=1`;

  const errors = [];
  let browser;

  try {
    browser = await chromium.launch({
      executablePath,
      headless: true,
      args: [
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-webgl',
        '--ignore-gpu-blocklist',
        '--no-sandbox',
      ],
    });

    // === DESKTOP 1280x720 ===
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();

    page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message || err}`));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[console.error] ${msg.text()}`);
    });
    page.on('response', (res) => {
      if (res.status() >= 400) errors.push(`[http ${res.status()}] ${res.url()}`);
    });

    // Flow 1: Interactive Prologue (Kitchen -> 5-Phase Wakeup Briefing -> Live-Cosmos Title Beat)
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('#boot-screen:not(.hidden)');
    await page.waitForSelector('#qa-drawer');
    await ensureQaClosed(page);

    const inspectLayerCount = await page.locator('#inspect-layer').count();
    if (inspectLayerCount !== 0) {
      throw new Error(`Expected removed #inspect-layer count to be 0, found ${inspectLayerCount}`);
    }
    const whisperCount = await page.locator('#psyche-whisper').count();
    if (whisperCount !== 0) {
      throw new Error(`Expected removed #psyche-whisper count to be 0, found ${whisperCount}`);
    }

    // Step through interactive Prologue into live-cosmos Title (Intake Assistant + 5-phase Wakeup Briefing)
    let capturedAssistant = false;
    for (let i = 0; i < 140; i++) {
      const visual = await page.evaluate(() => document.querySelector('#boot-screen')?.dataset.bootVisual ?? '');
      if (visual === 'title') break;
      if (!capturedAssistant && visual === 'prologue_assistant' && i >= 3) {
        capturedAssistant = true;
        await page.waitForTimeout(350);
        await saveCheckedScreenshot(page, '00b_prologue_assistant.png');
      }
      const continueBtn = page.locator('#prologue-choices:not(.is-locked) .prologue-continue-bar').first();
      const advChoiceBtn = page.locator('#prologue-choices:not(.is-locked) .choice-line:not([data-choice-kind="ask"])').first();
      const anyChoiceBtn = page.locator('#prologue-choices:not(.is-locked) .choice-line').first();
      if ((await advChoiceBtn.count()) > 0 && (await advChoiceBtn.isVisible())) {
        await advChoiceBtn.click({ force: true });
      } else if ((await anyChoiceBtn.count()) > 0 && (await anyChoiceBtn.isVisible())) {
        await anyChoiceBtn.click({ force: true });
      } else if ((await continueBtn.count()) > 0 && (await continueBtn.isVisible())) {
        await continueBtn.click({ force: true });
      } else {
        await page.mouse.click(640, 360);
      }
      await page.waitForTimeout(420);
    }
    await page.waitForSelector('#title-overlay:not(.hidden)', { timeout: 6000 });
    await page.waitForTimeout(260);
    await saveCheckedScreenshot(page, '01_boot.png');

    // Flow 2: Single-CTA Open Aperture -> Scan Target #1 -> Full Sandbox Sky Aperture
    await page.click('#btn-title-primary');
    await page.waitForSelector('#optics-layer:not(.hidden)', { timeout: 6000 });
    const opticsCanvasBox = await page.locator('#optics-mount canvas').boundingBox();
    if (!opticsCanvasBox || opticsCanvasBox.width < 800 || opticsCanvasBox.height < 400) {
      throw new Error(`3D Optics canvas box invalid: ${JSON.stringify(opticsCanvasBox)}`);
    }
    await page.waitForTimeout(450);

    // Jump to full sandbox via DevHarness to inspect full bearing index, settings, and codex
    await ensureQaOpen(page);
    await page.click('[data-qa-tab="scenes"]');
    await page.click('[data-intro-jump="complete"]');
    await ensureQaClosed(page);
    await page.waitForSelector('[data-bearing-id="cluster_j1419_a"]', { timeout: 4000 });
    await page.click('[data-bearing-id="cluster_j1419_a"]');
    await page.waitForTimeout(450);
    await saveCheckedScreenshot(page, '02_sky_aperture.png');

    // Flow 2b: Settings Screen (Audio/Voice toggles, Display, Auto-generated Credits)
    await page.click('#btn-settings');
    await page.waitForSelector('#settings-overlay:not(.hidden)', { timeout: 3000 });
    await page.waitForTimeout(150);
    const nativeRangeCount = await page.locator('#settings-overlay input[type="range"]').count();
    if (nativeRangeCount > 0) {
      throw new Error(`Expected 0 native <input type="range"> controls in Settings, found ${nativeRangeCount}`);
    }
    await page.click('#toggle-music');
    await page.click('#toggle-voice');
    await saveCheckedScreenshot(page, '02b_settings_audio.png');
    await page.click('#toggle-music');
    await page.click('#toggle-voice');
    await page.click('[data-settings-tab="credits"]');
    await page.waitForTimeout(120);
    const creditCount = await page.locator('#settings-overlay .credit-item').count();
    if (creditCount < 10) {
      throw new Error(`Expected auto-generated MANIFEST credits (>=10), found ${creditCount}`);
    }
    await saveCheckedScreenshot(page, '02c_settings_credits.png');
    await page.click('#btn-settings-close');
    await page.waitForSelector('#settings-overlay', { state: 'hidden', timeout: 3000 });

    // Flow 2c: Wake-World Survey Codex (Evidence + Celestial JWST plate + H%-reactive notes)
    await page.click('#btn-codex');
    await page.waitForSelector('#codex-overlay:not(.hidden)', { timeout: 3000 });
    await page.click('[data-codex-cat="celestial"]');
    await page.click('[data-codex-entry="celestial_carina_rift"]');
    await page.waitForFunction(
      () => {
        const img = document.querySelector('#codex-overlay .codex-plate-img');
        return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
      },
      { timeout: 5000 }
    );
    await page.evaluate(async () => {
      const img = document.querySelector('#codex-overlay .codex-plate-img');
      if (img instanceof HTMLImageElement && typeof img.decode === 'function') {
        await img.decode().catch(() => {});
      }
    });
    await page.waitForTimeout(120);
    await saveCheckedScreenshot(page, '02d_codex_celestial.png');
    await page.click('#btn-codex-close');
    await page.waitForSelector('#codex-overlay', { state: 'hidden', timeout: 3000 });

    // Flow 3: All 21 Cosmic Instruments (V1 default + V2 variant spot-checks + Warm/Cold)
    const instruments = [
      { id: 'wave_shaper', code: 'WAV-01', checkCold: true, checkV2: true, capture: true },
      { id: 'constellation_recall', code: 'CON-02', checkCold: false, checkV2: false, capture: true },
      { id: 'pulsar_echo', code: 'PLS-03', checkCold: false, checkV2: false, capture: true },
      { id: 'lens_focus', code: 'LNS-04', checkCold: false, checkV2: true, capture: true },
      { id: 'light_dispersion', code: 'DSP-05', checkCold: false, checkV2: false, capture: false },
      { id: 'blink_spotter', code: 'BLK-06', checkCold: false, checkV2: false, capture: true },
      { id: 'gravity_slingshot', code: 'ORB-07', checkCold: false, checkV2: false, capture: false },
      { id: 'exoplanet_transit', code: 'TRN-08', checkCold: false, checkV2: false, capture: false },
      { id: 'spectral_prism', code: 'PRM-09', checkCold: false, checkV2: false, capture: false },
      { id: 'radio_triangulation', code: 'TRI-10', checkCold: false, checkV2: false, capture: false },
      { id: 'coronagraph_mask', code: 'COR-11', checkCold: false, checkV2: false, capture: true },
      { id: 'polarization_filter', code: 'POL-12', checkCold: false, checkV2: false, capture: true },
      { id: 'exposure_stacker', code: 'EXP-13', checkCold: false, checkV2: true, capture: true },
      { id: 'binary_mass_scale', code: 'BIN-14', checkCold: false, checkV2: false, capture: true },
      { id: 'cepheid_ladder', code: 'CEP-15', checkCold: false, checkV2: true, capture: true },
      { id: 'supernova_echoes', code: 'ECH-16', checkCold: false, checkV2: false, capture: true },
      { id: 'horizon_seam_stitcher', code: 'SEM-17', checkCold: false, checkV2: false, capture: false },
      { id: 'michelson_fringe', code: 'INT-18', checkCold: true, checkV2: false, capture: true },
      { id: 'multiband_loupe', code: 'BND-19', checkCold: false, checkV2: false, capture: true },
      { id: 'einstein_cross', code: 'MIR-20', checkCold: false, checkV2: false, capture: true },
      { id: 'parallax_depth', code: 'PRX-21', checkCold: false, checkV2: false, capture: true },
    ];

    for (const inst of instruments) {
      await ensureQaOpen(page);
      await page.click('[data-qa-tab="minigames"]');
      await page.click('[data-mg-warmth="82,45"]');
      await page.click('[data-mg-variant="0"]');
      await page.click(`[data-launch-mg="${inst.id}"]`);

      await page.waitForSelector('#minigame-overlay:not(.hidden)', { timeout: 8000 });
      await page.waitForSelector('#minigame-mount canvas.minigame-canvas', { timeout: 4000 });
      await ensureQaClosed(page);
      await page.waitForTimeout(120);

      const codeText = (await page.textContent('#mg-instrument-code'))?.trim();
      if (codeText !== inst.code) {
        throw new Error(`Expected instrument code ${inst.code}, got "${codeText}"`);
      }

      const canvasBox = await page.locator('#minigame-mount canvas.minigame-canvas').boundingBox();
      if (!canvasBox || canvasBox.width < 1000 || canvasBox.height < 600) {
        throw new Error(`Instrument ${inst.id} canvas bounding box too small: ${JSON.stringify(canvasBox)}`);
      }

      // Confirm Top-Left HUD stays on 1 clean row AND does not overlap centered QA pull-tab
      const topLeftBox = await page.locator('.mg-top-left').boundingBox();
      const qaBtnBox = await page.locator('#qa-pull-tab').boundingBox();
      if (topLeftBox && topLeftBox.height > 36) {
        throw new Error(`Top-left HUD wrapped onto 2 rows on ${inst.id}: height=${topLeftBox.height}`);
      }
      if (topLeftBox && qaBtnBox && topLeftBox.x + topLeftBox.width > qaBtnBox.x - 4) {
        throw new Error(`Top-left HUD overlapped QA pull-tab on ${inst.id}: topLeftRight=${topLeftBox.x + topLeftBox.width}, qaLeft=${qaBtnBox.x}`);
      }

      const consoleBox = await page.locator('.mg-bottom-console').boundingBox();
      if (!consoleBox || consoleBox.y + consoleBox.height > 725) {
        throw new Error(`Bottom console clipped/missing for ${inst.id}: ${JSON.stringify(consoleBox)}`);
      }

      // Exercise direct canvas drag + Field Guide toggle
      await page.mouse.move(640, 360);
      await page.mouse.down();
      await page.mouse.move(720, 350, { steps: 3 });
      await page.mouse.up();
      await page.click('#mg-btn-guide');
      await page.waitForSelector('#mg-field-guide-card:not(.hidden)', { timeout: 2000 });
      const v1GuideTitle = (await page.textContent('#mg-guide-title'))?.trim() ?? '';
      await page.click('#mg-btn-guide-close');
      await page.waitForTimeout(80);

      if (CAPTURE_ALL || inst.capture) {
        await saveCheckedScreenshot(page, `03_mg_${inst.id}_warm.png`);
      }

      if (inst.checkV2) {
        await ensureQaOpen(page);
        await page.click('[data-qa-tab="minigames"]');
        await page.click('[data-mg-variant="1"]');
        await page.click(`[data-launch-mg="${inst.id}"]`);
        await page.waitForSelector('#minigame-overlay:not(.hidden)', { timeout: 8000 });
        await ensureQaClosed(page);
        await page.waitForTimeout(120);
        await page.click('#mg-btn-guide');
        await page.waitForSelector('#mg-field-guide-card:not(.hidden)', { timeout: 2000 });
        const v2GuideTitle = (await page.textContent('#mg-guide-title'))?.trim() ?? '';
        await page.click('#mg-btn-guide-close');
        if (v2GuideTitle === v1GuideTitle) {
          throw new Error(`Variant V2 did not change Field Guide variant label on ${inst.id}: "${v2GuideTitle}"`);
        }
        await saveCheckedScreenshot(page, `03_mg_${inst.id}_v2.png`);
      }

      if (inst.checkCold) {
        await ensureQaOpen(page);
        await page.click('[data-qa-tab="minigames"]');
        await page.click('[data-mg-warmth="28,88"]');
        await ensureQaClosed(page);
        await page.waitForSelector('#minigame-overlay[data-vibe="cold"]', { timeout: 4000 });
        await page.waitForTimeout(100);
        await saveCheckedScreenshot(page, `04_mg_${inst.id}_cold.png`);
      }

      await page.click('#mg-btn-close');
      await page.waitForSelector('#minigame-overlay', { state: 'hidden', timeout: 3000 });
    }

    // Flow 4: 2D Dream Cache & Dialogue Progression
    await ensureQaOpen(page);
    await page.click('[data-qa-tab="scenes"]');
    await page.click('[data-scene-mode="dream_2d"]');
    await page.waitForSelector('#dream-layer:not(.hidden)', { timeout: 6000 });
    await page.waitForSelector('#optics-layer', { state: 'hidden', timeout: 5000 });
    await ensureQaClosed(page);
    await page.waitForTimeout(200);
    const codexVisibleInDream = await page.locator('#btn-codex').isVisible();
    if (codexVisibleInDream) {
      throw new Error('Wake-World Codex button must not be visible inside 2D Dream View');
    }
    const choiceCount = await page.locator('#dream-layer .choice-line').count();
    if (choiceCount > 0) {
      await page.locator('#dream-layer .choice-line').first().click();
      await page.waitForTimeout(300);
    }
    await saveCheckedScreenshot(page, '05_dream_cache.png');
    await context.close();

    // === MOBILE LANDSCAPE 844x390 ===
    const mobileCtx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      hasTouch: true,
      isMobile: true,
      deviceScaleFactor: 2,
    });
    const mPage = await mobileCtx.newPage();
    mPage.on('pageerror', (err) => errors.push(`[mobile pageerror] ${err.message || err}`));
    mPage.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(`[mobile console.error] ${msg.text()}`);
    });

    await mPage.goto(url, { waitUntil: 'networkidle' });
    await ensureQaOpen(mPage);
    await mPage.click('[data-qa-tab="scenes"]');
    await mPage.click('[data-intro-jump="complete"]');
    await ensureQaClosed(mPage);
    await mPage.waitForSelector('#optics-layer:not(.hidden)', { timeout: 6000 });
    await mPage.click('#btn-settings');
    await mPage.waitForSelector('#settings-overlay:not(.hidden)', { timeout: 3000 });
    await mPage.waitForTimeout(140);
    await saveCheckedScreenshot(mPage, '06_mobile_844x390_settings.png');
    await mPage.click('#btn-settings-close');
    await mPage.waitForSelector('#settings-overlay', { state: 'hidden', timeout: 3000 });

    await mPage.click('#btn-codex');
    await mPage.waitForSelector('#codex-overlay:not(.hidden)', { timeout: 3000 });
    await mPage.click('[data-codex-cat="celestial"]');
    await mPage.click('[data-codex-entry="celestial_carina_rift"]');
    await mPage.waitForFunction(
      () => {
        const img = document.querySelector('#codex-overlay .codex-plate-img');
        return img instanceof HTMLImageElement && img.complete && img.naturalWidth > 0;
      },
      { timeout: 5000 }
    );
    await mPage.waitForTimeout(140);
    await saveCheckedScreenshot(mPage, '06_mobile_844x390_codex.png');
    await mPage.click('#btn-codex-close');
    await mPage.waitForSelector('#codex-overlay', { state: 'hidden', timeout: 3000 });
    const mobileTargets = [
      'lens_focus',
      'exposure_stacker',
      'cepheid_ladder',
      'supernova_echoes',
      'multiband_loupe',
      'einstein_cross',
      'parallax_depth',
    ];
    for (const mobileId of mobileTargets) {
      await ensureQaOpen(mPage);
      await mPage.click('[data-qa-tab="minigames"]');
      await mPage.click('[data-mg-variant="0"]');
      await mPage.click(`[data-launch-mg="${mobileId}"]`);
      await mPage.waitForSelector('#minigame-overlay:not(.hidden)', { timeout: 8000 });
      await ensureQaClosed(mPage);
      await mPage.waitForSelector('#minigame-overlay:not(.is-entering)', { timeout: 2500 }).catch(() => {});
      await mPage.waitForFunction(
        () => {
          const overlay = document.querySelector('#minigame-overlay');
          const con = document.querySelector('.mg-bottom-console');
          if (!overlay || !con) return false;
          const t1 = getComputedStyle(overlay).transform;
          const t2 = getComputedStyle(con).transform;
          return (t1 === 'none' || t1 === 'matrix(1, 0, 0, 1, 0, 0)') && (t2 === 'none' || t2 === 'matrix(1, 0, 0, 1, 0, 0)');
        },
        { timeout: 2500 }
      ).catch(() => {});
      await mPage.waitForTimeout(120);

      const mConsoleBox = await mPage.locator('.mg-bottom-console').boundingBox();
      if (!mConsoleBox || mConsoleBox.y + mConsoleBox.height > 394) {
        throw new Error(`Mobile 844x390 bottom console clipped on ${mobileId}: ${JSON.stringify(mConsoleBox)}`);
      }
      await saveCheckedScreenshot(mPage, `06_mobile_844x390_${mobileId}.png`);
      await mPage.click('#mg-btn-close');
      await mPage.waitForSelector('#minigame-overlay', { state: 'hidden', timeout: 3000 });
    }
    await mobileCtx.close();
  } finally {
    if (browser) await browser.close();
    server.close();
  }

  if (errors.length > 0) {
    for (const e of errors) console.error(e);
    throw new Error(`E2E verification failed with ${errors.length} runtime/network error(s).`);
  }

  console.log('[e2e-visual] PASS: Boot, Sky Aperture, all 21 Cosmic Instruments (Desktop 1280x720 + V1/V2 Variants + 7 Mobile 844x390 targets), Field Guide, Cold/Warm themes, and 2D Dream verified with 0 errors.');
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
