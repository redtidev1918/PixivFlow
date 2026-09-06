"""Run with python3 src/__tests__/download/test_ugoira_to_gif.py (FFmpeg required)."""
import importlib.util
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import unittest
import zipfile
import zlib

spec = importlib.util.spec_from_file_location(
    "ugoira", Path(__file__).resolve().parents[2] / "download/ugoira_to_gif.py"
)
ugoira = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ugoira)


def png(color):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", 8, 8, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress((b"\x00" + bytes(color) * 8) * 8)) + chunk(b"IEND", b""))


class UgoiraConversionTest(unittest.TestCase):
    def test_real_gif_and_invalid_metadata(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            archive, metadata, output = [root / name for name in ("frames.zip", "frames.json", "animation.gif")]
            with zipfile.ZipFile(archive, "w") as z:
                z.writestr("000000.png", png((255, 0, 0)))
                z.writestr("000001.png", png((0, 0, 255)))
            frames = [{"file": "000001.png", "delay": 70}, {"file": "000000.png", "delay": 230}]
            metadata.write_text(json.dumps({"frames": frames}))
            ugoira.convert(archive, metadata, output)
            data = output.read_bytes()
            self.assertEqual(data[:6], b"GIF89a")
            self.assertIn(b"NETSCAPE2.0\x03\x01\x00\x00", data)  # infinite loop
            # Generated solid-color GIF: locate graphics-control blocks and check per-frame delay.
            import re
            delays = [struct.unpack("<H", match)[0] for match in re.findall(b"\x21\xf9\x04.(..).\x00", data, re.S)]
            self.assertEqual(delays, [7, 23])
            pixels = subprocess.check_output([
                "ffmpeg", "-v", "error", "-i", str(output), "-fps_mode", "passthrough",
                "-f", "rawvideo", "-pix_fmt", "rgb24", "-",
            ])
            self.assertEqual(pixels[:3], bytes((0, 0, 255)))
            self.assertEqual(pixels[8 * 8 * 3:8 * 8 * 3 + 3], bytes((255, 0, 0)))
            original = data
            for invalid in ([], [{"file": "../outside.png", "delay": 100}],
                            [{"file": "000000.png", "delay": 0}],
                            [{"file": "missing.png", "delay": 100}]):
                metadata.write_text(json.dumps({"frames": invalid}))
                with self.assertRaises((ValueError, KeyError)):
                    ugoira.convert(archive, metadata, output)
                self.assertEqual(output.read_bytes(), original)
                self.assertTrue(archive.exists())
            self.assertFalse(list(root.glob(".ugoira-*")))


if __name__ == "__main__":
    unittest.main()
