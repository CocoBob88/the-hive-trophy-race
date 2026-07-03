# The Hive Trophy Race

A playful monthly Brawl Stars club leaderboard for `The Hive` (`#2L9R0QPLQ`). The app records trophy snapshots, calculates each member's monthly gain, and applies the club rule that joiners start from their first snapshot while leavers are disqualified until they rejoin.

## Run It

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

The app uses real snapshot data only. To fetch data, create a key at [developer.brawlstars.com](https://developer.brawlstars.com/), then copy `.env.example` to `.env.local` and set:

```bash
BRAWL_API_TOKEN=your_token_here
BRAWL_CLUB_TAG=#2L9R0QPLQ
```

Supercell API keys are tied to allowed IP addresses, so the app must run from an IP address allowed by your key. Keep the token on the server only.

## Capture A Snapshot

```bash
npm run snapshot
```

Snapshots are stored in the compact local database `data/trophy-race-db.json` and ignored by git. Run that command on a schedule from an IP address allowlisted in the Supercell developer portal. Monthly races use UTC boundaries: each race starts at `00:00 UTC` on the first day of the month and ends at `00:00 UTC` on the first day of the next month.

If Vercel cannot call the Brawl Stars API because of Supercell's IP allowlist, fetch from an allowlisted machine and push the real snapshot into production:

```bash
npm run snapshot:push
```

This posts to `SNAPSHOT_IMPORT_URL` using `SNAPSHOT_SECRET` or `CRON_SECRET`, then stores the same snapshot locally as a backup.

The scheduled Windows collector is needed when the Supercell API key is locked to the home/laptop public IP. Vercel serves the website and stores snapshots, but the allowed machine collects the Brawl Stars data and pushes it to Vercel.

On Windows, the scheduled job can run the same production push every 15 minutes. Use an all-day 15-minute repeating task; it includes local `18:00` in Guatemala, which is `00:00 UTC` and captures the monthly rollover:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\run-snapshot-push.ps1
```

The runner writes its local log to `data/logs/snapshot-push.log`.

## VPS Collector

The preferred production collector location is a separate Linux project folder:

```text
/opt/the-hive-trophy-race
```

Store secrets outside git in:

```text
/etc/the-hive-trophy-race/collector.env
```

Install on Ubuntu:

```bash
sudo bash deploy/install_hive_collector_ubuntu.sh
sudo nano /etc/the-hive-trophy-race/collector.env
sudo systemctl start the-hive-trophy-race-collector.service
sudo systemctl start the-hive-trophy-race-collector.timer
systemctl list-timers the-hive-trophy-race-collector.timer
```

The timer runs `npm run snapshot:push` every 15 minutes. Supercell must allowlist the VPS public IP used by that server.

You can also POST to the app route:

```bash
curl -X POST http://localhost:3000/api/snapshot
```

If `SNAPSHOT_SECRET` is set, send it as a bearer token:

```bash
curl -X POST http://localhost:3000/api/snapshot -H "Authorization: Bearer your_secret"
```

## Vercel

This project includes `vercel.json` with a 15-minute cron:

```json
{ "path": "/api/snapshot", "schedule": "*/15 * * * *" }
```

For deployed persistence, connect a private Vercel Blob store and set the Vercel environment variables. After creating the Blob store and pulling/setting its read-write token locally, seed the current local database:

```bash
npm run blob:seed
```

The Brawl Stars API token is IP-allowlisted. Vercel's standard serverless outbound IPs are not stable, so live cron snapshots require Vercel Static IPs, a fixed-IP proxy, or running the snapshot job from a machine/VPS whose IP is allowed in the Supercell developer portal.

## Competition Rules Implemented

- First snapshot in a month becomes the baseline for existing members.
- New members qualify from their first snapshot after joining.
- Leaving disqualifies that member's current run.
- Rejoining starts a fresh run from the rejoin snapshot.
- The leaderboard ranks only currently qualified members by monthly trophy gain.
