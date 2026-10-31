import base from "./playwright.config";

/**
 * Runs the normal end-to-end suite against a deployed copy instead of a local build:
 *   LIVE_URL=https://your-site.example npx playwright test --config playwright.live.config.ts
 */
const url = process.env.LIVE_URL;
if (!url) throw new Error("Set LIVE_URL to the deployed site, e.g. https://your-site.pages.dev");
export default { ...base, webServer: undefined, use: { ...base.use, baseURL: url } };
