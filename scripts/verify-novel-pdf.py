"""Development-only PDF assertions; requires pypdf, never a product dependency."""
import json
import sys
from pypdf import PdfReader

reader = PdfReader(sys.argv[1])
assert len(reader.pages) >= 4, "cover, contents and paginated chapters expected"
assert reader.outline, "PDF chapter bookmarks missing"
text = "\n".join(page.extract_text() for page in reader.pages)
for expected in ["中文", "日本語", "かんじ"]:
    assert expected in text, f"Missing text: {expected}"
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
print(json.dumps({"pages": len(reader.pages), "images": images, "fonts": sorted(set(fonts)), "bookmarks": len(reader.outline)}, ensure_ascii=False))
