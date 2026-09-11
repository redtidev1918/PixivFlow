# Download PixivFlow

**Language / 语言:** [中文](/download.md) · English

PixivFlow is distributed primarily as an npm package, with release tarballs and an
official Docker image alongside it. See [Releases](https://github.com/redtidev1918/PixivFlow/releases)
for all assets and older versions.

## Install

### npm (recommended)

```bash
npm install -g pixivflow
pixivflow --help
```

Requires Node.js 22.12 or newer.

### Docker

See [Docker deployment](https://github.com/redtidev1918/PixivFlow/blob/master/DOCKER.md).

### Release assets

| Asset | Description |
| :-- | :-- |
| `pixivflow-<version>.tgz` | Tarball produced by `npm pack`; install with `npm install -g ./pixivflow-<version>.tgz` |
| `SHA256SUMS` | Checksums |
| `RELEASE-METADATA.json` | Release metadata |

Get them from the [latest release](https://github.com/redtidev1918/PixivFlow/releases/latest).

## Verify the download

```bash
grep '\.tgz' SHA256SUMS | sha256sum -c -
```

## Changelog

See [CHANGELOG](https://github.com/redtidev1918/PixivFlow/blob/master/CHANGELOG.md).
