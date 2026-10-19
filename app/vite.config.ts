import fs from "fs"
import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { viteSingleFile } from "vite-plugin-singlefile"

// npm run build      — обычная сборка в dist/
// npm run build:html — всё приложение одним файлом ../index.html
//                      (JS, CSS, шрифты, звук сигнала и база треков внутри)
// Dev-сервер по https, если есть сертификаты в .cert/ (key.pem, cert.pem; в git не попадают).
// Виджет Яндекс Музыки играет только на «безопасной» странице: localhost или https.
// По http://<ip> он молча отвечает STOPPED.
// Необязательные настройки dev-сервера — в .env.local:
//   DEV_HOSTS=myhost.local,other.host  — открывать dev-сервер по этим именам
//   DEV_POLL=1                          — следить за файлами опросом (сетевые диски, WSL)
const certDir = path.resolve(import.meta.dirname, ".cert")
const https = fs.existsSync(path.join(certDir, "key.pem"))
  ? { key: fs.readFileSync(path.join(certDir, "key.pem")), cert: fs.readFileSync(path.join(certDir, "cert.pem")) }
  : undefined

export default defineConfig(({ mode }) => {
  const single = mode === "single"
  const env = loadEnv(mode, import.meta.dirname, "DEV_")
  return {
    base: "./",
    server: {
      https,
      host: "0.0.0.0",
      allowedHosts: env.DEV_HOSTS ? env.DEV_HOSTS.split(",") : [],
      // На сетевых дисках события об изменении файлов приходят не всегда,
      // и Tailwind отдаёт устаревший CSS. Опрос файлов надёжнее.
      watch: env.DEV_POLL ? { usePolling: true, interval: 300 } : undefined,
    },
    plugins: [react(), tailwindcss(), ...(single ? [viteSingleFile({ removeViteModuleLoader: true })] : [])],
    resolve: {
      alias: { "@": path.resolve(import.meta.dirname, "./src") },
      dedupe: ["react", "react-dom"],
    },
    // Зависимости собираем заранее: иначе Vite пересобирает их на лету, и после
    // перезапуска dev-сервера в браузере оказываются две копии React.
    optimizeDeps: {
      include: ["react", "react-dom", "react-dom/client", "react/jsx-runtime", "@base-ui/react", "lucide-react", "class-variance-authority", "clsx", "tailwind-merge"],
    },
    // база треков (~220 КБ) встроена в бандл, поэтому порог предупреждения выше стандартного
    build: single
      ? { outDir: "dist-html", assetsInlineLimit: Number.MAX_SAFE_INTEGER, chunkSizeWarningLimit: 5000 }
      : { chunkSizeWarningLimit: 1000 },
  }
})
