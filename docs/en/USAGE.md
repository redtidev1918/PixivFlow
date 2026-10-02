# Features & Commands

Every download behavior in PixivFlow is driven by "command + config". This chapter explains the usage and boundaries of each capability; for config field details see [CONFIG](../CONFIG.md) (Chinese).

## Six download modes

| Mode | Usage | One-liner |
| --- | --- | --- |
| URL direct | `download --url <link>` | Paste and download; work type auto-detected |
| Tag search | targets config `mode: "search"` (default) | Batch collection by tag + filters |
| Ranking | targets config `mode: "ranking"` | Pull from daily/weekly/monthly rankings, then filter |
| Random | `random` command or target `random: true` | Randomly pick from results, keeping the surprise |
| Single work | URL / `illustId` / `novelId` | Precisely download one illustration or one novel |
| Whole user | User profile URL / `userId` | Collect all illustrations or novels of a user |

## URL direct download

`--url` overrides the targets in the config file and downloads only this one target:

```bash
pixivflow download --url "https://www.pixiv.net/artworks/123456789"
```

All 10 address shapes are supported:

| Format | Example |
| --- | --- |
| Illustration page (standard) | `https://www.pixiv.net/artworks/{id}` |
| With language prefix | `https://www.pixiv.net/en/artworks/{id}` |
| Short link | `https://www.pixiv.net/i/{id}` |
| Legacy illustration page | `https://www.pixiv.net/member_illust.php?illust_id={id}` |
| Novel | `https://www.pixiv.net/novel/show.php?id={id}` |
| Novel series | `https://www.pixiv.net/novel/series/{id}` |
| User profile | `https://www.pixiv.net/users/{id}` |
| User's illustration | `https://www.pixiv.net/users/{uid}/artworks/{id}` |
| User's novel | `https://www.pixiv.net/users/{uid}/novels/{id}` |
| Bare ID | `123456789` (treated as illustration) |

You can also express a target ad hoc as JSON without writing it into the config file:

```bash
pixivflow download --targets '[{"type":"novel","tag":"アークナイツ","limit":5}]'
```

## Tag search mode

The default mode. Only four core fields:

```json
{
  "type": "illustration",
  "tag": "風景",
  "limit": 20,
  "minBookmarks": 500
}
```

Advanced capabilities:

- **Multi-tag combination**: `"tag": "水彩 厚涂"` with `"tagRelation": "or"`
  means any hit counts (default AND — all tags required);
- **Sorting**: `sort` is one of `date_desc` / `date_asc` / `popular_desc`;
- **Match mode**: `searchTarget` is one of `partial_match_for_tags` /
  `exact_match_for_tags` / `title_and_caption`;
- **Date window**: `startDate` / `endDate`, supporting the `YESTERDAY` and `TODAY`
  placeholders — daily scheduled runs automatically roll to "yesterday";
- **Novel language filter**: `languageFilter: "chinese"` collects only Chinese novels,
  `non-chinese` the reverse; `languageCandidateLimit` controls how many candidates are
  backfilled for popularity-ordered checking (default 20); `strictLanguageFilter: true`
  rejects works that cannot be judged, e.g. bodies too short;
- **Exclude AI illustrations**: `excludeAI: true` excludes works explicitly marked by Pixiv
  as AI-generated (`illust_ai_type=2`) before the popularity Top-N selection.

## Ranking mode

With `mode: "ranking"` and no `filterTag`, the Pixiv ranking is pulled directly; with `filterTag` set,
works of that tag published on `rankingDate` are fetched and sorted locally by popularity:

```json
{
  "type": "illustration",
  "mode": "ranking",
  "rankingMode": "day",
  "rankingDate": "YESTERDAY",
  "filterTag": "風景",
  "limit": 10
}
```

`rankingMode` supports day / week / month / day_male / day_female / day_ai /
week_original / week_rookie and the corresponding R18 rankings; full values in
[CONFIG · targets](../CONFIG.md#targets-下载目标) (Chinese).

## Dedup & resume

Every work's download record is written to SQLite (default `./data/pixiv-downloader.db`):

- Works with an existing record are skipped — repeated runs are safe;
- When the file exists but the record is missing, reconciliation back-fills it — deleting the database does not destroy files;
- After an interruption, rerunning continues from the breakpoint instead of restarting the whole batch.

Use `normalize` to tidy existing files: it puts files back in place per the current directory organization rules.

## Scheduled tasks

```bash
pixivflow scheduler
```

Behavior highlights:

- Cron defaults to `0 3 * * *`, timezone `Asia/Shanghai`;
- `maxExecutions` caps total executions; `minInterval` prevents overly dense triggering;
- A single task can set a `timeout`; `maxConsecutiveFailures` stops after the threshold, and `failureRetryDelay` controls the retry interval after failures;
- Running bare `pixivflow` with no subcommand: if `scheduler.enabled` is true in config,
  it is equivalent to starting the scheduler; otherwise it runs one download.

For long-running servers, hand it to [Docker Compose](../DOCKER.md) (Chinese).

## WebUI

```bash
pixivflow web     # listens on port 3000; open http://localhost:3000 in a browser
```

Provides dashboard stats, download task management, URL download, file browsing and preview, history, realtime logs, and config editing. For REST and WebSocket details see [API](API.md); the frontend source lives in the separate repository [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui). In Docker, simply enable the `pixivflow-webui` service in compose.

For the interactive component map and the realtime pipeline description, see the frontend repository's [development guide](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/DEVELOPMENT_GUIDE.md) and [component guide](https://github.com/redtidev1918/pixivflow-webui/blob/master/docs/COMPONENT_GUIDE.md).

## Full command cheat sheet

Grouped by the categories of `pixivflow help` (commands evolve with releases — the full list follows `pixivflow help` output):

### Authentication

| Command | Description |
| --- | --- |
| `login [-u -p]` | Interactive login (browser authorization; account params also accepted) |
| `login-headless -u -p` | Login for headless environments; `--password-stdin` passes the password via stdin |
| `refresh <token>` | Inject an existing refresh token (aliases login-token / set-token); pass `-` to read from stdin |

### Download

| Command | Description |
| --- | --- |
| `download [--url \| --targets \| --config]` | Run one download (alias d) |
| `random` | Randomly download one from popular tags |
| `scheduler` | Start the resident scheduled-task process |

### Configuration

| Command | Description |
| --- | --- |
| `config` | View / edit / backup / restore config |
| `setup` | Interactive setup wizard, recommended for first use |
| `migrate-config` | Migrate legacy config paths (absolute to relative) |

### Monitoring & status

| Command | Description |
| --- | --- |
| `status` | Download stats and recent records |
| `health` | Health check: config, directory writability, connectivity |
| `logs` | View recent logs |
| `monitor` | Realtime monitoring of process state and performance metrics |

### Maintenance

| Command | Description |
| --- | --- |
| `backup` | Auto-backup config and data |
| `maintain` | Auto-maintenance: clean logs, optimize database, etc. |
| `normalize` | Normalize the directory structure of downloaded files |
| `dirs` | Show the actual save locations of each file kind |

### Utility

| Command | Description |
| --- | --- |
| `help [command]` | General help or per-command help |
| `version` | Show the version number |
| `web` | Start the WebUI server |

### Scheduler & delivery plane

| Command | Description |
| --- | --- |
| `run-once` | Run all enabled schedules once immediately, then exit |
| `execute-slot` | Execute one canonical occurrence once (batch/CI execution plane) |
| `runs` | List scheduler runs and show one execution summary |
| `outbox` | List / inspect / retry / cancel durable delivery intents |
| `gateway` | List configured messaging gateways, their delivery state and reachability |
| `delivery` | Inspect per-gateway delivery state and re-arm failed routes |
| `tags` | Discover related Pixiv tags, then explicitly apply selected tags |
| `topic` | Resolve a semantic topic into related tags (resolve) or dry-run a day selection (test) |

### Diagnostics & reconciliation

| Command | Description |
| --- | --- |
| `doctor` | Diagnose and (with `--repair`) converge slots, deliveries and outbox |
| `diagnose` | Minimal Pixiv data-plane egress probe (usage: `diagnose egress`) |
| `reconcile` | Reconcile a downstream-confirmed historical duplicate (dry-run unless `--repair`) |

---

## Related documents

- [CONFIG](../CONFIG.md) (Chinese) — detailed semantics of every target field
- [API](API.md) — WebUI backend interface reference
- [DOCKER](../DOCKER.md) (Chinese) — run the scheduler and WebUI long-term on a server
- [SCRIPTS](../SCRIPTS.md) (Chinese) — helper scripts in scripts/
