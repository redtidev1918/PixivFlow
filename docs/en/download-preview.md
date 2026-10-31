## Requirements

- Node.js 22.13 or newer (npm 9+)
- A Pixiv account; the network must be able to reach Pixiv (a proxy is needed on some networks)
- Interactive login uses a local Chrome or Chromium

## Install (npm)

```bash
npm install -g pixivflow
```

Verify the install:

```bash
pixivflow --help
```

npm package page: <https://www.npmjs.com/package/pixivflow>

## Docker deployment

Suited to servers, NAS boxes and long-running scheduled jobs; see [Docker deployment](/en/DOCKER.md) for the setup steps.

## Offline install and past versions

Where npm is not an option, download the release tarball `pixivflow-<version>.tgz` from [GitHub Releases](https://github.com/redtidev1918/PixivFlow/releases) and install it directly:

```bash
npm install -g ./pixivflow-<version>.tgz
```

Past versions, source code and checksum files live on the same Releases page.

## Changelog

See [CHANGELOG](https://github.com/redtidev1918/PixivFlow/blob/master/CHANGELOG.md).
