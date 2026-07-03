# The Hive Trophy Race

A playful monthly Brawl Stars club leaderboard for `The Hive` (`#2L9R0QPLQ`). The app records trophy snapshots, calculates each member's monthly gain, and applies the club rule that joiners start from their first snapshot while leavers are disqualified until they rejoin.

## Run It

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Without an API token, the page shows preview data. To fetch real data, create a key at [developer.brawlstars.com](https://developer.brawlstars.com/), then copy `.env.example` to `.env.local` and set:

```bash
BRAWL_API_TOKEN=your_token_here
BRAWL_CLUB_TAG=#2L9R0QPLQ
```

Supercell API keys are tied to allowed IP addresses, so the app must run from an IP address allowed by your key. Keep the token on the server only.

## Capture A Snapshot

```bash
npm run snapshot
```

Snapshots are stored in `data/snapshots/YYYY-MM.json` and ignored by git. Run that command daily or hourly with Task Scheduler, cron, or a VPS scheduler.

You can also POST to the app route:

```bash
curl -X POST http://localhost:3000/api/snapshot
```

If `SNAPSHOT_SECRET` is set, send it as a bearer token:

```bash
curl -X POST http://localhost:3000/api/snapshot -H "Authorization: Bearer your_secret"
```

## Competition Rules Implemented

- First snapshot in a month becomes the baseline for existing members.
- New members qualify from their first snapshot after joining.
- Leaving disqualifies that member's current run.
- Rejoining starts a fresh run from the rejoin snapshot.
- The leaderboard ranks only currently qualified members by monthly trophy gain.
