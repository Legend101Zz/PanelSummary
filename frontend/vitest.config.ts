import { defineConfig } from "vitest/config";

// The component tests render with react-dom/server; the classic JSX transform needs React in scope, so use the automatic one.
export default defineConfig({ esbuild: { jsx: "automatic" } });
