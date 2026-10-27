# Running ChessPath on Windows

You need two free programs: **Node.js** (runs the build tools) and, optionally, **Git** (only needed to put the code on GitHub).

## 1. Install Node.js (once)

1. Go to <https://nodejs.org> and download the **LTS** installer for Windows (version 20.9 or newer; 22 or 24 are fine).
2. Run it and accept the defaults.
3. Open a **new** PowerShell window (Start menu, type "PowerShell") and check:
   ```
   node -v
   npm -v
   ```
   Both should print a version number. If PowerShell says *"running scripts is disabled on this system"* when you run `npm`, use **Command Prompt** (`cmd`) instead, or run `npm.cmd` in place of `npm`.

## 2. Get the project folder

Unzip `chesspath-source.zip` (right-click, *Extract All…*), or clone it from GitHub. Pick a simple path without special characters, for example `C:\Users\<you>\Documents\chesspath`.

In PowerShell, go into the folder (the one that contains `package.json`):
```
cd $HOME\Documents\chesspath
```

## 3. Install the dependencies (once, a few minutes)

```
npm install
```

## 4. Run it

**Development** (live reloading while you edit code):
```
npm run dev
```
Open <http://localhost:3000>. Stop it with `Ctrl + C`.

**Production version** (what gets published; also enables offline mode):
```
npm run build
npm start
```
Open <http://localhost:3000>. Stop it with `Ctrl + C`.

Both use port 3000, so run only one at a time. To use a different port with `npm start`: `$env:PORT=4000; npm start` in PowerShell, or `set PORT=4000 && npm start` in Command Prompt.

Your progress is saved in the browser you use (IndexedDB). It stays after you close the browser, but it is per browser and per address: `localhost:3000` and your published site keep separate progress. Use Settings → Export to move it.

## 5. Publish it to get a link for your phone

The easiest way that needs no Git: **Netlify Drop**.
1. Run `npm run build` (creates the `out` folder).
2. Create a free account at <https://app.netlify.com> and open <https://app.netlify.com/drop>.
3. Drag the **`out`** folder (not the whole project) onto the page.
4. Netlify gives you a link like `https://something.netlify.app`. Open it on your phone. In Chrome on Android choose *Add to Home screen*; on iPhone use Safari's *Share → Add to Home Screen*.

To update the site later, build again and drag the new `out` folder onto your site's *Deploys* page.

Alternatively, put the project on GitHub and connect the repository in Netlify (*Add new site → Import an existing project*). `netlify.toml` already contains the build settings, and every push redeploys automatically.

Do **not** use a GitHub Pages *project* site (`username.github.io/chesspath/`): the app must be served from the root of a domain.
