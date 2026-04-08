import { defineConfig } from "vitest/config"
import path from "node:path"

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "lib/**/*.test.ts",
      "lib/**/*.test.tsx",
      "components/**/*.test.tsx",
      "app/**/*.test.ts",
    ],
    globals: true,
    setupFiles: ["./lib/test/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
      "server-only": path.resolve(__dirname, "./lib/test/server-only.ts"),
    },
  },
})
