#!/usr/bin/env python3
"""自动保留最新 release：删除旧的 GitHub Release（及对应 tag）。

track 规则：tag 以 "deploy-" 开头算 deploy track，否则算 kit track；
每个 track 只保留最新一个 release，其余删除。

用法（在 release workflow 里，发布完成后调用）：
  GITHUB_REPOSITORY 已注入；GITHUB_REF_NAME = 当前 tag。
"""
import os
import subprocess

repo = os.environ.get("GITHUB_REPOSITORY", "")


def run(args):
    return subprocess.run(args, capture_output=True, text=True)


def track(tag: str) -> str:
    return "deploy" if tag.startswith("deploy-") else "kit"


r = run(["gh", "api", f"repos/{repo}/releases?per_page=100", "--jq", ".[].tag_name"])
tags = [t for t in r.stdout.splitlines() if t.strip()]

# 列表按新→旧返回，每个 track 遇到的第一个就是最新
keep = {}
for t in tags:
    keep.setdefault(track(t), t)

deleted = []
for t in tags:
    if t not in keep.values():
        run(["gh", "release", "delete", t, "-R", repo, "-y", "--cleanup-tag"])
        deleted.append(t)

print(f"pruned {len(deleted)} old release(s): {deleted}")
print(f"kept: {list(keep.values())}")
