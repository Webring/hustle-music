import { useEffect } from "react"
import { ThemeMenu } from "@/components/theme-menu"
import { PlayerPage } from "@/pages/player-page"
import { TracksPage } from "@/pages/tracks-page"
import { RepeaterPage } from "@/pages/repeater-page"
import { setPage, usePage, type PageId } from "@/lib/nav"
import { YmWidgetDock } from "@/components/ym-widget-frame"
import { initSignal } from "@/lib/signal"
import { useSettings } from "@/lib/settings"
import { cn } from "@/lib/utils"

// Плеер открывается по названию сайта, остальные страницы — вкладками
const PAGES: { id: PageId; label: string }[] = [
  { id: "tracks", label: "Треки" },
  { id: "repeater", label: "Репитер" },
]

export default function App() {
  const page = usePage()
  const { ymView } = useSettings()
  // Что занимает правый нижний угол: окно виджета или только кнопка — под это отступ у футера
  // (в репитере виджета нет)
  const cornerWindow = page !== "repeater" && (ymView === "float" || (ymView === "embed" && page !== "player"))
  const cornerButton = ymView === "button" && page !== "repeater"

  useEffect(() => {
    initSignal()
  }, [])

  return (
    <div className="min-h-svh">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6 sm:gap-10">
          <nav className="flex h-full items-stretch gap-5 sm:gap-7">
            <button
              onClick={() => setPage("player")}
              className={cn(
                "relative mr-1 text-[15px] font-semibold tracking-tight transition-colors sm:mr-3",
                page === "player" ? "text-foreground" : "text-foreground/70 hover:text-foreground",
              )}
            >
              Hustle <span className="text-primary">YM</span>Player
              <span className={cn("absolute inset-x-0 -bottom-px h-px bg-foreground transition-opacity", page === "player" ? "opacity-100" : "opacity-0")} />
            </button>
            {PAGES.map((p) => (
              <button
                key={p.id}
                onClick={() => setPage(p.id)}
                className={cn(
                  "relative text-sm transition-colors",
                  page === p.id ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {p.label}
                <span className={cn("absolute inset-x-0 -bottom-px h-px bg-foreground transition-opacity", page === p.id ? "opacity-100" : "opacity-0")} />
              </button>
            ))}
          </nav>
          <div className="ml-auto">
            <ThemeMenu />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-12">
        {page === "player" && <PlayerPage />}
        {page === "repeater" && <RepeaterPage />}
        {page === "tracks" && <TracksPage />}
      </main>

      {/* Отступы — чтобы окно виджета или кнопка в углу не закрывали текст */}
      <footer className="border-t border-border/60">
        <div
          className={cn(
            "mx-auto max-w-6xl px-6 pt-8 pb-12 text-xs leading-relaxed text-muted-foreground",
            cornerWindow && "pb-40 sm:pb-12 sm:pr-[380px]",
            cornerButton && "pb-20",
          )}
        >
          Hustle YMPlayer — независимый проект и не имеет никакого отношения к ООО «Яндекс». Мы только используем
          встраиваемый плеер Яндекс Музыки: музыка воспроизводится в нём, права на неё принадлежат правообладателям.
          «Яндекс Музыка» — товарный знак ООО «Яндекс».
        </div>
      </footer>

      {/* Виджет Яндекс Музыки — один на всё приложение, через него идёт звук */}
      <YmWidgetDock />
    </div>
  )
}
