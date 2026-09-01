# Security Policy

## Supported versions

Only the latest published version and the `master` branch receive security
fixes.

## Reporting a vulnerability

Do not open a public issue for security reports. Use GitHub's
[private vulnerability reporting](https://github.com/redtidev1918/PixivFlow/security/advisories/new)
or contact the maintainer directly, including:

- a description of the issue and its impact;
- reproduction steps or a proof of concept;
- affected versions.

## Scope notes

PixivFlow is a local CLI/WebUI tool. It talks to Pixiv and to delivery targets
that the deployer explicitly configures:

- it stores credentials locally (config directory; never committed) and does
  not send telemetry or upload any user data;
- areas worth attention are credential handling (login/token flow), command
  injection through crafted tag or URL input, path traversal via theme or
  config fields, and the WebUI server's request handling;
- Docker deployments should keep the container's port binding private
  (`127.0.0.1` unless you deliberately expose it).
- delivery credentials should be injected through `${ENV_NAME}` references;
  do not commit Bearer tokens or private endpoint URLs to configuration files;
- automated dependency scanning may report Puppeteer/node-cron advisories whose
  upstream fixes require dropping Node 18 support. Runtime-facing compatible
  transitive fixes are overridden promptly; the remaining login/scheduler
  upgrade boundary is reviewed with each supported-Node release.
