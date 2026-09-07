# House Visit Logger

A one-page mobile site for logging door-to-door visits: take a photo of the
house, the house number is read off the photo and the street is filled in
from GPS, tap an outcome, save.

## How it works

- **Log screen** (`index.html`): tap the camera button — it opens your
  phone's camera directly (not a photo picker). After you take the photo,
  the app sends it to Google's free Gemini vision API to read the house
  number, and uses your phone's GPS + OpenStreetMap's free Nominatim
  service to fill in the street. You can edit the address if it's wrong.
  Then tap **Not Home**, **Said No**, or **Did It**, optionally enter an
  amount, and tap **Save**.
- **History screen** (`history.html`): total money made, big, at the top,
  and a scrollable list of every visit (thumbnail, address, outcome,
  amount) below it.

## Data storage — read this

Everything (photos, addresses, outcomes, amounts) is stored **only in your
phone's browser**, using a local browser database (IndexedDB). There is no
server and no account.

- Nothing leaves your phone except: (1) the photo, sent to Google's Gemini
  API to read the house number, and (2) your GPS coordinates, sent to
  OpenStreetMap's Nominatim service to look up the street name.
- Because data lives only in the browser, **clearing your browser data,
  switching browsers, or switching phones will erase your visit history**.
  There is no backup/export built in. If you need that later, ask and it
  can be added.

## One-time setup

### 1. Get a free Gemini API key
1. Go to **aistudio.google.com/apikey** on your phone or computer.
2. Sign in with a Google account.
3. Tap **Create API key**. It's free — no card required for the free tier.
4. Copy the key.

### 2. Host the site (needed for camera + GPS to work)
Phones only allow camera and location access on a secure (HTTPS) site, so
this needs to be hosted somewhere — it won't work opened as a local file.
The free option is **GitHub Pages**:
1. In this repository on GitHub, go to **Settings → Pages**.
2. Under "Build and deployment", set **Source** to "Deploy from a branch".
3. Pick the branch this code is on and folder `/house-visit-logger` (or
   move these files to the repo root / a `docs` folder if your Pages
   setup requires that — check what GitHub Pages shows you).
4. Save. GitHub will give you a URL like
   `https://yourusername.github.io/reponame/`.
5. Open that URL on your phone and, if you used a subfolder, add
   `house-visit-logger/` to the end.

### 3. Add your API key in the app
1. Open the site on your phone.
2. Tap the **⚙️** icon top-right.
3. Paste the API key you copied and confirm.

You're set — tap the camera button to log your first visit.

## Notes
- The first time you tap the camera button, your phone will ask for camera
  permission, and the first time an address is detected it will ask for
  location permission. Allow both.
- If the Gemini or GPS lookup fails (no signal, bad photo, etc.), the
  address field is just left blank for you to type in — nothing else
  breaks.
- Nominatim (OpenStreetMap) is free for light personal use; this app only
  makes one lookup per visit, which is well within that.
