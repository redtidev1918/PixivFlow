# Quick start

**Language / 语言:** [中文](/QUICKSTART.md) · English

Three commands take you through the whole flow: install → sign in → download.

## 1. Requirements

- Node.js 22.13 or newer (use a still-supported LTS in production)
- npm 9+
- A network that can reach Pixiv normally

Check your Node version:

```bash
node -v   # v22.13 or newer
```

## 2. Install

```bash
npm install -g pixivflow
pixivflow --help    # printing help means the install worked
```

Prefer not to install globally? Run from source:

```bash
git clone https://github.com/redtidev1918/PixivFlow.git
cd PixivFlow
npm install
npm run build
npm run download    # equivalent to pixivflow download
```

## 3. Sign in to your Pixiv account

You only sign in once; the credential is stored in your local config file:

```bash
# Desktop environment with a browser: authorise in the browser
pixivflow login

# Server without a GUI: username and password
pixivflow login-headless -u <username> -p <password>

# Already have a refresh token: inject it directly
pixivflow refresh <refresh_token>
```

For the details and the differences between the three paths, see the
[login guide](LOGIN.md).

## 4. Your first download

The simplest way — paste any Pixiv link; illustrations, novels, series and user
profiles are all recognised:

```bash
pixivflow download --url https://www.pixiv.net/artworks/123456789
```

Files land in `./downloads` (configurable) and the database in `./data/`; the two
together give you automatic de-duplication.

Collecting by tag needs a little configuration. Edit
`config/standalone.config.json` and change `targets` to what you want, for example
20 `風景` illustrations a day:

```json
{
  "targets": [
    {
      "type": "illustration",
      "tag": "風景",
      "limit": 20
    }
  ]
}
```

Then run:

```bash
pixivflow download
```

Every field is documented in the [configuration reference](/CONFIG.md)（中文）; if
you would rather not write it by hand, use the interactive wizard:

```bash
pixivflow setup
```

## 5. Collect on a schedule

Once `targets` is configured, start the scheduler and it runs unattended:

```bash
pixivflow scheduler
```

By default it runs once a day at 03:00 (`cron: "0 3 * * *"`, timezone
`Asia/Shanghai`); see the [configuration reference · scheduler](/CONFIG.md#scheduler-定时任务)（中文）
to change the frequency. On a server, [Docker Compose](/DOCKER.md)（中文）is the
recommended host — automatic restarts and a built-in health check.

## 6. Verify the environment

```bash
pixivflow health    # config completeness, directory writability, Pixiv connectivity
pixivflow status    # download statistics and recent records
pixivflow dirs      # where each kind of file actually goes
```

If every item `health` reports passes, you are ready.

## Common first-day problems

| Symptom | What to do |
| --- | --- |
| `Authentication Error` | The refresh token expired. Run `login` or `refresh` again; see [LOGIN](LOGIN.md#expired-tokens) |
| 0 works downloaded | The filters are too strict (bookmarks / dates / limit). Get it working with a minimal config first, then tighten. Search terms must match the site's casing and language |
| Cannot reach Pixiv | Common on corporate and campus networks — use a proxy, see [CONFIG · network](/CONFIG.md#network-网络与代理)（中文） |

---

## Related

- [LOGIN](LOGIN.md) — sign-in details and token maintenance
- [CONFIG](/CONFIG.md)（中文）— every configuration field
- [USAGE](/USAGE.md)（中文）— the six download modes and all commands
- [DOCKER](/DOCKER.md)（中文）— the preferred server deployment

> Pages marked **（中文）** are currently Chinese-only. Their English versions are
> being added incrementally.
