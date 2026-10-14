# Novel ebook export

EPUB and PDF are local Artifact variants. TXT paths, Markdown, ZIP, TelePress
and delivery selection remain authoritative for their existing consumers.
Export errors are reported separately and never roll back a saved TXT.

## Community Research

Investigated: [html-to-epub](https://github.com/lesjoursfr/html-to-epub) (MIT),
[Vivliostyle CLI](https://github.com/vivliostyle/vivliostyle-cli),
[PixivDownloader](https://github.com/Sywyar/PixivDownloader),
[EPUB 3.3](https://www.w3.org/TR/epub-33/), and
[EPUBCheck](https://github.com/w3c/epubcheck).

Decision: reuse the existing MIT archiver dependency for the small EPUB container
adapter and Apache-2.0 puppeteer-core for optional PDF rendering. html-to-epub
provides useful packaging, but also owns HTML parsing, image downloading and
temporary resources; those responsibilities already belong to PixivFlow. Its
templates would still require adaptation for nested navigation and strict offline
assets. Vivliostyle adds a full publication toolchain unnecessary for horizontal
A4 novels. No code is copied from PixivDownloader. EPUBCheck is a development
validator only; Java is not a runtime dependency of PixivFlow.

## Data and integration

The existing marker scanner feeds NovelDocument nodes. Original text and source
metadata are retained in the existing metadata sidecar, so re-export does not
depend on a lossy TXT conversion. Legacy TXT retains its raw markers and may be
imported with its metadata sidecar. Images use canonical MediaAsset references
and the existing materializer; renderers receive only validated local bytes.
Network access is disabled inside the PDF browser. PDF requires an explicitly
configured browser; it is never installed on behalf of ordinary users.
Chromium refuses its sandbox when the process runs as root, so a root launch
(the default Docker image) starts that one render with `--no-sandbox`;
non-root environments always keep the sandbox enabled.

Series membership is checked by series ID. A manifest records the ordered IDs
returned by Pixiv's paginated series endpoint, independently of download order.
Assembly refuses missing or foreign members. Completeness means completeness
against that API snapshot, not a claim about private/deleted works hidden by Pixiv.

Output is written to a sibling temporary file and renamed only after success.
An exclusive per-output filesystem lock rejects concurrent writers, including
other processes. A content checksum avoids repeating unchanged exports. Stale
locks after an abrupt process termination require explicit operator removal.
Resource limits bound text, image count/bytes, PDF time and in-process PDF
concurrency. EPUB/PDF stay local and do not silently enter the durable delivery
queue.
