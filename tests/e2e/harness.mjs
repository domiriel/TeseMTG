// Shared browser harness for the end-to-end tests and the browser benchmark.
// Serves the repo root with a tiny static server and drives the system Chrome
// through Playwright (no browser download needed).

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
};

export function startServer(root = REPO_ROOT) {
  const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let filePath = path.join(root, urlPath);
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end();
      return;
    }
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, "index.html");
    }
    if (!fs.existsSync(filePath)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(filePath)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    fs.createReadStream(filePath).pipe(res);
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ url: `http://127.0.0.1:${port}/`, close: () => server.close() });
    });
  });
}

// Selectors that exist both before and after the refactor.
export const READY_CHECK = () =>
  document.querySelectorAll(".FilterPanel .filter-option").length > 0 &&
  document.querySelectorAll(".IcicleChart rect.icicle-rect").length > 0 &&
  document.querySelectorAll(".AlluvialChart path.link").length > 0 &&
  document.querySelectorAll(".TimelineView .set-rect").length > 0 &&
  document.querySelector(".LineChart svg") !== null &&
  document.querySelector(".Scatterplot svg") !== null;

export async function launch({ viewport = { width: 1600, height: 1000 } } = {}) {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport });
  // Card images come from Scryfall; block them so runs are offline-stable.
  await context.route(/cards\.scryfall\.io/, (route) => route.abort());
  const page = await context.newPage();
  const consoleErrors = [];
  const notFound = [];
  page.on("response", (res) => {
    if (res.status() === 404) notFound.push(new URL(res.url()).pathname);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    // Resource failures are tracked via `notFound` / our own image blocking.
    if (text.startsWith("Failed to load resource")) return;
    consoleErrors.push(text);
  });
  page.on("pageerror", (err) => consoleErrors.push(String(err)));
  return { browser, context, page, consoleErrors, notFound };
}

export async function openApp(page, url) {
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(READY_CHECK, null, { timeout: 180_000, polling: 100 });
  // Let any trailing timers/frames settle.
  await page.evaluate(() => new Promise((r) => setTimeout(r, 300)));
  return Date.now() - t0;
}

// Installs capture-phase listeners that timestamp the start of the next input
// event of each type, so we can measure "event start → next painted frame"
// inside the page (excludes Playwright IPC overhead).
export async function installProbes(page) {
  await page.evaluate(() => {
    window.__probe = {};
    for (const type of ["click", "mousemove", "mouseover", "wheel", "resize", "contextmenu"]) {
      const target = type === "resize" ? window : document;
      target.addEventListener(
        type,
        () => {
          if (window.__probe[type] == null) window.__probe[type] = performance.now();
        },
        { capture: true }
      );
    }
    window.__resetProbe = () => (window.__probe = {});
    // Main-thread blocking: sum of long tasks (>50 ms) since the last reset.
    window.__longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.__longTasks.push(e);
    }).observe({ type: "longtask" });
    window.__blockingSince = (t) =>
      window.__longTasks.filter((e) => e.startTime >= t).reduce((a, e) => a + e.duration, 0);
    window.__afterFrames = () =>
      new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(performance.now()))));
  });
}

export async function measure(page, type, action) {
  await page.evaluate(() => window.__resetProbe());
  await action();
  return page.evaluate(async (t) => {
    const end = await window.__afterFrames();
    const start = window.__probe[t];
    return start == null ? null : end - start;
  }, type);
}

export async function heapMB(page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Performance.enable");
  await cdp.send("HeapProfiler.collectGarbage");
  const { metrics } = await cdp.send("Performance.getMetrics");
  const used = metrics.find((m) => m.name === "JSHeapUsedSize").value;
  return used / 1024 / 1024;
}

export function median(xs) {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (v.length === 0) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
