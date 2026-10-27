import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Slow content checks that run real Stockfish: `npm run validate:content`.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    include: ["tests/content/**/*.test.ts"],
    environment: "node",
    testTimeout: 600_000,
    hookTimeout: 60_000,
  },
});
