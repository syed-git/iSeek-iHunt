# iSeek · iHunt — AI lost & found network

One Node.js project with two connected web apps:

| App | Path | Who | What |
|---|---|---|---|
| **iHunt** | `/ihunt` | Police stations, airport / railway lost-property offices, corporate security desks | Log found items (station, category, up to 5 photos, date & time found), AI auto-tagging, today's pickup appointments, approve / reject pending claims, inventory |
| **iSeek** | `/iseek` | Citizens | Find an item by uploading up to 5 photos or by describing it, see where it is held (station address, phone, email, hours, map), book a pickup, get notified when an unmatched item is later handed in |

The landing page at `/` links to both.

## How the AI works

Everything runs **inside the Node process** — no API key or external AI service is needed.

- Model: [`Xenova/clip-vit-base-patch32`](https://huggingface.co/Xenova/clip-vit-base-patch32) (OpenAI CLIP, 8-bit ONNX) via [Transformers.js](https://huggingface.co/docs/transformers.js). It is downloaded once into `models/` by `npm run build`.
- **Indexing**: every found-item photo is embedded into CLIP's image space when the officer submits it (seed items are indexed on first start). CLIP zero-shot prompts also tag each item with a category and dominant colours.
- **Photo search**: query photos are embedded and compared with every indexed photo (cosine similarity), blended with category/colour agreement, then calibrated into a confidence score.
- **Description search**: the text is embedded into the *same* space ("visualised"), compared with item photos, and combined with category/colour/keyword matches from the text.
- **Watchlist**: if nothing matches, iSeek shows *"Your item has not been found yet. We will let you know when the item is found by sending a notification."*, stores the photos/description and their embeddings, and every new item logged in iHunt is compared against all open reports. Matching users get an in-app notification with a link to the item.
- **Officer assistant**: in iHunt, adding photos triggers an AI suggestion of category, title, colours and description.
- The search UI shows the agent's reasoning trace (what it saw, which categories/colours it detected, how many items it compared).

`server/ai/llm.js` contains an optional GPT-4o re-ranking layer that is only enabled if `OPENAI_API_KEY` is set. It is **not** required and not configured by default.

## Demo accounts

**iHunt** — password `ihunt@123`

| Username | Name | Location |
|---|---|---|
| `officer.james` | James Carter | Central Police Station |
| `officer.anita` | Anita Sharma | Central Police Station |
| `officer.omar` | Omar Farooq | Northside Police Station |
| `officer.lena` | Lena Brooks | Harbor Point Police Station |
| `officer.diego` | Diego Alvarez | Westfield Police Station |
| `officer.kate` | Kate Nguyen | Riverside Police Station |
| `airport.desk` | Ravi Menon | Metro International Airport — Lost & Found |
| `techpark.security` | Grace Lee | TechPark One — Corporate Security Desk |
| `railway.office` | Samuel Okafor | Grand Central Railway — Lost Property Office |

**iSeek** — password `iseek@123`: `john`, `priya`, `ahmed`, `maria`, `chen`, `sara`. New citizens can also register.

Both login screens have one-click demo account buttons, and the search/upload screens have demo photo buttons (`demo-photos/`) so the app can be presented without preparing images.

### Suggested showcase script

1. **iSeek** as `maria` → *Photo search* → click the green iPhone demo photo → *Find my item* → the green iPhone held at the airport is the top match → *This is mine — book pickup*.
2. **iSeek** → *Describe* → "Nikon DSLR camera" → ranked results.
3. **iSeek** as `ahmed` → *Describe* → "white drone with four propellers" → *Notify me when it's found* (or no match) → it appears in *AI watchlist*.
4. **iHunt** as `officer.omar` → *Add found item* → click a drone sample photo → *Apply suggestion* → submit. The success dialog shows how many citizens were notified.
5. Back in **iSeek** (`ahmed` / `priya`) → bell icon shows the AI match notification.
6. **iHunt** as the officer of the item's station → *Pending requests* → approve / reject. *Today's appointments* → *Handed over* / *No-show*.

Seed data (8 locations, 39 found items with real photos, appointments, reports, notifications) is created automatically on first start with dates relative to "today". Reset it with `npm run seed:reset`.

## Run locally

Requires Node.js 20.10+.

```bash
npm ci
npm run build      # downloads the CLIP model into ./models (~150 MB, once)
npm start          # http://localhost:3000
```

Other scripts: `npm run dev` (watch mode), `npm test` (end-to-end API tests incl. real AI search), `npm run lint` (syntax check).

Environment variables (all optional):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | SQLite database + uploaded photos |
| `MODEL_DIR` | `./models` | CLIP model cache |
| `JWT_SECRET` | dev value | Session signing secret — set in production |
| `TZ` | system | Timezone used for "today" and seeded appointments |
| `OPENAI_API_KEY` | — | Enables the optional GPT layer |

## Deploy to Render

The repo contains a [`render.yaml`](render.yaml) Blueprint: in Render choose **New → Blueprint**, pick this repository and apply.

- Build: `npm ci && npm run build` (the model is cached into the build), start: `npm start`, health check: `/api/health`.
- A 1 GB persistent disk is mounted at `/var/data` (`DATA_DIR`) so items, photos and appointments survive restarts and deploys.
- The plan is `standard` (2 GB RAM): the CLIP model needs ~500 MB of memory, which is too tight for 512 MB instances. Persistent disks also require a paid plan.
- `JWT_SECRET` is generated automatically. Change `TZ` to the audience's timezone so "Today's appointments" lines up with local time.

## Project layout

```
server/            Express API, SQLite (better-sqlite3), auth, uploads
  ai/              CLIP engine, search/ranking agent, indexer, optional GPT layer
  routes/          /api/police (iHunt) and /api/user (iSeek)
  seed.js          demo stations, accounts, items, appointments
public/            static frontends (no build step)
  shared/          design system + UI helpers
  ihunt/  iseek/   the two apps
seed/              seed item photos + attribution
demo-photos/       sample "owner" photos for live demos
test/              end-to-end tests
```

Seed and demo photos are from Wikimedia Commons; see `seed/ATTRIBUTION.md`.
