# Login guide

Language: [中文](../LOGIN.md) · English

After login, PixivFlow saves a refresh token to the active configuration and uses it for later downloads. Sign in again when the token stops working.

## Choose a login method

| Your environment | Command |
| --- | --- |
| Computer with Chrome / Chromium | `pixivflow login` |
| Valid token from another device | `pixivflow refresh -`, read from standard input |
| Server requiring username/password login | `pixivflow login-headless -u <username> --password-stdin` |

## Sign in on your computer

```bash
pixivflow login
```

The program opens your local browser. Follow the login page, then wait for the terminal to report success and the configuration save result.

PixivFlow uses an existing Chrome / Chromium installation. It does not download a browser. If none is found, install one or set `PUPPETEER_EXECUTABLE_PATH` to its executable path. The official Docker image includes a browser.

## Import an existing token

Put your own valid refresh token in a private local file named `token.txt`. On macOS / Linux:

```bash
cat token.txt | pixivflow refresh -
```

On Windows PowerShell:

```powershell
Get-Content -Raw token.txt | pixivflow refresh -
```

`-` reads the token from standard input, keeping it out of the command arguments. The file still contains credentials; store it privately or delete it after importing.

`pixivflow refresh <refresh_token>` also works, but entering a real token in the command saves it in shell history. `login-token` and `set-token` are aliases.

## Sign in on a server with a password

`login-headless` opens no visible window but still needs a browser runtime. Prepare a private file named `password.txt` containing only the password. On macOS / Linux:

```bash
pixivflow login-headless -u user@example.com --password-stdin < password.txt
```

On Windows PowerShell:

```powershell
Get-Content -Raw password.txt | pixivflow login-headless -u user@example.com --password-stdin
```

Replace the example email with your account. The username is required. Supply the password through `--password-stdin` or `-p <password>`. Using `-p` or `echo "real password"` leaves the password in shell history.

Add `-j` for JSON output in scripts. Login and refresh output can contain access and refresh tokens; check it before sharing screenshots or logs.

## Where credentials are stored

```bash
pixivflow dirs
```

Check the configuration file path in the output. Credentials are stored in `pixiv.refreshToken`; each configuration keeps its own credentials. Depending on the installation, the file may live outside the current directory.

Configuration files, token files and login output contain sensitive information. When filing an issue, include only relevant settings and remove passwords, tokens and API keys.

## Expired tokens

If authentication fails, run `pixivflow login` again. If another device has a valid token, import it using the steps above. For server password login, rerun `login-headless`.

Check that successful login also saved the configuration. If saving failed, use `pixivflow dirs` to locate the file and check directory write permissions. For connection problems, see [network and proxy settings](CONFIG.md#network-network--proxy).

## Related guides

- [Quick start](QUICKSTART.md): installation and your first download
- [Configuration reference](CONFIG.md): credential fields and configuration paths
- [Docker](../DOCKER.md) (Chinese): credentials in containers
