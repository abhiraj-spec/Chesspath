# Making ChessPath downloadable

ChessPath is a Progressive Web App (PWA). The same website can be installed as an app, or wrapped and listed in app stores. In order of effort:

## 1. Install from the website (free, works today)

Share your site link (e.g. `https://your-site.netlify.app`). People install it from there:

- **Android (Chrome, Edge, Samsung Internet):** an **Install** button appears on the ChessPath home screen and in Settings → Install the app. The browser menu (⋮ → *Install app*) also works.
- **iPhone / iPad (Safari):** Share → *Add to Home Screen* (on newer iOS the Share button may be inside the ••• menu). The app shows these steps itself.
- **Windows / Mac (Chrome or Edge):** the install icon in the address bar, or Settings → Install the app.

Installed, it opens full screen with its own icon, works offline, and updates itself when you publish a new version. Chrome reports no installability problems for this build.

## 2. Microsoft Store (free for individual developers)

1. Sign up at <https://storedeveloper.microsoft.com> as an **individual developer** (free).
2. Go to <https://www.pwabuilder.com>, enter your site URL, choose **Package for stores → Windows**.
3. Upload the generated package in Partner Center and submit for review.

## 3. Google Play (one-time fee, about 3 weeks)

1. Create a Google Play developer account (one-time registration fee). New **personal** accounts must run a **closed test with at least 12 testers for 14 days in a row** before the app can be published.
2. On <https://www.pwabuilder.com>, enter your site URL and choose **Android**. It generates a signed app bundle (`.aab`) and an `assetlinks.json` file. Keep the signing key safe.
3. Add `assetlinks.json` to this project at `public/.well-known/assetlinks.json` (ask Claude to do it), push, and check that `https://your-site/.well-known/assetlinks.json` opens. Without it, the app shows a browser address bar.
4. In the Play Console: create the app, upload the `.aab`, fill in the store listing (screenshots are in `public/screenshots/`), the content rating questionnaire, and the data safety form (ChessPath collects no data; the privacy policy is at `/privacy/`).
5. Run the closed test with 12+ testers for 14 days, then apply for production.

## 4. Apple App Store (not recommended for now)

- Costs $99 per year, and building requires a Mac with Xcode.
- Apple may reject apps that are mainly a website in a wrapper (guideline 4.2, minimum functionality).
- ChessPath includes Stockfish under the GNU GPL. The GPL and the App Store terms are widely considered to conflict, and GPL apps have been removed before. Get advice before trying.
- iPhone users can already install it from Safari (section 1).

## Licence obligations for any store version

ChessPath is GPL-3.0 (because of Stockfish). Anyone who receives the app must be able to get the source code: keep the GitHub repository public, or otherwise provide the source. Settings → About and the privacy page link to it.
