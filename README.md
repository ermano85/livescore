# Matchday

A personal, ad-free live football score app. It is a Progressive Web App: plain HTML, CSS and JavaScript, no framework, no build step, no accounts, no tracking.

- Matches grouped by competition, with kick-off in your phone's timezone, crests, score and status
- Yesterday / Today / Tomorrow tabs (swipe left or right to change day; the calendar button jumps to any date)
- Live scores refresh every 30 seconds while a match is live and the app is on screen
- Match page: goals (penalties and own goals marked), cards, substitutions, lineups and benches
- Follows the system light/dark theme; the button in the top bar cycles Auto, Light, Dark

Data comes from ESPN's public JSON API, called directly from the browser. There is no server and no API key.

## Run it locally

Needs Node.js 18 or newer. Nothing to install.

```bash
npm start
```

Open <http://localhost:5173>. To use another port: `PORT=8080 npm start`.

To check the data source without a browser (useful if scores stop showing up):

```bash
npm run check
npm run check -- 2026-11-07
```

## Deploy to GitHub Pages (free)

The app is static files, so there is nothing to build. A free GitHub account needs the repository to be **public** for Pages. There are no secrets in the code.

One-time setup, in this folder:

```bash
gh auth login
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git init -b main
git add .
git commit -m "Matchday live scores"
gh repo create livescore --public --source=. --push
gh api -X POST "repos/{owner}/{repo}/pages" -f "source[branch]=main" -f "source[path]=/"
```

`{owner}` and `{repo}` are typed literally; `gh` fills them in. After about a minute this prints your address (`https://<your-username>.github.io/livescore/`):

```bash
gh api "repos/{owner}/{repo}/pages" --jq .html_url
```

Without the `gh` tool: create the repository on github.com, push this folder to it, then go to Settings, Pages, "Deploy from a branch", pick `main` and `/ (root)`.

### Put it on your phone

1. Open the address in Chrome on Android.
2. Tap the menu (three dots), then "Add to Home screen", then "Install".

It then opens full screen like any other app and loads instantly, including offline (scores need a connection).

### Publish a change

```bash
git add .
git commit -m "Describe the change"
git push
```

The app shows "New version ready, Reload" the next time you open it. There is no version number to bump.

### Alternative: Cloudflare Pages

This works with a private project. `npx wrangler pages deploy . --project-name livescore` uploads the folder directly (it asks you to log in to Cloudflare the first time).

## Change the competitions

Edit the `LEAGUES` list in [js/config.js](js/config.js). Order in the file is order on screen.

```js
{ id: 'ligue-1', name: 'Ligue 1', country: 'France', espn: 'fra.1' },
```

- `id` is any unique lowercase name (it appears in the app's URLs).
- `espn` is ESPN's code for the competition. Find it in the address of the competition's page on espn.com, for example `espn.com/soccer/league/_/name/fra.1` gives `fra.1`.
- Run `npm run check` to confirm the new entry returns matches.

The list holds the club competitions plus the European national-team ones (Nations League, Euro qualifying, the European Championship, World Cup qualifying in Europe). A competition only appears on days it has matches. Other national-team codes: `fifa.world` (World Cup) and `fifa.friendly` (friendlies, which is one feed for the whole world, not just Europe).

The refresh interval (`LIVE_POLL_MS`) is in the same file. The app's name is in `manifest.webmanifest` and `index.html`.

## How it is organised

```
index.html              page shell
css/styles.css          all styles, light and dark
js/config.js            competitions and refresh interval
js/app.js               routing, top bar, service worker registration
js/views/day.js         match list and day tabs
js/views/match.js       match page
js/lib/polling.js       when to refresh, pausing in the background
js/providers/espn.js    everything ESPN-specific
js/providers/index.js   which provider is used, and the data shapes
sw.js                   service worker: app shell cache, crest cache
scripts/                dev server, data check, icon generator
```

### Switching data provider

All ESPN URLs and response parsing are in `js/providers/espn.js`. The rest of the app only uses the two functions and the plain objects documented at the top of `js/providers/index.js`. To move to another source such as API-Football, write a module with the same two functions, add its competition ids to `config.js`, and change the one export in `index.js`.

The provider module has no browser dependencies, so it can also run in a Cloudflare Worker. That is the piece goal alerts would need later, since alerts while the app is closed require something outside the phone to watch the scores and send a push message.

## Good to know

- ESPN's API is unofficial and undocumented. It can change without notice. If it does, `npm run check` shows what broke and the fix belongs in `espn.js`.
- The API allows browser requests from any site, so no proxy is needed. It refuses preflight requests, so requests must stay plain GETs with no custom headers.
- ESPN groups matches by US Eastern calendar day. For European kick-off times this matches your local day.
- To redraw the icons after changing colours in `scripts/make-icons.mjs`: `npm run icons`.
