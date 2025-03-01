import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import viteCompression from "vite-plugin-compression";
import path from "node:path";

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
    const envDir = path.resolve(__dirname, "..");
    const env = loadEnv(mode, envDir, "");
    return {
        plugins: [
            react(),
            viteCompression({
                algorithm: "brotliCompress",
                ext: ".br",
                threshold: 1024,
            }),
        ],
        clearScreen: false,
        envDir,
        define: {
            "import.meta.env.VITE_SERVER_PORT": JSON.stringify(
                env.SERVER_PORT || "3000"
            ),
            "import.meta.env.VITE_SERVER_URL": JSON.stringify(
                env.SERVER_URL || "http://localhost"
            ),
            "import.meta.env.VITE_SERVER_BASE_URL": JSON.stringify(
                env.SERVER_BASE_URL
            ),
            "import.meta.env.VITE_AWS_COGNITO_EMAIL": JSON.stringify(
                env.AWS_COGNITO_EMAIL
            ),
            "import.meta.env.VITE_AWS_COGNITO_PASSWORD": JSON.stringify(
                env.AWS_COGNITO_PASSWORD
            ),
            "import.meta.env.VITE_AWS_COGNITO_CLIENT_ID": JSON.stringify(
                env.AWS_COGNITO_CLIENT_ID
            ),
            "import.meta.env.VITE_AWS_COGNITO_USER_POOL_ID": JSON.stringify(
                env.AWS_COGNITO_USER_POOL_ID
            ),
            "import.meta.env.VITE_AWS_COGNITO_REGION": JSON.stringify(
                env.AWS_COGNITO_REGION
            ),
        },
        server: {
            // TODO: make this configurable with env variable
            allowedHosts: [".chrom.ar"],
        },
        build: {
            outDir: "dist",
            minify: true,
            cssMinify: true,
            sourcemap: false,
            cssCodeSplit: true,
        },
        resolve: {
            alias: {
                "@": "/src",
            },
        },
    };
});
