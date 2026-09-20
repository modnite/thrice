# Running THRICE

THRICE runs as one Docker Compose stack. It needs Docker with the Compose plugin and about 2 GB of memory while building.

Everything about your business is set inside the app. The `.env` file holds only the database password and a few switches.

## The short version

```bash
cp .env.example .env        # change POSTGRES_PASSWORD
docker compose up -d --build
```

Open `http://<this-machine>:3000`. The first visit shows a setup page. Find its one-time setup code in the server log:

```bash
docker compose logs migrate
```

Enter the code, name your business and create the owner account. That is the whole install.

The code stops a stranger who finds a new public server first from claiming it. It works once and disappears when the owner exists.

Owner and staff accounts live only in the database. Add staff under **Settings > Team**. No passwords are kept in `.env`.

### Locked out?

Someone with access to the server can set a new random password for any account:

```bash
docker compose exec worker pnpm --filter web exec tsx src/scripts/reset-password.ts owner@example.com
```

## Local testing on an OpenMediaVault tower

This is plain http on your own network. Nothing is exposed to the internet.

1. Put the project folder on the tower, for example in a shared folder for app data. Copy it over the network or run `git clone` over SSH.
2. In that folder run `cp .env.example .env` and set `POSTGRES_PASSWORD` to letters and numbers.
3. OpenMediaVault's own web page uses port 80. Port 3000 is usually free. If something else has it, set `APP_PORT=8080` in `.env`.
4. Run `docker compose up -d --build`. The first build takes a few minutes. Building on a small NAS can be slow, but it only happens on updates.
5. Open `http://<tower-ip>:3000` from any device on the network and complete the setup page with the code from the log.

The compose plugin's own screen can manage the stack too. Point it at the same folder and `docker-compose.yml`.

Sign-in works over plain http because the session cookie only asks for HTTPS when the request came in over HTTPS.

To update later, replace the project files and run `docker compose up -d --build` again. Your data lives in Docker volumes and survives.

### Connecting the studio website while testing

Run the studio site on your PC or on the tower. In THRICE open **Settings > Integrations**, set the THRICE address to `http://<tower-ip>:3000` and create a key. Paste the two lines it shows into the site's settings. Both machines must be on the same network.

## Production on a Hetzner Cloud server

1. Create a server. A CX22 (2 vCPU, 4 GB) is plenty. Pick Ubuntu 24.04 and add your SSH key.
2. In the Hetzner firewall allow ports 22, 80 and 443 only.
3. Install Docker: `curl -fsSL https://get.docker.com | sh`.
4. Point a DNS record for your domain at the server's IP.
5. Copy the project to the server and run `cp .env.example .env`. Set:
   - `POSTGRES_PASSWORD` to a long value of letters and numbers
   - `THRICE_DOMAIN` to your domain, for example `admin.example.com`
   - `APP_BIND=127.0.0.1` so the app is only reachable through HTTPS
6. Run `docker compose --profile proxy up -d --build`. Caddy fetches the certificate by itself.
7. Open `https://<your domain>` and complete the setup page with the code from the log.
8. In **Settings > Integrations** save the THRICE address and create the website's key.

### Backups

A backup service dumps the database every night into a Docker volume and keeps 14 days. That volume lives on the same disk as the data. Also turn on Hetzner server backups or copy the dumps off the server. See the README for restore steps.

### The studio website on the same server

Two stacks cannot both use ports 80 and 443. The simplest arrangement is one server for THRICE and a second small one for the website. To share one server, let the website's Caddy also proxy the THRICE domain to the THRICE app, and leave THRICE's own proxy profile off. Ask for help with this once the domains are known.

## Changing things later

| Want to | Where |
| --- | --- |
| Business name, hours, payment options | Settings |
| THRICE address, website address, API keys | Settings > Integrations |
| Add staff | Settings > Team |
| Turn on email | Settings > Integrations > Email (with a test button) |
| Move to a new server | Restore a database backup there and start the stack |
