# Changelog

## [2.19.3](https://github.com/redtidev1918/PixivFlow/compare/v2.19.2...v2.19.3) (2026-09-12)


### Bug Fixes

* **scheduler:** preserve locked work identity across recovery ([#66](https://github.com/redtidev1918/PixivFlow/issues/66)) ([7c55230](https://github.com/redtidev1918/PixivFlow/commit/7c5523071e04ac1a04cb13e64c499ed4fa6726ed))
* **search:** advance pager cursor across fallback pages ([#68](https://github.com/redtidev1918/PixivFlow/issues/68)) ([8b6c5dd](https://github.com/redtidev1918/PixivFlow/commit/8b6c5dd1f86e7e288a7c12e3ae5247f55dabd492))

## [2.19.2](https://github.com/redtidev1918/PixivFlow/compare/v2.19.1...v2.19.2) (2026-09-12)


### Bug Fixes

* **delivery:** only notify endpoints that can receive notifications ([07067f6](https://github.com/redtidev1918/PixivFlow/commit/07067f6c655042c101338110bb656290224acf7d))
* **scheduler:** terminalise a Slot abandoned by its own timeout ([a0edcde](https://github.com/redtidev1918/PixivFlow/commit/a0edcde29b004428fc5ac5074cb524b366140a28))
* **transport:** combine the caller signal with the per-request timeout ([4eb13c5](https://github.com/redtidev1918/PixivFlow/commit/4eb13c578ddc5b18710ac5ea0b269ff003a35af5))

## [2.19.1](https://github.com/redtidev1918/PixivFlow/compare/v2.19.0...v2.19.1) (2026-09-12)


### Bug Fixes

* **security:** 补齐 Telegram bot token / chat id 检测规则并收紧精确值放行 ([026bb15](https://github.com/redtidev1918/PixivFlow/commit/026bb1553d5814c5778c31e5e6d31e9bb4d9f01f))

## [2.19.0](https://github.com/redtidev1918/PixivFlow/compare/v2.18.1...v2.19.0) (2026-09-11)


### Features

* **scheduler:** 外部时钟下的跑完即退出生命周期 ([#59](https://github.com/redtidev1918/PixivFlow/issues/59)) ([2b6b44e](https://github.com/redtidev1918/PixivFlow/commit/2b6b44e5ad5ea68938ab05e2265d94ef2fad9090))

## [2.18.1](https://github.com/redtidev1918/PixivFlow/compare/v2.18.0...v2.18.1) (2026-09-11)


### Bug Fixes

* **scheduler:** durable trigger dispatch, lease recovery and honest status semantics ([#57](https://github.com/redtidev1918/PixivFlow/issues/57)) ([975c691](https://github.com/redtidev1918/PixivFlow/commit/975c691c3da071363b5f50990aea921994ed5790))

## [2.18.0](https://github.com/redtidev1918/PixivFlow/compare/v2.17.0...v2.18.0) (2026-09-11)


### Features

* **login:** launch the system browser via puppeteer-core (drop install-time Chromium) ([#49](https://github.com/redtidev1918/PixivFlow/issues/49)) ([fd9d7a6](https://github.com/redtidev1918/PixivFlow/commit/fd9d7a6de9c4924e7b3ae4e48152002b451bcb4b))


### Bug Fixes

* **packaging:** make global installs script-free and native-build-free ([#55](https://github.com/redtidev1918/PixivFlow/issues/55)) ([2680cf2](https://github.com/redtidev1918/PixivFlow/commit/2680cf2dda7087e2b0cf3a332efc9906dec7f5ba))

## [2.17.0](https://github.com/redtidev1918/PixivFlow/compare/v2.16.1...v2.17.0) (2026-09-11)


### Features

* **batch:** execute-slot, a one-shot execution plane with a machine-readable result ([#43](https://github.com/redtidev1918/PixivFlow/issues/43)) ([2dc135b](https://github.com/redtidev1918/PixivFlow/commit/2dc135b419f4b54fe42fb3cbdcfe13a43b0cc058))


### Bug Fixes

* **deps:** regenerate lockfile with npm 10 so npm ci passes on Node 22 ([d70df1e](https://github.com/redtidev1918/PixivFlow/commit/d70df1eacbc57e3253b916d3a184d9e16b00a70d))

## [2.16.1](https://github.com/redtidev1918/PixivFlow/compare/v2.16.0...v2.16.1) (2026-09-10)


### Bug Fixes

* **packaging:** bundle @redtidev/pixiv-client into the published tarball ([#35](https://github.com/redtidev1918/PixivFlow/issues/35)) ([1ee369b](https://github.com/redtidev1918/PixivFlow/commit/1ee369be1db79e742ae5b9ec39d3f9d8c7941456))

## [2.16.0](https://github.com/redtidev1918/PixivFlow/compare/v2.15.0...v2.16.0) (2026-09-10)


### Features

* **pixiv-client:** extract independent @redtidev/pixiv-client and migrate PixivFlow onto it ([3a67601](https://github.com/redtidev1918/PixivFlow/commit/3a676018a7109df36a55c8ce0dc9a4a9f71a29d3))

## [2.15.0](https://github.com/redtidev1918/PixivFlow/compare/v2.14.0...v2.15.0) (2026-09-10)


### Features

- Every delivery state transition is appended to a durable `delivery_events` log, so what happened to an occurrence survives log rotation and restarts. The same correlation id ties a scheduler run, a download, an outbox row, its delivery and any operator action together.
- Readiness deferrals are now recorded distinctly from failures and never consume a delivery attempt; the readiness probe reports a structured reason (connection refused, timeout, HTTP status) instead of a bare boolean.
- Added `pixivflow runs list` and `pixivflow runs show <executionId>` execution summaries, and `outbox inspect` prints the full event trail with deferred rows separated from attempt-consuming ones.
- Delivery errors are classified into typed classes, and secrets (URL credentials, headers, Bearer/token/cookie values) are redacted in logs and audit records.
- Build identity is baked into the package at build time: `pixivflow --version` reports the exact version and commit.

## [2.14.0](https://github.com/redtidev1918/PixivFlow/compare/v2.13.0...v2.14.0) (2026-09-10)

### Features

- Cache-mode illustration delivery can send aligned Pixiv previews alongside immutable originals.
- Delivery targets can define a readiness endpoint; outbox consumption waits without consuming attempts.
- Added `pixivflow outbox` list, inspect, dead-letter retry, and pending-intent cancel operations.

## [2.13.0](https://github.com/redtidev1918/PixivFlow/compare/v2.12.3...v2.13.0) (2026-09-09)


### Features

* **delivery:** typed outcomes, delivery ledger, SQLite outbox + worker, slot FSM/lease, slot notifications ([c6ffad8](https://github.com/redtidev1918/PixivFlow/commit/c6ffad87f8627f15634a8a84361c42d034012f88))
* **ops:** doctor/reconcile CLIs, authenticated outbox drain endpoint, degraded mode after corrupt-DB recovery ([9b35a85](https://github.com/redtidev1918/PixivFlow/commit/9b35a8576903678bc4049054ba60d403001e18f6))
* **reliability:** durable occurrence outbox/ledger, typed outcomes, global 429 gate, doctor/reconcile, occurrence-scoped idempotency key ([e9c4c7d](https://github.com/redtidev1918/PixivFlow/commit/e9c4c7dd97410e3cc8f72e480e20742da21bba52))
* **reliability:** global 429 gate, novel metadata cache, pre-lock delivery dedupe, legacy JSON outbox migration ([3d4fed1](https://github.com/redtidev1918/PixivFlow/commit/3d4fed1bddaf0810581aac97b970e414fd26b722))


### Bug Fixes

* **delivery:** actually send occurrence-scoped idempotency_key in multipart content delivery (was generated but never transmitted; ACK-loss retry could double-post / misclassify as historical duplicate) ([4f1b377](https://github.com/redtidev1918/PixivFlow/commit/4f1b377703964f895da897012b13e92f96db545e))

## [2.12.3](https://github.com/redtidev1918/PixivFlow/compare/v2.12.2...v2.12.3) (2026-09-09)


### Bug Fixes

* **scheduler:** finish slots after terminal target failures ([#21](https://github.com/redtidev1918/PixivFlow/issues/21)) ([2ea2769](https://github.com/redtidev1918/PixivFlow/commit/2ea27690f245b947064fab4353c7245ed715c898))

## [2.12.2](https://github.com/redtidev1918/PixivFlow/compare/v2.12.1...v2.12.2) (2026-09-09)


### Bug Fixes

* **ci:** follow releasegraph rename ([#19](https://github.com/redtidev1918/PixivFlow/issues/19)) ([1b10bce](https://github.com/redtidev1918/PixivFlow/commit/1b10bced9dd69f3d59c3e15afa9751a3291e1aed))
* **topic:** backfill empty illustration days ([#18](https://github.com/redtidev1918/PixivFlow/issues/18)) ([c33d21b](https://github.com/redtidev1918/PixivFlow/commit/c33d21baa996145c2e77953bb9a9d4051cc9e31e))

## [2.12.1](https://github.com/redtidev1918/PixivFlow/compare/v2.12.0...v2.12.1) (2026-09-08)


### Bug Fixes

* **notifications:** support Apprise notification gateway ([553b9a3](https://github.com/redtidev1918/PixivFlow/commit/553b9a3be18b2259c87a628222bfd7242a74a7fa))

## [2.12.0](https://github.com/redtidev1918/PixivFlow/compare/v2.11.0...v2.12.0) (2026-09-08)


### Features

* **scheduler:** generic durable schedule occurrences + external HTTP trigger ([07a50e1](https://github.com/redtidev1918/PixivFlow/commit/07a50e14191ba771da289964a4c77841e4d0ae8c))

## [2.11.0](https://github.com/redtidev1918/PixivFlow/compare/v2.10.31...v2.11.0) (2026-09-08)


### Features

* **scheduler:** external Slot trigger + Slot ledger for Fly autosleep ([7a88716](https://github.com/redtidev1918/PixivFlow/commit/7a88716affc7dfca4db3f82c6d33a816b565476b))
