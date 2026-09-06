"""Convert Pixiv frame ZIP + timing metadata to a looping GIF, without shell commands."""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile


def convert(zip_path, frames_path, output_path):
    frames = json.loads(Path(frames_path).read_text(encoding="utf-8"))["frames"]
    if not isinstance(frames, list) or not 1 <= len(frames) <= 10000:
        raise ValueError("Invalid ugoira frame count (1-10000 required)")
    for frame in frames:
        if not isinstance(frame, dict) or not re.fullmatch(
            r"[A-Za-z0-9_-]+\.(?:jpg|jpeg|png)", str(frame.get("file", "")), re.I
        ):
            raise ValueError("Invalid ugoira frame filename")
        if type(frame.get("delay")) is not int or not 10 <= frame["delay"] <= 60000:
            raise ValueError("Invalid ugoira frame delay (10-60000 ms required)")
    # GIF stores time in centiseconds. Round each frame, never replace variable delays with fixed FPS.
    delays = [max(1, (frame["delay"] + 5) // 10) for frame in frames]
    if sum(delays) > 60000:
        raise ValueError("Ugoira duration exceeds 10 minutes")
    output = Path(output_path).resolve()
    with tempfile.TemporaryDirectory(prefix=".ugoira-", dir=output.parent) as tmp:
        directory = Path(tmp)
        lines = ["ffconcat version 1.0"]
        with zipfile.ZipFile(zip_path) as archive:
            infos = [archive.getinfo(frame["file"]) for frame in frames]
            if sum(info.file_size for info in infos) > 512 * 1024 * 1024:
                raise ValueError("Ugoira expanded frames exceed 512 MiB")
            for index, (info, delay) in enumerate(zip(infos, delays)):
                if info.file_size > 64 * 1024 * 1024 or info.is_dir():
                    raise ValueError("Invalid or oversized ugoira frame")
                # Never extract archive paths/symlinks. Only copy named frames to generated names.
                name = f"frame{index:06d}{Path(info.filename).suffix.lower()}"
                with archive.open(info) as source, (directory / name).open("wb") as target:
                    shutil.copyfileobj(source, target, length=1024 * 1024)
                lines.extend([f"file {name}", "option framerate 100", f"duration {delay / 100:.2f}"])
        (directory / "frames.txt").write_text("\n".join(lines) + "\n", encoding="utf-8")
        # ponytail: 640px and one frame palette bound worker memory; add quality options if needed.
        filters = (
            "scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease,"
            "split[a][b];[a]palettegen=stats_mode=single[p];[b][p]paletteuse=new=1"
        )
        subprocess.run([
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
            "-max_alloc", "67108864", "-threads", "1", "-filter_complex_threads", "1",
            "-f", "concat", "-safe", "0", "-protocol_whitelist", "file",
            "-i", str(directory / "frames.txt"), "-filter_complex", filters,
            "-fps_mode", "vfr", "-threads", "1", "-loop", "0",
            "-final_delay", str(delays[-1]), str(directory / "animation.gif"),
        ], check=True, timeout=240)
        result = directory / "animation.gif"
        if not 0 < result.stat().st_size <= 49 * 1024 * 1024:
            raise ValueError("Converted GIF exceeds 49 MiB; original frames retained")
        os.replace(result, output)


if __name__ == "__main__":
    convert(*sys.argv[1:])
