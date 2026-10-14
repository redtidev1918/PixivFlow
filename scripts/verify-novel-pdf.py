"""Development-only PDF assertions; requires pypdf, never a product dependency."""
import json
import re
import shutil
import subprocess
import sys
from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
assert len(reader.pages) >= 4, "cover, contents and paginated chapters expected"
assert reader.outline, "PDF chapter bookmarks missing"


def compact(value: str) -> str:
    # CJK text has no meaningful spaces; strip all whitespace so a phrase
    # wrapped across lines by different platform fonts still matches.
    return re.sub(r"\s+", "", value)


# Extraction is dual-channel: poppler pdftotext is the reference
# implementation (and what real tooling uses); pypdf covers hosts without it.
# pypdf alone misreads some NotoSansCJK subset ToUnicode maps, so either
# channel finding the phrase is a pass; failures embed samples for diagnosis.
channels: dict[str, str] = {}
if shutil.which("pdftotext"):
    raw = subprocess.run(["pdftotext", "-q", sys.argv[1], "-"], capture_output=True).stdout
    # Read bytes and decode leniently: some Windows pdftotext builds emit a
    # legacy codepage; bad bytes only degrade this channel's sample, the
    # pypdf channel still carries the assertion.
    channels["pdftotext"] = (raw or b"").decode("utf-8", "replace")
try:
    channels["pypdf"] = "".join(page.extract_text() for page in reader.pages)
except Exception as error:  # noqa: BLE001 - diagnostics only
    channels["pypdf"] = f"<extraction failed: {error}>"
samples = {name: compact(text)[:160] for name, text in channels.items()}
for expected in ["中文", "日本語", "かんじ"]:
    assert any(expected in compact(text) for text in channels.values()), (
        f"Missing text: {expected}; extracted samples: {json.dumps(samples, ensure_ascii=False)}"
    )
images = sum(len(page.images) for page in reader.pages)
assert images >= 2, "cover and inline illustrations missing"
fonts = []
for page in reader.pages:
    for ref in page["/Resources"].get("/Font", {}).values():
        font = ref.get_object()
        if font.get('/Subtype') == '/Type3':
            assert font.get('/CharProcs'), 'Type3 glyph programs missing'
            fonts.append('Type3 embedded glyphs')
            continue
        descendants = font.get("/DescendantFonts", [font])
        for entry in descendants:
            data = entry.get_object()
            descriptor = data.get("/FontDescriptor")
            if descriptor:
                descriptor = descriptor.get_object()
                assert any(k in descriptor for k in ["/FontFile", "/FontFile2", "/FontFile3"]), "Unembedded font"
            fonts.append(str(data.get("/BaseFont")))
assert fonts, "PDF fonts missing"
print(json.dumps({"pages": len(reader.pages), "images": images, "fonts": sorted(set(fonts)), "bookmarks": len(reader.outline), "extraction": {k: len(compact(v)) for k, v in channels.items()}}, ensure_ascii=False))
