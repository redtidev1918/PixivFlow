# Changelog

## [2.15.0](https://github.com/redtidev1918/PixivFlow/compare/v2.14.0...v2.15.0) (2026-09-10)


### Features

* durable observability/audit (delivery_events, correlation id, readiness reason, runs CLI, build SHA) ([#30](https://github.com/redtidev1918/PixivFlow/issues/30)) ([46b23a0](https://github.com/redtidev1918/PixivFlow/commit/46b23a0edd6d54fc433fa7ca57edd09e92999d8a))

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
