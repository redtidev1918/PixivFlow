# Login guide

**Language / 语言:** [中文](/LOGIN.md) · English

PixivFlow obtains credentials through Pixiv's OAuth interface. You sign in once, the
refresh token is written to your local config file, and every later command uses it
automatically — no repeated sign-in.

## The three login paths

| Path | Command | When to use |
| --- | --- | --- |
| Interactive login | `pixivflow login` | Desktop environment with a browser (the default recommendation) |
| Headless login | `pixivflow login-headless -u <username> -p <password>` | Servers, containers and other GUI-less environments |
| Token injection | `pixivflow refresh <refresh_token>` | You already hold a refresh token (e.g. you signed in on another machine) |

### Interactive login

```bash
pixivflow login                 # open the browser and authorise
pixivflow login -u <username> -p <password>   # or pass the account inline
```

The underlying implementation prefers
[pixiv-token-getter](https://www.npmjs.com/package/pixiv-token-getter) (a Node.js
implementation with zero extra dependencies); it falls back to Puppeteer automation
when that fails, and to [Python gppt](https://github.com/eggplants/get-pixivpy-token)
only as a last resort. In the normal case you **do not need Python installed**.

### Headless login

```bash
pixivflow login-headless -u user@example.com -p <password>
```

Both `-u` and `-p` are required. Add `-j` to make the output JSON, which is easier to
parse from scripts.

### Token injection

```bash
pixivflow refresh <refresh_token>

# A safer form that keeps the token out of shell history / the process list:
cat token.txt | pixivflow refresh -
```

This writes an existing refresh token into the config and refreshes the access token.
Typical uses:

- migrating a token from a desktop machine to a server;
- preparing credentials on the host before a Docker deployment (see [DOCKER](/DOCKER.md)（中文）).

The command has the aliases `login-token` and `set-token`, with identical behaviour.

### Headless username/password login (fallback)

```bash
pixivflow login-headless -u user@example.com -p <password>

# Keeping the password out of shell history:
echo "<password>" | pixivflow login-headless -u user@example.com --password-stdin
```

Browser login drives the Chrome/Chromium already present on the host (common install
locations and `PATH` are probed, or set `PUPPETEER_EXECUTABLE_PATH` explicitly).
PixivFlow no longer downloads Chromium itself, so install a browser on the server first —
the Docker image already ships one. The password passes through the server process, so
avoid this when you can — prefer moving a token instead.

## Where credentials are stored

After a successful sign-in the credential is written into the `pixiv` section of the
config file currently in use (usually `config/standalone.config.json`):

```json
{
  "pixiv": {
    "clientId": "...",
    "clientSecret": "...",
    "deviceToken": "pixiv",
    "refreshToken": "<your token>",
    "userAgent": "..."
  }
}
```

Two things to note:

1. **This file is equivalent to a password.** Never commit it to git and never share a
   screenshot of it. `config/` is already excluded by `.gitignore`.
2. Multiple config files (managed by `pixivflow config`) each keep their own credential.

## Expired tokens

When the refresh token stops working, any command that needs authentication fails with
a prompt to sign in again:

```
❌ Authentication Error
   Your refresh token may have expired or is invalid.
   Please login again to get a new refresh token:
     • Interactive login:  pixivflow login
     • Headless login:     pixivflow login-headless
```

Take either path:

- run `login` / `login-headless` again;
- if a valid token exists on another device, inject it directly with `refresh <token>`.

## Security checklist

- The config file contains credentials. Remove the `refreshToken` section before
  filing an issue or asking for help.
- Deploy to servers with `refresh` rather than a username and password, so no password
  is ever written to disk.
- The username and password only exist at the moment of login; they are not persisted.

---

## Related

- [QUICKSTART](QUICKSTART.md) — the full flow from installation
- [DOCKER](/DOCKER.md)（中文）— credential setup in containers
- [CONFIG](/CONFIG.md)（中文）— config file structure and the `pixiv` fields

> Pages marked **（中文）** are currently Chinese-only. Their English versions are
> being added incrementally.
