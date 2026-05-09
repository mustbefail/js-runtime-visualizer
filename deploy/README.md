# Deploy runbook — Hetzner Cloud + nginx

The CI workflow builds the static SPA and rsyncs `packages/ui/dist/` to a
Hetzner Cloud server, where nginx serves it on port 80.

> **No domain yet.** The site is reachable at `http://<server-ip>/`. TLS
> requires a domain (Let's Encrypt) — add that as a separate iteration.

---

## One-time setup

Order matters. Do it once in this sequence and the workflow will succeed
on the first push.

### 1. Server bootstrap

SSH into the Hetzner box and run the setup script. Defaults to
`DEPLOY_USER=root` and `DEPLOY_PATH=/var/www/jsrv`.

```bash
# From your laptop:
scp deploy/setup-server.sh deploy/nginx.conf root@<server-ip>:/tmp/
ssh root@<server-ip>
chmod +x /tmp/setup-server.sh
sudo DEPLOY_USER=root DEPLOY_PATH=/var/www/jsrv /tmp/setup-server.sh
```

The script installs nginx, writes `/etc/nginx/sites-available/jsrv`,
enables it as the default server, and reloads. Idempotent — safe to re-run.

### 2. Deploy SSH key

Generate a key dedicated to deploys (do **not** reuse your personal one):

```bash
ssh-keygen -t ed25519 -f ~/.ssh/jsrv_deploy_key -N "" -C "jsrv-deploy"
```

Add the **public** key to the server:

```bash
ssh-copy-id -i ~/.ssh/jsrv_deploy_key.pub root@<server-ip>
# or manually:
cat ~/.ssh/jsrv_deploy_key.pub | ssh root@<server-ip> 'cat >> ~/.ssh/authorized_keys'
```

Verify:

```bash
ssh -i ~/.ssh/jsrv_deploy_key root@<server-ip> 'echo ok'
```

### 3. GitHub secrets

`Settings → Secrets and variables → Actions → New repository secret`. Add:

| Name              | Value                                                |
| ----------------- | ---------------------------------------------------- |
| `DEPLOY_HOST`     | The Hetzner IPv4 (e.g. `203.0.113.42`)               |
| `DEPLOY_USER`     | `root`                                               |
| `DEPLOY_PATH`     | `/var/www/jsrv`                                      |
| `DEPLOY_SSH_KEY`  | Contents of `~/.ssh/jsrv_deploy_key` (private key)   |
| `DEPLOY_PORT`     | `22` (only set if you use a non-standard SSH port)   |

The private key value must include the `-----BEGIN OPENSSH PRIVATE KEY-----`
header and trailing newline — paste the file contents verbatim.

### 4. First deploy

```bash
git push origin main
```

The workflow runs vitest → playwright e2e → vite build → rsync → smoke check
(HTTP 200 on `/`). Watch it in `Actions` tab. On success, open
`http://<server-ip>/` in a browser.

`workflow_dispatch` is also enabled — you can trigger a deploy manually
from the Actions UI without pushing.

---

## What runs in CI on every push to main

1. `npm ci`
2. `npm test` — 168 vitest specs (engine + atoms + canvas helpers)
3. `npm run e2e` — 5 Playwright Chromium specs (cached browser binary)
4. `npm run ui:build` — Vite production bundle
5. `rsync -avz --delete packages/ui/dist/ → <user>@<host>:<path>/`
6. `curl http://<host>/` — fail the deploy if the site doesn't return 200

If tests or e2e fail, deploy is skipped — `dist/` on the server stays at
the last green build.

---

## Rolling back

The simplest revert is `git revert <bad-sha> && git push`. The workflow
redeploys the previous good state.

For an emergency manual rollback:

```bash
ssh root@<server-ip>
# Keep a copy of the good build before deploying again, or use:
git -C /path/to/local/repo checkout <good-sha>
npm run ui:build
rsync -avz --delete packages/ui/dist/ root@<server-ip>:/var/www/jsrv/
```

---

## Adding a domain later

When you have one:

1. Point an `A` record at the Hetzner IP.
2. `apt-get install certbot python3-certbot-nginx`
3. `certbot --nginx -d your.domain` — picks up `/etc/nginx/sites-available/jsrv`
   and adds TLS automatically.
4. Update `deploy/nginx.conf` to set `server_name your.domain;` for the
   next bootstrap, but the live config is fine until you re-run `setup-server.sh`.
