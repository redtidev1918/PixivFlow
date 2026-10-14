import { createZipArchive, ArchiveEntry } from '../../utils/zip';
import { NovelBook } from './NovelDocument';
import { attribution, bookNavigation, novelCss, renderNovel, xhtml, xml } from './NovelHtmlRenderer';

export interface BookImage { key: string; name: string; mime: string; bytes: Buffer }
export const imageKey = (id: string, marker: string) => `${id}:${marker}`;

export async function writeEpub(book: NovelBook, images: BookImage[], destination: string): Promise<void> {
  const first = book.documents[0];
  const byKey = new Map(images.map(i => [i.key, i]));
  const rendered = book.documents.map((d, index) => renderNovel(d, `w${index}`, marker => {
    const image = byKey.get(imageKey(d.id, marker));
    if (!image) throw new Error(`NOVEL_IMAGE_MISSING: ${d.id} ${marker}`);
    return image.name;
  }));
  const cover = byKey.get(imageKey(first.id, 'cover'));
  const entries: ArchiveEntry[] = [
    { name: 'mimetype', data: 'application/epub+zip', store: true },
    { name: 'META-INF/container.xml', data: '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="EPUB/package.opf" media-type="application/oebps-package+xml"/></rootfiles></container>' },
    { name: 'EPUB/style.css', data: novelCss },
    { name: 'EPUB/nav.xhtml', data: xhtml('Contents', first.language, bookNavigation(book, rendered, true)) },
  ];
  if (cover) entries.push({ name: 'EPUB/cover.xhtml', data: xhtml(book.title, first.language, `<section class="cover" epub:type="cover"><h1>${xml(book.title)}</h1><img src="${cover.name}" alt="Cover"/></section>`) });
  book.documents.forEach((doc, index) => entries.push({ name: `EPUB/work-${index}.xhtml`, data: xhtml(doc.title, doc.language, `<section id="work-${index}"><h1>${xml(doc.title)}</h1>${attribution(doc)}${rendered[index].body}</section>`) }));
  for (const image of images) entries.push({ name: `EPUB/${image.name}`, data: image.bytes });
  const uniqueImages = images.filter((v, index) => images.findIndex(i => i.name === v.name) === index);
  const modified = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const metadata = `<dc:identifier id="book-id">urn:pixiv:${xml(book.id)}</dc:identifier><dc:title>${xml(book.title)}</dc:title>${[...new Set(book.documents.map(d => d.author))].map(a => `<dc:creator>${xml(a)}</dc:creator>`).join('')}${[...new Set(book.documents.map(d => d.language))].map(l => `<dc:language>${xml(l)}</dc:language>`).join('')}<dc:source>${xml(first.sourceUrl)}</dc:source>${first.publishedAt && Number.isFinite(Date.parse(first.publishedAt)) ? `<dc:date>${new Date(first.publishedAt).toISOString()}</dc:date>` : ''}${[...new Set(book.documents.flatMap(d => d.tags))].map(t => `<dc:subject>${xml(t)}</dc:subject>`).join('')}<meta property="dcterms:modified">${modified}</meta>`;
  const manifest = `<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/><item id="css" href="style.css" media-type="text/css"/>${cover ? '<item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>' : ''}${book.documents.map((_, i) => `<item id="w${i}" href="work-${i}.xhtml" media-type="application/xhtml+xml"/>`).join('')}${uniqueImages.map((im, i) => `<item id="im${i}" href="${im.name}" media-type="${im.mime}"${im.name === cover?.name ? ' properties="cover-image"' : ''}/>`).join('')}`;
  entries.push({ name: 'EPUB/package.opf', data: `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id"><metadata xmlns:dc="http://purl.org/dc/elements/1.1/">${metadata}</metadata><manifest>${manifest}</manifest><spine>${cover ? '<itemref idref="cover"/>' : ''}<itemref idref="nav"/>${book.documents.map((_, i) => `<itemref idref="w${i}"/>`).join('')}</spine></package>` });
  // Several markers can refer to the same bytes; archive each resource once.
  await createZipArchive(destination, entries.filter((e, i) => entries.findIndex(v => v.name === e.name) === i));
}
