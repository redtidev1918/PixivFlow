# Migrating from v1 scripts to the CLI

Language: [中文](../MIGRATION.md) · English

If you still run `scripts/pixiv.sh`, migrate to the standalone `pixivflow` command. Users already on the CLI should consult the [changelog](https://github.com/redtidev1918/PixivFlow/blob/master/CHANGELOG.md). This guide preserves the v1→v2 transition while using the current runtime requirement, Node.js **22.13.0+** and npm **9+**.

## Entry point and config locations

```bash
npm install -g pixivflow
pixivflow --help
pixivflow dirs
```

The npm package registers `dist/index.js` as the executable. It works outside the repository. Shell wrappers remain available for source-based development. Running `pixivflow` without a command starts the scheduler if `scheduler.enabled` is true; otherwise it performs one download run.

Configuration selection is explicit `--config` > `PIXIV_DOWNLOADER_CONFIG` > detected/default config. The selected absolute path is shared by downstream modules. Explicit missing files are errors, never a reason to select another file silently. Missing implicit defaults can be created automatically.

| Context | Default location |
| --- | --- |
| Recognized deployment project root | `<root>/config/standalone.config.json` |
| Global installation with `~/pixivflow/` | `~/pixivflow/config/` |
| Other installations | `~/.pixivflow/config/` |

Run `dirs` after migration to verify the actual file, credentials, targets and download paths. CLI help/output is predominantly English; older shell wrappers may print Chinese. Unknown commands suggest similar names; failures return a nonzero exit code.

## Command mapping

| v1 operation | Current CLI | Notes |
| --- | --- | --- |
| `./scripts/easy-setup.sh` | `pixivflow setup` | Interactive setup |
| `./scripts/login.sh` | `pixivflow login` (`l`) | Browser login |
| `login.sh --headless -u ... -p ...` | `pixivflow login-headless` (`lh`) | Browser automation without a visible window |
| Existing refresh token | `pixivflow refresh <token>` (`r`) | Token import/validation |
| `./scripts/pixiv.sh once` | `pixivflow download` | Configured targets |
| Direct URL | `pixivflow download --url <url>` | No target config change |
| `./scripts/download-with-config.sh` | `pixivflow download --targets <json>` or a chosen config | Similar purpose, not identical wrapper behavior |
| `./scripts/download-ranking.sh` | Keep the script or configure a ranking target | No one-to-one command |
| `./scripts/pixiv.sh run` | `pixivflow scheduler` | Foreground scheduler |
| `./scripts/pixiv.sh random` | `pixivflow random` | `--novel` selects novels |
| `./scripts/pixiv.sh status` | `pixivflow status` (`stats`) | Counts and recent records |
| `./scripts/pixiv.sh logs` | `pixivflow logs` | Recent logs |
| `./scripts/pixiv.sh stop` | Ctrl+C or process manager | No built-in stop command |
| `config-manager.sh` | `pixivflow config show/validate/set/edit/backup/restore/list/diff` | Config subcommands |
| `auto-backup.sh` | `pixivflow backup` (`backup-data`) | Config/data backup |
| `auto-maintain.sh` | `pixivflow maintain` (`cleanup`) | Logs/database maintenance |
| `auto-monitor.sh` | `pixivflow monitor` (`watch`) | Process status |
| `health-check.sh` | `pixivflow health` (`check`) | Health diagnostics |
| Count files manually | `pixivflow dirs` (`paths`) | `--verbose` shows more detail |
| `node dist/index.js --version` | `pixivflow version` (`v`) | Version/build information |

Additional CLI tools include `normalize` for downloaded files and `web` (`webui`, `w`) for the browser interface, supporting `--port`, `--host` and `--config`. See [Usage](USAGE.md) for the full current command set.

## Path migration

`migrate-config` (`mc`) converts four absolute storage paths to relative paths: `databasePath`, `downloadDirectory`, `illustrationDirectory`, `novelDirectory`. It does not convert a separate v1 schema into v2; both use `standalone.config.json`.

```bash
pixivflow config backup
pixivflow migrate-config --dry-run
pixivflow migrate-config
pixivflow migrate-config --json
pixivflow migrate-config --config ~/pixivflow/config/standalone.config.json
```

Relative storage paths resolve against the **config directory**, not the shell's working directory. Config loading can also repair absolute paths that are unavailable in the new environment. Manual migration gives you a preview and a backup opportunity. Use `pixivflow config restore` to restore the config if necessary. Typical cases are moving an old installation to another machine or replacing host paths with Docker mounts.

## Common questions

- **Can I reuse the token?** Yes; existing refresh tokens remain usable until Pixiv invalidates them. On authentication failure use [Login](LOGIN.md) to import or obtain a new token.
- **Must I clone the repository?** No for npm CLI use. Yes for source changes, helper scripts and source-built Docker images.
- **Where did my downloads go?** Run `pixivflow dirs`, then check config precedence and storage settings.
- **How do I open the WebUI?** Run `pixivflow web`. npm distributions bundle frontend files; source installations may need a frontend build. See [WebUI](WEBUI.md).
- **Does the old cron still work?** Legacy `scheduler.cron` and `scheduler.timezone` remain supported. Independent `schedules` take precedence when configured.

Related: [Configuration](CONFIG.md), [Usage](USAGE.md), [Helper scripts](../SCRIPTS.md) (Chinese), [Docker](DOCKER.md).
