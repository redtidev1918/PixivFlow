#!/usr/bin/env python3
"""生成下载页：中文主页面 + 英文镜像（同一份资产表）。

    python3 .github/scripts/update_download_page.py [owner/repo]

产出：
    docs/download.md       中文主页面
    docs/en/download.md    英文镜像

数据取自 GitHub 最新 Release。无 Release 变化时输出不变，因此不会产生空提交。
CI 由 .github/workflows/update-download-page.yml 在 `release: published` 时触发；
也可本地手动运行（需要已登录的 gh CLI）。

可选配置（**非托管**文件，各仓库自行维护）：
    .github/scripts/download-page.json
        { "displayName": "DAViewer", "previewFile": "docs/download-preview.md", "linkBase": "" }
    displayName  页面标题中显示的产品名，默认取仓库名
    previewFile  手写预览片段；存在时注入中文页（放应用截图等），默认 docs/download-preview.md
    linkBase     页面内互链的站点路径前缀。默认 ""（Pages 直接上传 ./docs，docs 即站点根）；
                 若站点是「拼接 _site」模式且把 docs/ 作为子目录发布，填 "/docs"
"""
import json
import os
import re
import subprocess
import sys
from pathlib import Path

# docsite-managed-file: update_download_page.py
# docsite-managed-version: 2

CONFIG = Path(".github/scripts/download-page.json")
DEFAULT_PREVIEW = "docs/download-preview.md"

EN_OS = {"通用": "All platforms", "Windows": "Windows", "macOS": "macOS",
         "Linux": "Linux", "Android": "Android"}
EN_TABLE_HEAD = "| Platform | File | Size | Download |"
ZH_TABLE_HEAD = "| 平台 | 文件 | 大小 | 下载 |"


def api(url: str) -> dict:
    return json.loads(subprocess.check_output(["gh", "api", url]).decode())


def infer_repo() -> str:
    out = subprocess.check_output(["git", "remote", "get-url", "origin"]).decode().strip()
    m = re.search(r"(?:github\.com[:/])([^/]+)/([^/.]+)", out)
    return f"{m.group(1)}/{m.group(2)}" if m else ""


def load_config() -> dict:
    if CONFIG.is_file():
        try:
            return json.loads(CONFIG.read_text(encoding="utf-8"))
        except json.JSONDecodeError as exc:
            print(f"warning: {CONFIG} 不是合法 JSON（{exc}），使用默认值", file=sys.stderr)
    return {}


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


def main() -> int:
    repo = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("GITHUB_REPOSITORY", "")
    if not repo:
        repo = infer_repo()
    if not repo or "/" not in repo:
        print("cannot determine owner/repo", file=sys.stderr)
        return 1

    cfg = load_config()
    project = repo.split("/")[1]
    display = cfg.get("displayName") or project
    preview_path = Path(cfg.get("previewFile") or DEFAULT_PREVIEW)
    # 站点内互链前缀：docs/ 即站点根时为 ""，docs/ 作为子目录发布时为 "/docs"。
    base = (cfg.get("linkBase") or "").rstrip("/")

    try:
        rel = api(f"repos/{repo}/releases/latest")
    except subprocess.CalledProcessError:
        print("no latest release", file=sys.stderr)
        return 1

    tag = rel.get("tag_name", "")
    published = (rel.get("published_at") or "")[:10]
    assets = rel.get("assets", [])

    def head(title_zh: bool) -> list:
        if title_zh:
            return [
                f"# 📥 下载 {display}",
                "",
                f"**语言 / Language:** 中文 · [English]({base}/en/download.md)",
                "",
                "本页由 GitHub Actions 在每次发版时**自动更新**，始终指向最新 Release。",
                "",
                f"## 最新版本：`{tag}`（{published}）",
                "",
                f"👉 [查看 Release 说明与校验和]({rel.get('html_url', '')})",
                "",
            ]
        return [
            f"# 📥 Download {display}",
            "",
            f"**Language / 语言:** [中文]({base}/download.md) · English",
            "",
            "This page is **generated automatically** by GitHub Actions on every release "
            "and always points at the latest one.",
            "",
            f"## Latest version: `{tag}` ({published})",
            "",
            f"👉 [Release notes and checksums]({rel.get('html_url', '')})",
            "",
        ]

    lines_zh = head(True)
    lines_en = head(False)

    # 手写预览片段只进中文页（内容通常为中文说明与截图）。
    if preview_path.is_file():
        preview = preview_path.read_text(encoding="utf-8").strip()
        if preview:
            lines_zh += [preview, ""]

    rows = []
    for a in assets:
        os_name, arch = platform_of(a["name"])
        size = a.get("size", 0)
        size_s = f"{size / 1048576:.1f} MB" if size >= 1048576 else f"{size / 1024:.0f} KB"
        rows.append((os_name, arch, a["name"], size_s, a["browser_download_url"]))
    rows.sort(key=lambda r: (r[0], r[1], r[2]))

    if rows:
        lines_zh += [ZH_TABLE_HEAD, "|---|---|---|---|"]
        lines_zh += [f"| {os_name + (f' · {arch}' if arch else '')} | `{fn}` | {size_s} "
                     f"| [⬇️ 下载]({url}) |" for os_name, arch, fn, size_s, url in rows]
        lines_zh.append("")

        lines_en += [EN_TABLE_HEAD, "|---|---|---|---|"]
        lines_en += [f"| {EN_OS.get(os_name, os_name) + (f' · {arch}' if arch else '')} "
                     f"| `{fn}` | {size_s} | [⬇️ Download]({url}) |"
                     for os_name, arch, fn, size_s, url in rows]
        lines_en.append("")
    else:
        lines_zh += ["> 本仓库没有附带二进制资产；安装方式见文档。", ""]
        lines_en += ["> This repository ships no binary assets; see the docs for installation.", ""]

    Path("docs").mkdir(parents=True, exist_ok=True)
    Path("docs/en").mkdir(parents=True, exist_ok=True)
    Path("docs/download.md").write_text("\n".join(lines_zh), encoding="utf-8")
    Path("docs/en/download.md").write_text("\n".join(lines_en), encoding="utf-8")
    print(f"docs/download.md + docs/en/download.md <- {repo} {tag} ({len(rows)} assets)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
