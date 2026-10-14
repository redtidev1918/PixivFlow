import { promises as fs } from 'node:fs';
import type { Browser, PuppeteerNode } from 'puppeteer-core';
import { NovelBook, parseNovel } from './NovelDocument';
import { BookImage, imageKey } from './EpubExporter';
import { attribution, bookNavigation, novelCss, renderNovel, xml } from './NovelHtmlRenderer';

export interface PdfOptions { browserPath?: string; fontPath?: string; timeoutMs?: number }
const importPuppeteer = new Function('return import("puppeteer-core")') as () => Promise<{ default: PuppeteerNode }>;
let busy = false;

export async function writePdf(book: NovelBook, images: BookImage[], destination: string, options: PdfOptions): Promise<void> {
  const executablePath = options.browserPath || process.env.PIXIVFLOW_PDF_BROWSER;
  if (!executablePath) throw new Error('PDF_BROWSER_MISSING: set novelExport.pdf.browserPath or PIXIVFLOW_PDF_BROWSER to an optional Chrome/Chromium executable');
  try { await fs.access(executablePath); } catch { throw new Error('PDF_BROWSER_MISSING: configured browser executable is unavailable'); }
  if (busy) throw new Error('PDF_BUSY: one PDF render is already running; retry after it completes');
  busy = true;
  let browser: Browser | undefined;
  let timer: NodeJS.Timeout | undefined;
  const timeout = options.timeoutMs ?? 60_000;
  try {
    const byteSizes = new Map(images.map(i => [i.key, i.bytes.length]));
    let expandedBytes = 0;
    for (const doc of book.documents) for (const node of parseNovel(doc.rawText)) {
      if (node.type === 'image') expandedBytes += (byteSizes.get(imageKey(doc.id, node.marker)) ?? 0) * 4 / 3;
    }
    if (expandedBytes > 100 * 1024 * 1024) throw new Error('PDF_IMAGE_LIMIT: expanded image content exceeds 100 MiB');
    let fontCss = '';
    const fontPath = options.fontPath || process.env.PIXIVFLOW_PDF_FONT;
    if (fontPath) {
      const stat = await fs.stat(fontPath);
      if (!stat.isFile() || stat.size > 40 * 1024 * 1024) throw new Error('PDF_FONT_INVALID: font must be a file under 40 MiB');
      const bytes = await fs.readFile(fontPath);
      if (!['00010000', '4f54544f', '74746366'].includes(bytes.subarray(0, 4).toString('hex'))) throw new Error('PDF_FONT_INVALID: expected TTF, OTF or TTC font');
      fontCss = `@font-face { font-family: ExportFont; src: url(data:font/otf;base64,${bytes.toString('base64')}); } body { font-family: ExportFont, serif; }`;
    }
    const byKey = new Map(images.map(i => [i.key, `data:${i.mime};base64,${i.bytes.toString('base64')}`]));
    const rendered = book.documents.map((doc, i) => renderNovel(doc, `w${i}`, marker => {
      const url = byKey.get(imageKey(doc.id, marker));
      if (!url) throw new Error(`NOVEL_IMAGE_MISSING: ${doc.id} ${marker}`);
      return url;
    }));
    const cover = byKey.get(imageKey(book.documents[0].id, 'cover'));
    const html = `<!DOCTYPE html><html lang="${xml(book.documents[0].language)}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:"><title>${xml(book.title)}</title><style>${novelCss}${fontCss}</style></head><body><section class="cover"><h1>${xml(book.title)}</h1>${cover ? `<img src="${cover}" alt="Cover">` : ''}${attribution(book.documents[0])}</section>${bookNavigation(book, rendered, false)}${book.documents.map((doc, i) => `<section class="work" id="work-${i}"><h1>${xml(doc.title)}</h1>${rendered[i].body}</section>`).join('')}</body></html>`;
    const puppeteer = (await importPuppeteer()).default;
    // Keep Chromium's sandbox enabled. Docker users run as a non-root user.
    browser = await puppeteer.launch({ executablePath, headless: true, timeout, protocolTimeout: timeout });
    const activeBrowser = browser;
    timer = setTimeout(() => { activeBrowser.process()?.kill(); }, timeout);
    timer.unref();
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on('request', req => { void (req.url().startsWith('data:') || req.url() === 'about:blank' ? req.continue() : req.abort()); });
    await page.setContent(html, { waitUntil: 'load', timeout });
    await page.evaluate('document.fonts.ready');
    const imagesOk = await page.evaluate('Array.from(document.images).every(i => i.complete && i.naturalWidth > 0)');
    if (!imagesOk) throw new Error('PDF_IMAGE_DECODE_FAILED: an illustration could not be decoded');
    if (/[\u3000-\u9fff]/u.test(book.documents.map(d => d.title + d.rawText).join('')) && !fontPath) {
      // Inspect fonts actually used by Chromium, including CJK fallback fonts.
      const session = await page.createCDPSession();
      await session.send('DOM.enable'); await session.send('CSS.enable');
      const root = await session.send('DOM.getDocument');
      const nodes = await session.send('DOM.querySelectorAll', { nodeId: root.root.nodeId, selector: 'p, h1, h2, rt' });
      const families = new Set<string>();
      for (const nodeId of nodes.nodeIds.slice(0, 200)) {
        const fonts = await session.send('CSS.getPlatformFontsForNode', { nodeId });
        fonts.fonts.forEach(f => families.add(f.familyName));
      }
      if (![...families].some(f => /CJK|Noto.*(JP|SC|TC)|YaHei|Meiryo|Yu |Gothic|Mincho|SimSun|SimHei|PingFang|Hiragino|Songti|Heiti|DengXian/i.test(f))) {
        throw new Error('PDF_CJK_FONT_MISSING: install Noto CJK fonts or configure novelExport.pdf.fontPath');
      }
    }
    await page.pdf({ path: destination, format: 'A4', printBackground: true, preferCSSPageSize: true,
      displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;text-align:center;font-size:9px"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
      margin: { top: '20mm', right: '18mm', bottom: '22mm', left: '18mm' }, tagged: true, outline: true, timeout });
  } finally {
    if (timer) clearTimeout(timer);
    try { await browser?.close(); } finally { busy = false; }
  }
}
