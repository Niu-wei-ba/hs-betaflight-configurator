/// <reference types="vitest" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";
import { readFileSync } from "node:fs";
import copy from "rollup-plugin-copy";
import pkg from "./package.json";
import * as child from "child_process";
import { VitePWA } from "vite-plugin-pwa";
import { resolve } from "path";

const commitHash = child.execSync("git rev-parse --short HEAD").toString().trim();
const devProxyTarget = process.env.VITE_DEV_PROXY_TARGET || "http://127.0.0.1:4180";
const devProxyChangeOrigin = process.env.VITE_DEV_PROXY_CHANGE_ORIGIN === "true";
const devServerHost = process.env.VITE_DEV_HOST || "0.0.0.0";
const devServerPort = Number(process.env.VITE_DEV_PORT || 8000);
const webBasePath = resolveWebBasePath(process.env.VITE_WEB_BASE_PATH);
const pwaCacheId = `betaflight-configurator-${webBasePath.replace(/[^A-Za-z0-9]+/g, "-")}`;

function resolveWebBasePath(value) {
    const normalized = String(value || "").trim();
    if (!normalized) {
        // Native shells need relative assets inside their bundled webview.
        return "./";
    }

    if (!/^\/(?:[A-Za-z0-9._-]+\/)*$/.test(normalized)) {
        throw new Error("VITE_WEB_BASE_PATH must be an absolute, trailing-slash path such as /v/2025.12.2/");
    }

    return normalized;
}

function serveFileFromDirectory(directory) {
    return (req, res, next) => {
        const filePath = req.url.replace(new RegExp(`^/${directory}/`), "");
        const absolutePath = path.resolve(process.cwd(), directory, filePath);

        try {
            const fileContents = readFileSync(absolutePath, "utf-8");
            res.end(fileContents);
        } catch (e) {
            // If file not found or any other error, pass to the next middleware
            next();
        }
    };
}

/**
 * This is plugin to work around the file structure required nwjs.
 * In future this can be dropped if we restructure folder structure
 * to be more web friendly.
 * @returns {import("vite").Plugin}
 */
function serveLocalesPlugin() {
    return {
        name: "serve-locales",
        configureServer(server) {
            server.middlewares.use((req, res, next) => {
                if (req.url.startsWith("/locales/")) {
                    serveFileFromDirectory("locales")(req, res, next);
                } else if (req.url.startsWith("/resources/")) {
                    serveFileFromDirectory("resources")(req, res, next);
                } else {
                    next();
                }
            });
        },
    };
}

export default defineConfig({
    // Native builds keep relative assets; hosted version channels set /v/<version>/.
    base: webBasePath,
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
        __APP_PRODUCTNAME__: JSON.stringify(pkg.productName),
        __APP_REVISION__: JSON.stringify(commitHash),
    },
    build: {
        rollupOptions: {
            input: {
                main: resolve(__dirname, "src/index.html"),
                receiver_msp: resolve(__dirname, "src/receiver_msp/receiver_msp.html"),
            },
        },
    },
    test: {
        include: ["test/**/*.test.{js,mjs,cjs}"],
        environment: "jsdom",
        setupFiles: ["test/setup.js"],
        root: ".",
    },
    plugins: [
        vue(),
        serveLocalesPlugin(),
        copy({
            targets: [
                { src: "locales/**/*", dest: "src/dist/locales" },
                { src: "resources/**/*", dest: "src/dist/resources" },
                { src: "src/tabs/**/*", dest: "src/dist/tabs" },
                { src: "src/images/**/*", dest: "src/dist/images" },
                { src: "src/components/**/*", dest: "src/dist/components" },
            ],
            hook: "writeBundle",
        }),
        VitePWA({
            registerType: "prompt",
            workbox: {
                // Version channels share an origin, so they must not share a Workbox precache.
                cacheId: pwaCacheId,
                globPatterns: ["**/*.{js,css,html,ico,png,svg,json,mcm,gltf}"],
                // 5MB
                maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
                // Never serve the app shell for backend/static endpoints that should be fetched directly.
                navigateFallbackDenylist: [
                    /^\/api(?:\/|$)/,
                    /^\/firmware-files(?:\/|$)/,
                    /^\/presets(?:\/|$)/,
                    /^\/locales(?:\/|$)/,
                    /^\/resources(?:\/|$)/,
                ],
            },
            includeAssets: ["favicon.ico", "apple-touch-icon.png"],
            manifest: {
                name: pkg.displayName,
                short_name: pkg.productName,
                description: pkg.description,
                theme_color: "#ffffff",
                // Resolve from each generated manifest so version channels never share a PWA scope.
                start_url: "./",
                scope: "./",
                icons: [
                    {
                        src: "images/pwa/pwa-192-192.png",
                        sizes: "192x192",
                        type: "image/png",
                    },
                    {
                        src: "images/pwa/pwa-512-512.png",
                        sizes: "512x512",
                        type: "image/png",
                    },
                ],
            },
        }),
    ],
    root: "./src",
    resolve: {
        alias: {
            "/src": path.resolve(process.cwd(), "src"),
            vue: path.resolve(__dirname, "node_modules/vue/dist/vue.esm-bundler.js"),
        },
    },
    server: {
        port: devServerPort,
        strictPort: true,
        host: devServerHost,
        proxy: {
            "/api": {
                target: devProxyTarget,
                changeOrigin: devProxyChangeOrigin,
            },
            "/healthz": {
                target: devProxyTarget,
                changeOrigin: devProxyChangeOrigin,
            },
            "/presets": {
                target: devProxyTarget,
                changeOrigin: devProxyChangeOrigin,
            },
            "/firmware-files": {
                target: devProxyTarget,
                changeOrigin: devProxyChangeOrigin,
            },
            "/docs": {
                target: devProxyTarget,
                changeOrigin: devProxyChangeOrigin,
            },
        },
    },
    preview: {
        port: 8080,
        strictPort: true,
    },
});
