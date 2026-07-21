import { resolve } from "path";
import { defineConfig } from "vitest/config";

const mock = (file: string) => resolve(__dirname, "tests/vencord-mocks", file);

export default defineConfig({
    // Vencord compiles the plugin's JSX with the automatic runtime (the .tsx
    // source files don't import React), so mirror that here.
    esbuild: {
        jsx: "automatic",
        jsxImportSource: "react"
    },
    resolve: {
        alias: {
            "@api/index": mock("api-index.ts"),
            "@api/Settings": mock("api-settings.ts"),
            "@api/ContextMenu": mock("api-contextmenu.ts"),
            "@utils/Logger": mock("utils-logger.ts"),
            "@utils/types": mock("utils-types.ts"),
            "@webpack/common": mock("webpack-common.ts"),
            "@vencord/discord-types": mock("discord-types.ts")
        }
    },
    test: {
        globals: true,
        environment: "jsdom",
        include: ["tests/**/*.test.{ts,tsx}"],
        coverage: {
            provider: "v8",
            include: ["*.ts", "*.tsx"],
            exclude: ["tests/**", "vitest.config.ts", "*.css"],
            reporter: ["text", "text-summary"]
        }
    }
});
