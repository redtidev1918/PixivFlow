# Android installation with Termux

Language: [中文](../TERMUX_INSTALL.md) · English

Termux can run the CLI on Android, import a login token and download works or run schedules. Android storage permissions and background restrictions can interrupt operation. If an always-on Docker host is available, [Docker](DOCKER.md) avoids these mobile environment limitations.

## Prepare Termux

Install from [F-Droid](https://f-droid.org/packages/com.termux/) or [GitHub Releases](https://github.com/termux/termux-app/releases). This guide targets those builds. The Google Play build uses a separate branch; see the [Termux installation instructions](https://github.com/termux/termux-app#installation). Install Termux and its plugins from the same distribution channel, and back up before switching.

```bash
pkg update && pkg upgrade
pkg install -y nodejs npm
node -v               # 22.13.0 or newer: built-in node:sqlite
npm -v                # 9 or newer
```

The application uses JavaScript dependencies and Node's built-in SQLite driver; it does not require `make`, `clang` or Python to install. Python is optional for the gppt login fallback (`pkg install -y python3`). Installation does not download a browser.

To write into Android shared storage, grant permission:

```bash
termux-setup-storage
```

## Install

```bash
npm install -g pixivflow
pixivflow --help
```

If installation fails, inspect the npm error, Node version, network, permissions and free space. When the problem is registry connectivity, you can use a mirror:

```bash
npm config set registry https://registry.npmmirror.com
npm cache clean --force
npm install -g pixivflow
```

Alternatively, build from source (install `git` if needed):

```bash
git clone https://github.com/redtidev1918/PixivFlow.git ~/PixivFlow
cd ~/PixivFlow
npm install
npm run build
npm link
```

## Login

Interactive login normally needs desktop Chrome/Chromium. The adapter chain is pixiv-token-getter → Puppeteer → Python gppt; Android does not provide the usual desktop browser environment. Obtain the token on another device first:

```bash
# On a computer with a browser:
pixivflow login
# In Termux, validate and save that refresh token:
pixivflow refresh <refresh_token>
pixivflow health
```

`refresh` stores the token in the active config. The login command prints credentials, so never share its terminal output, screenshots or raw logs. A refresh token grants account access; keep it out of chat and Git.

```bash
# Alternative only when your environment supports browser automation:
pixivflow login-headless -u USERNAME -p PASSWORD
```

Headless login can still require a browser and may fail on Android or on accounts with two-factor challenges. Use cross-device token import when it fails. See [Login](LOGIN.md).

## Configure and download

```bash
pixivflow setup
pixivflow dirs
pixivflow config show
pixivflow config set storage.downloadDirectory ~/downloads
```

Keep existing credentials and storage fields when editing `targets`:

```json
{
  "targets": [
    { "type": "illustration", "tag": "風景", "limit": 20 }
  ]
}
```

Prefer private Termux storage such as `~/downloads`. After `termux-setup-storage`, shared paths include `~/storage/shared` (`/sdcard`), `~/storage/downloads` (`/sdcard/Download`) and `~/storage/dcim` (`/sdcard/DCIM`). Keep SQLite in private storage: shared/FAT-like volumes may lack reliable locking.

```bash
pixivflow download --url https://www.pixiv.net/artworks/123456789
pixivflow download       # configured targets
pixivflow health
pixivflow dirs
```

To schedule the configured targets, merge this fragment into your config:

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

This five-field cron runs daily at 03:00 in the specified timezone. `pixivflow download` runs immediately without waiting for cron. [Configuration](CONFIG.md) describes independent schedules and limits.

## Keep the scheduler running

```bash
pkg install -y tmux
tmux new -s pf
pixivflow scheduler
# Ctrl+B, then D: detach
tmux attach -t pf
# Stop the session when desired:
tmux kill-session -t pf
```

Or use `nohup`:

```bash
nohup pixivflow scheduler > "$HOME/pixivflow.log" 2>&1 &
echo $! > "$HOME/pixivflow.pid"
kill $(cat "$HOME/pixivflow.pid")
```

Session persistence alone cannot prevent Android from suspending or killing the process. Use `termux-wake-lock` (release with `termux-wake-unlock`), exempt Termux from battery optimization, and keep its persistent notification enabled. Recent Android versions may also kill child processes through the Phantom Process Killer. Inspect system restrictions if scheduled work disappears while manual downloads still work.

```bash
pixivflow status
pixivflow logs
```

## Troubleshooting

| Problem | Action |
| --- | --- |
| Global install reports EACCES | `mkdir -p ~/pf && cd ~/pf && npm install pixivflow`; use `alias pixivflow="npx pixivflow"` in that directory |
| Registry timeout | Check network, then try the mirror or source installation |
| Command not found | Try `npx pixivflow --help`, or check npm's global bin PATH |
| Shared storage EACCES/read-only | Repeat storage permission setup; keep important data in private storage |
| Database initialization fails | Verify parent directory permissions and free space (`df -h ~`) |
| Login fails | Use token import; inspect browser availability and account challenges |
| HTTP 401 | Obtain a new token and run `pixivflow refresh` |
| Stops when screen turns off | Wake lock, battery exemption and foreground notification |
| Pixiv blocked on this network | Configure `network.proxy`; see [Configuration](CONFIG.md) |

Related: [Quick start](QUICKSTART.md), [Login](LOGIN.md), [Usage](USAGE.md).
