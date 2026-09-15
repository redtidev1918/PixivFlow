# docsite-managed-file: update_download_page.py
# docsite-managed-version: 3
# docsite: managed file, run `python3 docsite.py update` to refresh.
"""Generate download page(s) from a GitHub release.

    python3 update_download_page.py [owner/repo]
                                   [--tag v1.2.3]          explicit release (exact tag)
                                   [--language zh]         only render one language (repeatable)
                                   [--config PATH]         config file (default .github/scripts/download-page.json)
                                   [--input-json PATH]     read release JSON from a file (tests / offline)
                                   [--check]               verify pages against the release source instead of writing
                                   [--force]               overwrite even if the current page is newer

Data source: one GitHub release — either the exact tag given with --tag, or the latest
non-prerelease release when --tag is omitted (manual/fallback mode; it logs what it picked).

Outputs and languages come from the config file, not hardcoded code:

    {
      "displayName": "TelePost",            # page title; default: repo name
      "previewFile": "docs/download-preview.md",   # hand-written snippet, injected into the first language
      "linkBase": "",                       # site path prefix when docs/ is NOT the site root, e.g. "/docs"
      "languages": ["zh", "en"],            # which pages to render (default ["zh", "en"])
      "outputs": {                          # per-language output paths (defaults shown)
        "zh": "docs/download.md",
        "en": "docs/en/download.md"
      },
      "trackPrerelease": false              # allow a prerelease tag to overwrite a stable page
    }

The refresh workflow also reads "docsWorkflow" (default "docs.yml") from this config to
know which Pages workflow to dispatch after the download commit.

Every generated page carries machine-readable markers:

    <!-- docsite-release-repo: owner/repo -->
    <!-- docsite-release-tag: v1.2.3 -->

which make `--check` and stale-write protection possible without guessing from text.
A page is never silently rolled back: if the current page's tag is newer than the
incoming one (or stable and the incoming one is a prerelease), the write is skipped
with a warning unless --force is given.
"""
import argparse
import json
import os
import re
import subprocess
import sys
from pathlib import Path

CONFIG_DEFAULT = Path(".github/scripts/download-page.json")
PREVIEW_DEFAULT = "docs/download-preview.md"

TAG_RE = re.compile(r"^[vV]?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$")
MARKER_REPO = "docsite-release-repo"
MARKER_TAG = "docsite-release-tag"

LANGS = {
    "zh": {
        "title": lambda display: f"# 📥 下载 {display}",
        "lang_line": lambda base: f"**语言 / Language:** 中文 · [English]({base}/en/download.md)",
        "auto_note": "本页由 GitHub Actions 在每次发版时**自动更新**，始终指向最新 Release。",
        "latest_head": lambda tag, date: f"## 最新版本：`{tag}`（{date}）",
        "release_link": lambda url: f"👉 [查看 Release 说明与校验和]({url})",
        "table_head": "| 平台 | 文件 | 大小 | 下载 |",
        "download_word": "下载",
        "no_assets": "> 本仓库没有附带二进制资产；安装方式见文档。",
    },
    "en": {
        "title": lambda display: f"# 📥 Download {display}",
        "lang_line": lambda base: f"**Language / 语言:** [中文]({base}/download.md) · English",
        "auto_note": "This page is **generated automatically** by GitHub Actions on every release "
        "and always points at the latest one.",
        "latest_head": lambda tag, date: f"## Latest version: `{tag}` ({date})",
        "release_link": lambda url: f"👉 [Release notes and checksums]({url})",
        "table_head": "| Platform | File | Size | Download |",
        "download_word": "Download",
        "no_assets": "> This repository ships no binary assets; see the docs for installation.",
    },
}

EN_OS = {"通用": "All platforms", "Windows": "Windows", "macOS": "macOS",
         "Linux": "Linux", "Android": "Android"}


def release_payload(api_url: str, input_json: str | None) -> dict:
    """Fetch the release JSON (gh api or from a local file)."""
    if input_json:
        data = Path(input_json).read_text(encoding="utf-8")
        return json.loads(data)
    return json.loads(subprocess.check_output(["gh", "api", api_url]).decode())


def fetch_release(repo: str, tag: str | None, input_json: str | None) -> dict:
    if tag:
        payload = release_payload(f"repos/{repo}/releases/tags/{tag}", input_json)
    else:
        payload = release_payload(f"repos/{repo}/releases/latest", input_json)
    return payload


def parse_tag(tag: str):
    """(major, minor, patch) for vX.Y.Z-style tags, else None."""
    m = TAG_RE.match(tag)
    if not m:
        return None
    return tuple(int(x) for x in m.groups())


def existing_marker(path: Path, name: str) -> str:
    if not path.is_file():
        return ""
    head = path.read_text(encoding="utf-8", errors="ignore")[:800]
    m = re.search(rf"<!--\s*{re.escape(name)}:\s*([^\s]+)\s*-->", head)
    return m.group(1) if m else ""


def marker_repo(path: Path) -> str:
    return existing_marker(path, MARKER_REPO)


def marker_tag(path: Path) -> str:
    return existing_marker(path, MARKER_TAG)


def is_prerelease(tag: str, payload: dict) -> bool:
    if payload.get("prerelease"):
        return True
    return bool(re.search(r"[-+](alpha|beta|rc|pre|dev)", tag, re.I))


def platform_of(fn: str) -> tuple:
    """Best-effort platform label from the asset filename."""
    f = fn.lower()
    if "windows" in f or f.endswith(".exe") or ".msi" in f:
        os_name = "Windows"
    elif "darwin" in f or "macos" in f:
        os_name = "macOS"
    elif "linux" in f or f.endswith(".deb") or f.endswith(".appimage"):
        os_name = "Linux"
    elif f.endswith(".apk"):
        os_name = "Android"
    else:
        os_name = "通用"
    arch = ""
    for a in ("arm64", "aarch64", "amd64", "x86_64", "x64", "arm", "386", "x86"):
        if a in f:
            arch = a
            break
    if arch == "x86_64":
        arch = "x64"
    return os_name, arch


def render_page(lang: str, display: str, base: str, payload: dict,
                preview: str | None, cfg: dict) -> str:
    text = LANGS.get(lang) or LANGS["en"]
    tag = payload.get("tag_name", "")
    published = (payload.get("published_at") or "")[:10]
    rel_url = payload.get("html_url", "")

    lines = [f"<!-- {MARKER_REPO}: {cfg['repo']} -->",
             f"<!-- {MARKER_TAG}: {tag} -->",
             text["title"](display), "",
             text["lang_line"](base), "",
             f"<!-- docsite: generated from {cfg['repo']} release {tag}; do not edit by hand -->",
             "",
             text["auto_note"], "",
             text["latest_head"](tag, published), "",
             text["release_link"](rel_url), ""]

    if preview:
        lines += [preview, ""]

    rows = []
    for a in payload.get("assets", []):
        os_name, arch = platform_of(a["name"])
        size = a.get("size", 0)
        size_s = f"{size / 1048576:.1f} MB" if size >= 1048576 else f"{size / 1024:.0f} KB"
        rows.append((os_name, arch, a["name"], size_s, a["browser_download_url"]))
    rows.sort(key=lambda r: (r[0], r[1], r[2]))

    if rows:
        lines += [text["table_head"], "|---|---|---|---|"]
        lines += [f"| {os_name + (f' · {arch}' if arch else '')} | `{fn}` | {size_s} "
                  f"| [⬇️ {text['download_word']}]({url}) |" for os_name, arch, fn, size_s, url in rows]
    else:
        lines += [text["no_assets"]]
    lines.append("")
    return "\n".join(lines)


def load_config(path: Path, repo: str) -> dict:
    cfg = {"repo": repo}
    if path.is_file():
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"warning: {path} 不是合法 JSON（{exc}），使用默认值", file=sys.stderr)
            data = {}
    else:
        data = {}
    project = repo.split("/")[1]
    cfg["displayName"] = data.get("displayName") or project
    cfg["previewFile"] = data.get("previewFile") or PREVIEW_DEFAULT
    cfg["linkBase"] = (data.get("linkBase") or "").rstrip("/")
    cfg["languages"] = data.get("languages") or ["zh", "en"]
    cfg["outputs"] = data.get("outputs") or {"zh": "docs/download.md", "en": "docs/en/download.md"}
    cfg["trackPrerelease"] = bool(data.get("trackPrerelease", False))
    if not cfg["languages"]:
        cfg["languages"] = ["zh", "en"]
    # 语言集合缺 zh 或 en 时默认补全，避免写出少一半的页面。
    for lang in ("zh", "en"):
        if lang not in cfg["outputs"]:
            cfg["outputs"][lang] = {"zh": "docs/download.md", "en": "docs/en/download.md"}[lang]
    return cfg


def output_paths(cfg: dict) -> list[tuple[str, Path]]:
    return [(lang, Path(cfg["outputs"].get(lang, f"docs/{lang}/download.md")))
            for lang in cfg["languages"]]


def guard_stale_write(path: Path, payload: dict, cfg: dict, force: bool) -> bool:
    """Return True when the write may proceed. Refuses to roll a page back."""
    new_tag = payload.get("tag_name", "")
    cur = marker_tag(path)
    if not cur or cur == new_tag:
        return True
    new_prerelease = is_prerelease(new_tag, payload)
    if new_prerelease and not cfg["trackPrerelease"]:
        print(f"stale-write guard: {path} has {cur}; refusing to overwrite stable page "
              f"with prerelease {new_tag} (set trackPrerelease to allow)", file=sys.stderr)
        return force
    order_new, order_cur = parse_tag(new_tag), parse_tag(cur)
    if order_new is not None and order_cur is not None and order_new < order_cur:
        print(f"stale-write guard: {path} already at {cur}; refusing to downgrade to {new_tag} "
              f"(use --force to override)", file=sys.stderr)
        return force
    return True


def cmd_render(args) -> int:
    if not args.repo and not os.environ.get("GITHUB_REPOSITORY"):
        print("cannot determine owner/repo (pass it or set GITHUB_REPOSITORY)", file=sys.stderr)
        return 1
    repo = args.repo or os.environ["GITHUB_REPOSITORY"]
    cfg = load_config(Path(args.config), repo)

    try:
        payload = fetch_release(repo, args.tag, args.input_json)
    except subprocess.CalledProcessError as exc:
        print(f"release fetch failed: {exc}", file=sys.stderr)
        return 1
    tag = payload.get("tag_name", "")
    if not tag:
        print(f"release fetch returned no tag_name ({repo} "
              f"{'--tag ' + args.tag if args.tag else 'latest'})", file=sys.stderr)
        return 1
    print(f"release source: {repo} tag={tag} prerelease={is_prerelease(tag, payload)} "
          f"({len(payload.get('assets', []))} assets)")

    if args.check:
        return cmd_check(cfg, payload)

    preview = None
    pv = Path(cfg["previewFile"])
    if pv.is_file() and pv.read_text(encoding="utf-8").strip():
        preview = pv.read_text(encoding="utf-8").strip()

    langs = set(args.language or []) or None
    wrote = 0
    first_lang = cfg["languages"][0]
    for lang, path in output_paths(cfg):
        if langs and lang not in langs:
            continue
        if not guard_stale_write(path, payload, cfg, args.force):
            continue
        body = render_page(lang, cfg["displayName"], cfg["linkBase"], payload,
                           preview if lang == first_lang else None, cfg)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(body, encoding="utf-8")
        print(f"wrote {path} <- {repo} {tag}")
        wrote += 1
    print(f"download page(s) written for {repo} {tag} ({wrote} page(s))")
    return 0


def cmd_check(cfg: dict, latest_payload: dict) -> int:
    """Verify the configured pages against the release source (usually latest stable)."""
    latest_tag = latest_payload.get("tag_name", "")
    status = 0
    for lang, path in output_paths(cfg):
        if not path.is_file():
            print(f"MISSING  {path}")
            status = 2
            continue
        cur = marker_tag(path)
        if not cur:
            print(f"DRIFT    {path} (no docsite marker; hand-edited or old generator)")
            status = 2
            continue
        if cur == latest_tag:
            print(f"OK       {path} ({cur})")
        else:
            print(f"STALE    {path} has {cur}, source is {latest_tag}")
            status = 2
    return status


def main() -> int:
    p = argparse.ArgumentParser(description="Generate download page(s) from a GitHub release")
    p.add_argument("repo", nargs="?", help="owner/repo; defaults to GITHUB_REPOSITORY")
    p.add_argument("--tag", help="exact release tag, e.g. v1.2.3; default: latest stable")
    p.add_argument("--language", action="append", help="only render this language (repeatable)")
    p.add_argument("--config", default=str(CONFIG_DEFAULT), help="config file path")
    p.add_argument("--input-json", help="read release JSON from a file instead of gh api")
    p.add_argument("--check", action="store_true", help="verify pages, do not write")
    p.add_argument("--force", action="store_true", help="override stale-write guard")
    args = p.parse_args()
    return cmd_render(args)


if __name__ == "__main__":
    sys.exit(main())