# Features & Commands

Language: [中文](../USAGE.md) · English

Use `pixivflow download --url` for a link, or `pixivflow download` to collect works with configured filters. The modes and commands are listed below; see the [configuration reference](CONFIG.md) for fields.

## Choose a download method

| Mode | Usage | One-liner |
| --- | --- | --- |
| URL direct | `download --url <link>` | Paste and download; work type auto-detected |
| Tag search | targets config `mode: "search"` (default) | Batch collection by tag + filters |
| Ranking | targets config `mode: "ranking"` | Pull from daily/weekly/monthly rankings, then filter |
| Topic discovery | targets config `mode: "topic"` and `topic` | Derive related tags from a topic, then filter works |
| Random | `random` command or target `random: true` | Randomly pick from results |
| Single work | URL / `illustId` / `novelId` | Precisely download one illustration or one novel |
| Whole user | User profile URL / `userId` | Collect all illustrations or novels of a user |

## URL direct download

`--url` uses the linked target for this run and leaves the configured `targets` unchanged. Replace this example with a real link:

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

## Novel export (Markdown / EPUB / PDF)

Add `--formats` to a download to produce local exports alongside the TXT; `--merge-series` binds a whole novel series into one book in Pixiv chapter order:

```bash
pixivflow download --url "https://www.pixiv.net/novel/show.php?id=26132156" --formats md
pixivflow download --url "https://www.pixiv.net/novel/show.php?id=26132156" --formats md,epub,pdf
pixivflow download --url "https://www.pixiv.net/novel/series/12345678" --formats md --merge-series
```

Already-downloaded novels can be re-exported offline without re-fetching the body or logging in again:

```bash
pixivflow novel-export --input "downloads/novels/26132156_Title.txt.novel.json" --formats md
pixivflow novel-export --input "downloads/novels/series-12345678.series.json" --formats md --merge-series
```

- **Markdown (`md`)** is the reader-facing export: it writes `<novel file name>.novel.md` next to the TXT and references the sibling `images/` directory for inline illustrations — copy the `.novel.md` plus `images/` pair anywhere (another machine included) and it reads offline. Pure-text novels export too; no illustration required.
  - `[chapter:]` becomes a heading, `[newpage]` a page separator, `[[jumpuri:]]` a link, `[[rb:]]` a ruby annotation with plain-text fallback, and `[jump:n]` an in-page anchor jump; Markdown metacharacters are escaped. Unconvertible markers and missing resources stay as literal text with a warning in the result — the body is never dropped.
  - It is a different file with different semantics from the rich-media sidecar (`<novel file name>.md`, consumed by TelePress for online reading); the sidecar and TelePress behavior are unchanged, and the Markdown export is never attached to a Telegram delivery.
  - Series: without `--merge-series` each chapter exports individually; with it you additionally get a `series-<id>.novel.md` omnibus (with a table of contents and chapter anchors that stay unique even for duplicate chapter titles).
- Chapters, `[newpage]` pagination, ruby annotations, inline illustrations, the cover and metadata are all preserved; the EPUB is fully offline with images packed from local bytes and no Pixiv CDN access.
- The TXT is always retained with an unchanged path; export failures only log a warning and never affect the download result or the delivery queue.
- PDF depends on an optional Chrome/Chromium that is never auto-installed: `--browser <chrome path>` (or the `PIXIVFLOW_PDF_BROWSER` environment variable); on servers/Docker without CJK fonts, embed one via `--font <font file>`. Without a browser, PDF reports `PDF_BROWSER_MISSING` explicitly while everything else keeps working.
- The corresponding target field in the config file is `novelExport`; see the "Novel export" section in [CONFIG](CONFIG.md) for semantics and limits.

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
[CONFIG · targets](CONFIG.md#targets-download-targets).

## Dedup & resume

Download records are stored in SQLite. Use `pixivflow dirs` to find the actual database location:

- Works with an existing record are skipped — repeated runs are safe;
- When the file exists but the record is missing, reconciliation back-fills it — deleting the database does not destroy files;
- After an interruption, rerunning skips completed works and continues with unfinished ones.

Use `normalize` to tidy existing files: it puts files back in place per the current directory organization rules.

## Scheduled tasks

Set `scheduler.enabled: true` and check the cron expression and time zone before running:

```bash
pixivflow config validate
pixivflow scheduler
```

Keep the process running and the computer on. Common settings:

- Cron defaults to `0 3 * * *`, timezone `Asia/Shanghai`;
- `maxExecutions` caps total executions; `minInterval` prevents overly dense triggering;
- A single task can set a `timeout`; `maxConsecutiveFailures` stops after the threshold, and `failureRetryDelay` controls the retry interval after failures;
- Running bare `pixivflow` with no subcommand: if `scheduler.enabled` is true in config,
  it is equivalent to starting the scheduler; otherwise it runs one download.

For long-running servers, hand it to [Docker Compose](DOCKER.md).

## WebUI

```bash
pixivflow web     # listens on port 3000; open http://localhost:3000 in a browser
```

The interface includes download statistics, URL downloads, task management, file previews, history, logs and configuration editing. For REST and WebSocket details, see [API](API.md). The frontend source is in [pixivflow-webui](https://github.com/redtidev1918/pixivflow-webui). In Docker, enable the `pixivflow-webui` service in Compose.

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
| `novel-export --input <file>` | Re-export a downloaded novel/series offline to Markdown/EPUB/PDF without re-fetching |
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
| `delivery` | Inspect delivery status, preview retries or retry unfinished deliveries |
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

- [CONFIG](CONFIG.md) — detailed semantics of every target field
- [API](API.md) — WebUI backend interface reference
- [DOCKER](DOCKER.md) — run the scheduler and WebUI long-term on a server
- [SCRIPTS](../SCRIPTS.md) (Chinese) — helper scripts in scripts/
