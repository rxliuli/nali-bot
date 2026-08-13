# Nali（Nǎlǐ 哪里）— 猜城市 Discord Bot

A city-guessing game bot for **Chinese ⇄ English language-exchange servers**. The bot posts a photo of a city; players guess the city name in the language they're learning (Chinese or English); after 90 seconds the answer is revealed together with a static map and the round's results.

- **Runtime**: Cloudflare Workers (HTTP interactions, no Gateway)
- **Framework**: [discord-hono](https://github.com/luisfun/discord-hono)
- **State**: Durable Objects — one `GameRoom` per channel (`idFromName(channelId)`), timed reveal via `storage.setAlarm()`
- **Data**: one self-contained deck folder `decks/cn-cities/` (deck.json + its WebP images, 中国城市 only in v1); photos are your own, optimized in place by a single script, served via jsDelivr from a public repo
- **Install mode**: **User-Installed App** — no guild member context, so **all outbound messages go through interaction webhook tokens** (`POST /webhooks/{application_id}/{interaction_token}`, valid ~15 min). The bot token is never used at runtime.

## Commands

| Command | Description |
|---|---|
| `/play [deck]` | Start a round (deck: 中国城市 / 美国城市). One round per channel at a time. |
| `/stop` | End the current round early and reveal. |
| `/rank` | This channel's cumulative leaderboard (top 10). |
| `/ping` | Health check. |

Flow: `/play` → question card (a random photo of a random city + hint + 90s countdown) + **我要猜 / Guess** button → modal → ephemeral ✅/❌ feedback (wrong answers can be retried, unlimited) → alarm reveals the answer (with the specific landmark name, e.g. 📍 故宫 / Forbidden City) + static map + who got it right (🥇🥈🥉) + updated scores. Scoring: **+1** per correct answer, **+1 bonus** for the first correct answer of the round.

## Architecture

```
src/
  index.ts            # discord-hono entry: buildApp(), routes, exports GameRoom
  env.ts              # Bindings + Variables types
  config.ts           # CDN base for deck images (swap for R2 later)
  commands/           # play / stop / rank
  components/         # guessButton (button → modal), guessModal (submit → judge)
  game/               # types, judge (pure, unit-tested), embeds, decks registry,
                      # map URL builder, interaction helpers
  do/GameRoom.ts      # Durable Object: round state, scoring, alarm reveal
decks/
  cn-cities/          # one folder per deck: deck.json (metadata) + <cardId>.webp images
scripts/
  register.ts         # global command registration (user install!)
  dev/                # dev utilities (optimize-images, audit-judge)
test/                 # judge unit tests + GameRoom DO tests + routing E2E
branding/             # app icon etc. (not part of the bot)
wrangler.jsonc
```

### Answer judgment (`src/game/judge.ts`)

1. trim + fullwidth→halfwidth + lowercase
2. contains Chinese? → `zh` alias pool, else `en` pool (English + pinyin)
3. Chinese: strip trailing `市 / 省 / 特别行政区`
4. English: strip spaces, `'`, `-`, `.` (so `Xi'an` == `xian`, `St. Louis` == `stlouis`)
5. exact match first; English-only typo tolerance: distance ≤ 1, or distance 2 when similarity ≥ 0.8 (e.g. `Filadelphia` → `philadelphia`, but **not** `hangzhou` → `guangzhou`). Chinese has no fuzzy matching.

Run the collision audit after editing decks: `pnpm audit:judge`.

## Setup & Deploy

### 1. Prerequisites

- Node 20+ and `wrangler` (`npm i -g wrangler` or use `npx`), logged in: `wrangler login`
- A Discord application in the [Developer Portal](https://discord.com/developers/applications)

### 2. Discord application (user install — critical)

1. Create an application; copy the **Application ID** and **Public Key**; create a **bot** and copy its **token**.
2. **Installation** page → *Install Link* → **User Install**, and in *Installation Contexts* keep both **Server Install** and **User Install** checked (so the user-install link works).
3. **OAuth2** page → default link should target the app. Use the generated install link to add the app to your own account.
4. **Interactions Endpoint URL**: point it at your deployed Worker (`https://nali-bot.rxliuli.workers.dev`). Press *Save* — this verifies the endpoint (returns `Operational🔥` on GET, handles `PING` correctly).
5. **Terms of Service / Privacy Policy URLs**: in the app's **General Information** page, fill the *Terms of Service URL* and *Privacy Policy URL* fields with the URLs of [`TERMS_OF_SERVICE.md`](TERMS_OF_SERVICE.md) and [`PRIVACY_POLICY.md`](PRIVACY_POLICY.md) in this repo (e.g. `https://raw.githubusercontent.com/<owner>/<repo>/main/TERMS_OF_SERVICE.md`). *Replace the placeholder contact email in both files first.*

### 3. Secrets

```bash
wrangler secret put DISCORD_TOKEN        # bot token (only used by scripts/register.ts)
wrangler secret put DISCORD_PUBLIC_KEY   # from Developer Portal → General Information
wrangler secret put DISCORD_APPLICATION_ID
```

For local dev, copy `.dev.vars.example` → `.dev.vars` and fill in the same three values.

### 4. Register commands

```bash
# .env (gitignored):
#   DISCORD_APPLICATION_ID=...
#   DISCORD_TOKEN=...
pnpm register
```

Commands are registered **globally** (guild commands don't support user install) and carry `integration_types: [1]` + `contexts: [0, 1, 2]`. Global commands are cached — allow up to ~1 hour (usually minutes); Ctrl+R in Discord to refresh sooner. Don't re-register repeatedly while debugging.

### 5. Deploy & verify

```bash
pnpm run deploy
# then, in a server where you do NOT have admin rights:
# /ping  →  pong
# /play  →  question card
```

## Local development

```bash
pnpm dev          # wrangler dev (GET / → Operational🔥; unsigned POST → 401)
pnpm typecheck    # tsc for src/scripts + test/
pnpm test             # vitest (Workers runtime pool)
```

To exercise the real Discord flow locally, expose the dev server (e.g. `wrangler dev --remote` or a tunnel) and point the Interactions Endpoint URL at it.

## Testing

- `test/judge.test.ts` — normalization + matching (16 cases: 哈尔滨市==哈尔滨, Xi'an==xian, Filadelphia fuzzy match, wulumuqi→乌鲁木齐, no false positives…)
- `test/GameRoom.test.ts` — DO: round lifecycle, concurrency guard, guessing rules, alarm/stop reveal (webhook URL + payload), scoring & ranking, cross-channel isolation, failed-reveal handling
- `test/routing.test.ts` — full interaction routing: PING, /play → embed+button, duplicate /play rejected, button → modal, modal submit → ephemeral feedback, /stop → webhook reveal, /rank

## Deck images (your own photos)

1. Drop camera photos into `decks/cn-cities/` named `<cardId>.jpg` — first photo `beijing.jpg`, extra views `beijing-2.jpg`, `beijing-3.jpg`, … (the script lists any missing ids).
2. `pnpm optimize:images` — for each photo: resize to max 1200px, strip EXIF (incl. GPS), encode WebP quality 80, rename to `<cardId>.webp` / `<cardId>-N.webp`, **delete the source** (single copy kept), and sync the `images` array in `deck.json` (preserving hand-written `label` fields). `-- --keep` archives sources to `decks/cn-cities/.archive/` (gitignored) instead; `-- --check` verifies ≥1 image per card.
3. (Optional) Add location labels in `deck.json` — shown on reveal only: `"label": { "zh": "故宫", "en": "Forbidden City" }`.
4. Only cities that have photos are playable — `/play` picks from image-ready cards.
3. Commit the deck folder (deck.json + webp).
5. The runtime resolves image paths via `src/config.ts` → jsDelivr: `https://cdn.jsdelivr.net/gh/<owner>/<repo>@main/…` — **fill in your public repo's owner/name there** before images will load. Moving to R2 later = change that one constant.

## Design docs

- [`docs/images.md`](docs/images.md) — 图片模型：每城多图 + 每图 JSON 化（地标标注）已实施；地图坐标维持城市级（每图坐标 v2）。

## Notes & known limits (v1)

- Round length is 90s — well inside the 15-minute interaction-token window; the reveal uses the `/play` token.
- If the reveal webhook fails (token expired/revoked), the round is cleaned up and the failure is logged — no retry.
- Static maps use Yandex Static Maps (the classic OSM staticmap services are defunct). Swap provider in `src/game/map.ts` (`buildMapUrl`).
- Deck images require a **public** GitHub repo (jsDelivr serves public repos only). Until the repo is public, images won't load — fill in `src/config.ts` and push the `decks/` folder.
- No D1/KV/R2 yet; decks are static JSON. No user-created decks. No language enforcement (any alias in either language counts).
- Runtime never uses the bot token — only interaction webhook tokens (a user-installed app has no guild membership, so `POST /channels/{id}/messages` would 403).

## Maintaining decks

```bash
pnpm optimize:images            # photos → <cardId>.webp, deletes sources, syncs deck.json
pnpm optimize:images -- --keep   # archive sources to decks/<deck>/.archive/ instead
pnpm optimize:images -- --check  # verify every card has ≥1 image
pnpm audit:judge                 # check for answer collisions
pnpm lint                        # broken image links + orphaned files (run after hand-edits / CI)
```

Edit `decks/cn-cities/deck.json` directly to add/remove cities (metadata: names, coords, answers, hints) and to write per-image `label`s; the `images[].path` fields are maintained by the optimize script.

## Legal

- [Terms of Service](TERMS_OF_SERVICE.md)
- [Privacy Policy](PRIVACY_POLICY.md)
