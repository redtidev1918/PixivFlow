import { NovelBook, NovelDocument, parseNovel, safeLink } from './NovelDocument';

export const novelCss = `
body { font-family: "Noto Serif CJK SC", "Noto Serif CJK JP", "Microsoft YaHei", "Yu Mincho", "PingFang SC", serif; line-height: 1.85; overflow-wrap: anywhere; }
p { white-space: pre-wrap; margin: .6em 0; orphans: 3; widows: 3; }
h1, h2, h3 { line-height: 1.4; break-after: avoid; }
img { max-width: 100%; max-height: 230mm; object-fit: contain; }
figure { margin: 1em 0; text-align: center; break-inside: avoid; }
rt { font-size: .55em; } a { color: #285078; }
.page-break, .work { break-before: page; }
.cover { text-align: center; break-after: page; }
.cover img { max-height: 220mm; }
nav { break-after: page; } li { margin: .3em 0; }
@page { size: A4; margin: 20mm 18mm 22mm; }
`;

/** XML 1.0 safe escaping, including lone surrogates and prohibited controls. */
export function xml(value: string): string {
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udfff]/gu, '\ufffd')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

export interface RenderedNovel { body: string; headings: Array<{ id: string; title: string }> }

export function renderNovel(doc: NovelDocument, prefix: string, imageUrl: (marker: string) => string): RenderedNovel {
  const nodes = parseNovel(doc.rawText);
  const pageCount = 1 + nodes.filter(n => n.type === 'newpage').length;
  const headings: RenderedNovel['headings'] = [];
  let page = 1;
  let paragraph = '';
  let body = `<span id="${prefix}-page-1"></span>`;
  const flush = () => { if (paragraph) body += `<p>${paragraph}</p>`; paragraph = ''; };
  for (const node of nodes) {
    switch (node.type) {
      case 'text': {
        const lines = node.value.replace(/\r\n?/g, '\n').split('\n');
        lines.forEach((line, index) => { if (index) paragraph += '<br />'; paragraph += xml(line); });
        // Blank lines are paragraph boundaries, single newlines stay line breaks.
        const parts = paragraph.split('<br /><br />');
        for (let i = 0; i < parts.length - 1; i++) { paragraph = parts[i] || '<br />'; flush(); }
        paragraph = parts[parts.length - 1];
        break;
      }
      case 'chapter': {
        flush(); const id = `${prefix}-chapter-${headings.length + 1}`;
        headings.push({ id, title: node.title });
        body += `<h2 id="${id}">${xml(node.title)}</h2>`; break;
      }
      case 'newpage': flush(); body += `<div class="page-break" id="${prefix}-page-${++page}"></div>`; break;
      case 'ruby': paragraph += `<ruby>${xml(node.base)}<rp>(</rp><rt>${xml(node.reading)}</rt><rp>)</rp></ruby>`; break;
      case 'link': paragraph += `<a href="${xml(node.url)}">${xml(node.label)}</a>`; break;
      case 'jump': paragraph += node.page <= pageCount ? `<a href="#${prefix}-page-${node.page}">→ ${node.page}</a>` : xml(`[jump:${node.page}]`); break;
      case 'image': flush(); body += `<figure><img src="${xml(imageUrl(node.marker))}" alt="${xml(node.marker)}" /></figure>`; break;
    }
  }
  flush();
  return { body, headings };
}

export function xhtml(title: string, language: string, body: string, css = 'style.css'): string {
  return `<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html><html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${xml(language)}" lang="${xml(language)}"><head><meta charset="utf-8"/><title>${xml(title)}</title><link rel="stylesheet" type="text/css" href="${css}"/></head><body>${body}</body></html>`;
}

export function attribution(doc: NovelDocument): string {
  return `<p>${xml(doc.author)}</p>${safeLink(doc.sourceUrl) ? `<p><a href="${xml(doc.sourceUrl)}">${xml(doc.sourceUrl)}</a></p>` : ''}${doc.publishedAt ? `<p>${xml(doc.publishedAt)}</p>` : ''}<p>${doc.tags.map(xml).join(' · ')}</p>`;
}

export function bookNavigation(book: NovelBook, rendered: RenderedNovel[], fileLinks: boolean): string {
  return `<nav epub:type="toc" id="toc"><h1>目录 / Contents</h1><ol>${book.documents.map((doc, index) => {
    const file = fileLinks ? `work-${index}.xhtml` : '';
    return `<li><a href="${file}#work-${index}">${xml(doc.title)}</a>${rendered[index].headings.length ? `<ol>${rendered[index].headings.map(h => `<li><a href="${file}#${h.id}">${xml(h.title)}</a></li>`).join('')}</ol>` : ''}</li>`;
  }).join('')}</ol></nav>`;
}
