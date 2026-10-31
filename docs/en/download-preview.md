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
