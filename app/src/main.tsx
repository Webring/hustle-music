import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./index.css"
import "./lib/theme" // ставит класс .dark до первого рендера
import App from "./App"

// Акцент тоже ставим до первого рендера, чтобы не мигал
try {
  document.documentElement.dataset.accent = localStorage.getItem("hustle-player:accent") || "graphite"
} catch {
  document.documentElement.dataset.accent = "graphite"
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
