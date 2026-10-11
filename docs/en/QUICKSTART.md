# Quick start

Language: [中文](../QUICKSTART.md) · English

Download one work to check your login and connection, then set up batch collection or scheduling. Run these commands in PowerShell on Windows, or a terminal on macOS / Linux.

## Install and sign in

You need Node.js 22.13+, npm 9+, a Pixiv account and a network that can reach Pixiv.

```bash
node -v
npm -v
npm install -g pixivflow
pixivflow --help
```

Once the help text appears, sign in:

```bash
pixivflow login
```

The program opens Chrome / Chromium on your computer. After login, it saves credentials to the active configuration for later downloads. Servers and phones can import an existing login token; see the [login guide](LOGIN.md).

## Download your first work

Replace the example URL with a real work link:

```bash
pixivflow download --url "https://www.pixiv.net/artworks/123456789"
```

You can download a novel too:

```bash
pixivflow download --url "https://www.pixiv.net/novel/show.php?id=12345678"
```

After downloading, check file locations and records:

```bash
pixivflow dirs
pixivflow status
```

`dirs` shows the actual paths for your configuration, downloads and database. Global installations and source checkouts can use different paths; check this output before editing configuration or looking for files.

To view records in a browser, run `pixivflow web` and open the address shown in the terminal. The default is `http://localhost:3000`. Keep the command running while using the interface.

## Download by tag

For initial setup of tags, storage and scheduling, run `pixivflow setup`. If you already have a configuration, back it up and edit it:

```bash
pixivflow config backup
pixivflow config edit
```

Replace `targets` with the array below and keep other fields, including `pixiv`. This example downloads up to 20 landscape illustrations per run:

```json
{
  "targets": [
    { "type": "illustration", "tag": "風景", "limit": 20 }
  ]
}
```

Save, validate and download:

```bash
pixivflow config validate
pixivflow download
```

Works already in your download history are skipped, so new downloads may be fewer than `limit`. See the [configuration reference](CONFIG.md) for more filters.

## Set a download schedule

Add or update `scheduler` in your existing configuration. This example runs daily at 03:00 in the Asia/Shanghai time zone:

```json
{
  "scheduler": {
    "enabled": true,
    "cron": "0 3 * * *",
    "timezone": "Asia/Shanghai"
  }
}
```

Save and start:

```bash
pixivflow config validate
pixivflow scheduler
```

Keep the program running and the computer on. Press `Ctrl+C` to stop. For server operation, see the [Docker guide](DOCKER.md).

## Troubleshooting

| Symptom | What to check |
| --- | --- |
| Command not found | Reopen the terminal; check the global npm installation and that its executable directory is in `PATH` |
| Login fails or credentials expire | Run `pixivflow login` again, or import a valid token as described in the [login guide](LOGIN.md) |
| No works downloaded | Check tags, dates and bookmark filters; matching works may already be downloaded |
| Cannot reach Pixiv | Run `pixivflow health`; see the [network settings](CONFIG.md#network-network--proxy) if you need a proxy |
| Scheduled task did not run | Check `scheduler.enabled`, the time zone and schedule, and whether the process is still running |

When asking for help, include your version, operating system, command and error output. Remove passwords, tokens and other credentials first.
