import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Motor (kapasite/blocking/ters işletme) çekirdeği için Vitest — saf TS, node ortamı.
// "@/..." alias'ı Next ile aynı (./src). React gerektiren dosyalar test edilmez.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
