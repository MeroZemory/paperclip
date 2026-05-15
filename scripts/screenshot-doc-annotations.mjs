#!/usr/bin/env node
// Capture screenshots of the Document Annotation storybook stories.
// Usage: node scripts/screenshot-doc-annotations.mjs <storybook-static-dir> <output-dir>

import http from "node:http";
import path from "node:path";
import fs from "node:fs/promises";
import { chromium } from "@playwright/test";

async function main() {
  const [, , staticDir, outDir] = process.argv;
  if (!staticDir || !outDir) {
    console.error("usage: node scripts/screenshot-doc-annotations.mjs <storybook-static-dir> <output-dir>");
    process.exit(1);
  }
  await fs.mkdir(outDir, { recursive: true });
  const absStaticDir = path.resolve(staticDir);

  const server = http.createServer(async (req, res) => {
    try {
      let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
      if (urlPath.endsWith("/")) urlPath += "iframe.html";
      const filePath = path.resolve(absStaticDir, `.${urlPath}`);
      if (!filePath.startsWith(absStaticDir + path.sep) && filePath !== absStaticDir) {
        res.writeHead(403);
        res.end("Forbidden");
        return;
      }
      const buf = await fs.readFile(filePath);
      const ext = path.extname(filePath).toLowerCase();
      const mime = {
        ".html": "text/html; charset=utf-8",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff": "font/woff",
        ".woff2": "font/woff2",
        ".map": "application/json",
      }[ext] || "application/octet-stream";
      res.writeHead(200, { "content-type": mime });
      res.end(buf);
    } catch (err) {
      res.writeHead(404);
      res.end(String(err));
    }
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}/iframe.html`;

  const browser = await chromium.launch();
  try {
    const stories = [
      { id: "product-documents-annotations--desktop-open-focused", file: "01-desktop-open-focused.png", width: 1280, height: 900 },
      { id: "product-documents-annotations--desktop-resolved-focused", file: "02-desktop-resolved-focused.png", width: 1280, height: 900 },
      { id: "product-documents-annotations--desktop-stale-focused", file: "03-desktop-stale-focused.png", width: 1280, height: 900 },
      { id: "product-documents-annotations--desktop-orphaned-focused", file: "04-desktop-orphaned-focused.png", width: 1280, height: 900 },
      { id: "product-documents-annotations--dirty-draft-disables-new-comments", file: "05-dirty-draft-disabled.png", width: 720, height: 720 },
      { id: "product-documents-annotations--mobile-bottom-sheet-view", file: "06-mobile-bottom-sheet.png", width: 375, height: 812 },
    ];

    for (const story of stories) {
      const ctx = await browser.newContext({
        viewport: { width: story.width, height: story.height },
        deviceScaleFactor: 2,
        colorScheme: "light",
      });
      const page = await ctx.newPage();
      const url = `${baseUrl}?id=${story.id}&viewMode=story`;
      await page.goto(url, { waitUntil: "networkidle" });
      await page.evaluate(() => {
        document.documentElement.style.colorScheme = "light";
      });
      await page.waitForTimeout(700);
      const out = path.join(outDir, story.file);
      await page.screenshot({ path: out, fullPage: true });
      console.log("wrote", out);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
