# Changelog

## [2.33.0](https://github.com/redtidev1918/PixivFlow/compare/v2.32.0...v2.33.0) (2026-09-18)


### Features

* **web:** fail closed when binding WebUI publicly without auth ([#132](https://github.com/redtidev1918/PixivFlow/issues/132)) ([c1807d1](https://github.com/redtidev1918/PixivFlow/commit/c1807d11dca1a59d291f8a73e1e53649c9c0d2f5))

## [2.32.0](https://github.com/redtidev1918/PixivFlow/compare/v2.31.0...v2.32.0) (2026-09-18)


### Features

* **web:** show auth-disabled security reminder banner in WebUI ([#129](https://github.com/redtidev1918/PixivFlow/issues/129)) ([932c5f7](https://github.com/redtidev1918/PixivFlow/commit/932c5f740e569e3eb144fe293e98716e8600d53f))

## [2.31.0](https://github.com/redtidev1918/PixivFlow/compare/v2.30.0...v2.31.0) (2026-09-18)


### Features

* **web:** enable pixivflow web for installed npm package ([#126](https://github.com/redtidev1918/PixivFlow/issues/126)) ([1b64147](https://github.com/redtidev1918/PixivFlow/commit/1b641478814c95173290aed8daff1a97495b6e62))

## [2.30.0](https://github.com/redtidev1918/PixivFlow/compare/v2.29.0...v2.30.0) (2026-09-18)


### Features

* **candidate-inventory:** topic profile + durable 待发池 fallback ([935d6ca](https://github.com/redtidev1918/PixivFlow/commit/935d6ca4a17369058a52b42d8a2ed864563a2190))
* **candidate-inventory:** topic profile + durable 待发池 fallback ([684ee28](https://github.com/redtidev1918/PixivFlow/commit/684ee28bdd11272c6b33af7e30342088e57b0c87))

## [2.29.0](https://github.com/redtidev1918/PixivFlow/compare/v2.28.1...v2.29.0) (2026-09-18)


### Features

* **observability:** candidate supply report + empty result projection + target-labeled recovery buttons ([#118](https://github.com/redtidev1918/PixivFlow/issues/118)) ([f3b2286](https://github.com/redtidev1918/PixivFlow/commit/f3b2286bcdc7743b4247ee988ce54ee4d0644bc6))

## [2.28.1](https://github.com/redtidev1918/PixivFlow/compare/v2.28.0...v2.28.1) (2026-09-18)


### Bug Fixes

* **observability:** classify language-filter candidate skips as non-retryable, not INTERNAL_ERROR ([#116](https://github.com/redtidev1918/PixivFlow/issues/116)) ([d759f7d](https://github.com/redtidev1918/PixivFlow/commit/d759f7de2fd02ae0a893b22d868774e8c4e845c9))

## [2.28.0](https://github.com/redtidev1918/PixivFlow/compare/v2.27.1...v2.28.0) (2026-09-17)


### Features

* **recovery:** surface operator-facing recovery semantics in outcome notifications ([#112](https://github.com/redtidev1918/PixivFlow/issues/112)) ([77893d1](https://github.com/redtidev1918/PixivFlow/commit/77893d106fbb842706437993da33905bedaaa485))

## [2.27.0](https://github.com/redtidev1918/PixivFlow/compare/v2.26.0...v2.27.0) (2026-09-17)


### Features

* **delivery:** rich novel Telegram preview via TelePress ([d82d227](https://github.com/redtidev1918/PixivFlow/commit/d82d227535bfa06c343414abcf9a794c75ad70e6))

## [2.26.0](https://github.com/redtidev1918/PixivFlow/compare/v2.25.0...v2.26.0) (2026-09-17)


### Features

* **novel:** rich-media zip archive download (RFC Phase 3) ([#106](https://github.com/redtidev1918/PixivFlow/issues/106)) ([23db8fd](https://github.com/redtidev1918/PixivFlow/commit/23db8fde3bd75fda6f9888ea08a7dd6ce17b01db))

## [2.25.0](https://github.com/redtidev1918/PixivFlow/compare/v2.24.0...v2.25.0) (2026-09-17)


### Features

* **novel:** rich-media markdown sidecar (RFC 1 Phase 2) ([#104](https://github.com/redtidev1918/PixivFlow/issues/104)) ([5346aa5](https://github.com/redtidev1918/PixivFlow/commit/5346aa59779abfb4d220a54d482e13ad907a8ca8))

## [2.24.0](https://github.com/redtidev1918/PixivFlow/compare/v2.23.0...v2.24.0) (2026-09-17)


### Features

* **novel:** capture and download inline novel images (rich-media Phase 1) ([#101](https://github.com/redtidev1918/PixivFlow/issues/101)) ([bc410c5](https://github.com/redtidev1918/PixivFlow/commit/bc410c50bd3849c2d25560e585b4f96c4164393c))
* **observability:** make silent notification skips traceable (RFC 2 Phase A) ([#102](https://github.com/redtidev1918/PixivFlow/issues/102)) ([1b5dec1](https://github.com/redtidev1918/PixivFlow/commit/1b5dec10598504c85ee58049583f8b2677d21644))

## [2.23.0](https://github.com/redtidev1918/PixivFlow/compare/v2.22.1...v2.23.0) (2026-09-16)


### Features

* **observability:** structured logs + error taxonomy + admin log/error API ([#97](https://github.com/redtidev1918/PixivFlow/issues/97)) ([1b98936](https://github.com/redtidev1918/PixivFlow/commit/1b989363f06515ae2afe4372104635a5113cde3b))


### Bug Fixes

* **scheduler:** terminalize duplicate-only no-candidate instead of burning fallback budget (bot1 9/16 RCA) ([#98](https://github.com/redtidev1918/PixivFlow/issues/98)) ([a3f10fd](https://github.com/redtidev1918/PixivFlow/commit/a3f10fd89549c5bdb80c90d5c42390d58d2d3eb2))

## [2.22.1](https://github.com/redtidev1918/PixivFlow/compare/v2.22.0...v2.22.1) (2026-09-16)


### Bug Fixes

* **delivery:** settle permanent rejections immediately ([#94](https://github.com/redtidev1918/PixivFlow/issues/94)) ([da6d199](https://github.com/redtidev1918/PixivFlow/commit/da6d19901e163fc27da7a51b7c87fbb25d87026b))

## [2.22.0](https://github.com/redtidev1918/PixivFlow/compare/v2.21.0...v2.22.0) (2026-09-15)


### Features

* **scheduler:** add metadata_failed and telepost_rejected terminal reasons ([#92](https://github.com/redtidev1918/PixivFlow/issues/92)) ([2063328](https://github.com/redtidev1918/PixivFlow/commit/206332808b94e6dfad9efdff64f1af385a111bb5))

## [2.21.0](https://github.com/redtidev1918/PixivFlow/compare/v2.20.5...v2.21.0) (2026-09-15)


### Features

* **resource-governance:** resource-scoped admission, terminal reasons, manual recovery ([#90](https://github.com/redtidev1918/PixivFlow/issues/90)) ([184a735](https://github.com/redtidev1918/PixivFlow/commit/184a735a75d5340f3681618efa7cd23913b1ac93))


### Bug Fixes

* postRelease deploy-docs dispatches on default branch (Pages needs branch ref) ([e2fd564](https://github.com/redtidev1918/PixivFlow/commit/e2fd564818b03b314cfca9bb43980968fdb8e5ae))
* workflow_dispatch inputs must not carry description (GitHub dispatch 422) ([e295c6d](https://github.com/redtidev1918/PixivFlow/commit/e295c6d6cda6506154cf41688599b0f9ffcc7b09))

## [2.20.5](https://github.com/redtidev1918/PixivFlow/compare/v2.20.4...v2.20.5) (2026-09-15)


### Bug Fixes

* idle lifecycle second belt + first-class manual refetch resume guarantees ([#86](https://github.com/redtidev1918/PixivFlow/issues/86)) ([352c021](https://github.com/redtidev1918/PixivFlow/commit/352c02103d19a9aec98d6b450880f9809e8725c0))

## [2.20.4](https://github.com/redtidev1918/PixivFlow/compare/v2.20.3...v2.20.4) (2026-09-14)


### Bug Fixes

* no schedule summary for manual refetch slots ([afe8856](https://github.com/redtidev1918/PixivFlow/commit/afe88568ef937d6e3c21a59cf96372c264406fde))
* reconcile terminal schedule summaries and stage fallback per cell ([#85](https://github.com/redtidev1918/PixivFlow/issues/85)) ([1d57891](https://github.com/redtidev1918/PixivFlow/commit/1d57891d0d9b576c4f29cc47a558d8aab901fe8a))

## [2.20.3](https://github.com/redtidev1918/PixivFlow/compare/v2.20.2...v2.20.3) (2026-09-14)


### Bug Fixes

* bounded candidate fallback and terminal schedule outcome notifications ([#82](https://github.com/redtidev1918/PixivFlow/issues/82)) ([25f96b4](https://github.com/redtidev1918/PixivFlow/commit/25f96b4c001093b0b3a986078549b767e6bdc5b2))

## [2.20.2](https://github.com/redtidev1918/PixivFlow/compare/v2.20.1...v2.20.2) (2026-09-14)


### Bug Fixes

* **refetch:** converge manual outcomes from durable slot state ([c5974aa](https://github.com/redtidev1918/PixivFlow/commit/c5974aaa32859a2d1f3381d21c93354c98ba09c3))
* **refetch:** converge manual outcomes from durable slot state ([e0834c7](https://github.com/redtidev1918/PixivFlow/commit/e0834c78e25c375d2e56338c6fb4db64f466fd65))

## [2.20.1](https://github.com/redtidev1918/PixivFlow/compare/v2.20.0...v2.20.1) (2026-09-14)


### Bug Fixes

* **delivery:** render refetchRequestId into submission fields (was literal template) ([#77](https://github.com/redtidev1918/PixivFlow/issues/77)) ([274432f](https://github.com/redtidev1918/PixivFlow/commit/274432f59b6944e5567ad0631c758eba03fdedfb))

## [2.20.0](https://github.com/redtidev1918/PixivFlow/compare/v2.19.5...v2.20.0) (2026-09-13)


### Features

* **refetch:** durable manual candidate replacement workflow ([#76](https://github.com/redtidev1918/PixivFlow/issues/76)) ([e78d3d5](https://github.com/redtidev1918/PixivFlow/commit/e78d3d5124a31139981a3327a85f3363c3f3d905))
* **scheduler:** 让 schedule 的准入与终态结果可观察 ([8938ca9](https://github.com/redtidev1918/PixivFlow/commit/8938ca91abe233aade5e593eba797285167598ed))
* **scheduler:** 让 schedule 的准入与终态结果可观察 ([ba71680](https://github.com/redtidev1918/PixivFlow/commit/ba71680928f251a4c0af1799ba4181856406c2ab))

## [2.19.5](https://github.com/redtidev1918/PixivFlow/compare/v2.19.4...v2.19.5) (2026-09-13)


### Bug Fixes

* **scheduler:** a duplicate candidate advances the scan instead of ending the slot ([6cf145a](https://github.com/redtidev1918/PixivFlow/commit/6cf145a94460002fd2e7d45dbd6811c8743dd41a))
* **scheduler:** 重复候选推进扫描而不是结束槽位 ([d5522d9](https://github.com/redtidev1918/PixivFlow/commit/d5522d999a07b801b1bf668c1bb870db25f2c663))

## [2.19.4](https://github.com/redtidev1918/PixivFlow/compare/v2.19.3...v2.19.4) (2026-09-12)


### Bug Fixes

* **delivery:** a remote failure is never an end-to-end success ([#69](https://github.com/redtidev1918/PixivFlow/issues/69)) ([84b0d1c](https://github.com/redtidev1918/PixivFlow/commit/84b0d1c20fa05964c5679152cb7cad1f50e8b64e))

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
