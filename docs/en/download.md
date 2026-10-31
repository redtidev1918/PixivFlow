<!-- docsite-release-repo: redtidev1918/PixivFlow -->
<!-- docsite-release-tag: v3.10.0 -->
# Download PixivFlow

**Language / 语言:** [中文](/download.md) · English

<!-- docsite: generated from redtidev1918/PixivFlow release v3.10.0; do not edit by hand -->

GitHub Actions generates this page from release assets. If the page has not been updated yet, check Releases for the latest version. [Releases](https://github.com/redtidev1918/PixivFlow/releases)

## Latest version: `v3.10.0` (2026-10-30)

[Release notes and checksums](https://github.com/redtidev1918/PixivFlow/releases/tag/v3.10.0)

PixivFlow is distributed primarily as an npm package; an offline tarball and an official Docker image are also available. See [Releases](https://github.com/redtidev1918/PixivFlow/releases) for all assets and past versions.

## Install

### npm (recommended)

```bash
npm install -g pixivflow
pixivflow --help
```

Node.js 22.13 or newer is required.

### Docker

See [Docker deployment](/en/DOCKER.md) and [DOCKER.md](https://github.com/redtidev1918/PixivFlow/blob/master/docs/en/DOCKER.md).

### Release tarball (offline / manual install)

For offline machines or manual installs only; for everyday use, prefer the npm command above.

| Asset | What it is |
| :-- | :-- |
| `pixivflow-<version>.tgz` | the `npm pack` tarball; install with `npm install -g ./pixivflow-<version>.tgz` |
| `SHA256SUMS` | checksum file |
| `RELEASE-METADATA.json` | release metadata |

Get them from the [latest Release](https://github.com/redtidev1918/PixivFlow/releases/latest).

## Verifying downloads

```bash
grep '\.tgz' SHA256SUMS | sha256sum -c -
```

## Changelog

See [CHANGELOG](https://github.com/redtidev1918/PixivFlow/blob/master/CHANGELOG.md).

| Platform | File | Size | Download |
|---|---|---|---|
| All platforms | `RELEASE-METADATA.json` | 2 KB | [Download](https://github.com/redtidev1918/PixivFlow/releases/download/v3.10.0/RELEASE-METADATA.json) |
| All platforms | `SHA256SUMS` | 0 KB | [Download](https://github.com/redtidev1918/PixivFlow/releases/download/v3.10.0/SHA256SUMS) |
| All platforms | `pixivflow-3.10.0.tgz` | 2.5 MB | [Download](https://github.com/redtidev1918/PixivFlow/releases/download/v3.10.0/pixivflow-3.10.0.tgz) |
