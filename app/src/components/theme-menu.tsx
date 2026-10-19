import { useEffect, useState } from "react"
import { useTheme } from "@/lib/theme"
import { setSettings, useSettings, YM_VIEWS, type YmView } from "@/lib/settings"
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { cn } from "@/lib/utils"

// Акценты — приглушённые, чтобы не спорить с минимализмом.
// Значения CSS-переменных — в index.css ([data-accent=…]).
export const ACCENTS = [
  { id: "graphite", label: "Графит", swatch: "oklch(0.3 0 0)" },
  { id: "plum", label: "Слива", swatch: "oklch(0.45 0.11 320)" },
  { id: "amber", label: "Янтарь", swatch: "oklch(0.62 0.13 62)" },
  { id: "sage", label: "Шалфей", swatch: "oklch(0.52 0.06 155)" },
  { id: "ink", label: "Чернила", swatch: "oklch(0.42 0.09 262)" },
] as const

const MODES = [
  { id: "light", label: "Светлая", icon: Sun },
  { id: "dark", label: "Тёмная", icon: Moon },
  { id: "system", label: "Как в системе", icon: Monitor },
] as const

const YM_VIEW_LABELS: Record<YmView, string> = {
  float: "Окно в углу",
  embed: "В карточке плеера",
  button: "Только кнопка",
  hidden: "Полностью скрыт",
}

const KEY = "hustle-player:accent"

function readAccent() {
  try {
    return localStorage.getItem(KEY) || "graphite"
  } catch {
    return "graphite"
  }
}

export function useAccent() {
  const [accent, setAccentState] = useState(readAccent)
  useEffect(() => {
    document.documentElement.dataset.accent = accent
    try {
      localStorage.setItem(KEY, accent)
    } catch {
      /* не страшно */
    }
  }, [accent])
  return [accent, setAccentState] as const
}

export function ThemeMenu() {
  const { theme, setTheme } = useTheme()
  const [accent, setAccent] = useAccent()
  const { ymView } = useSettings()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Тема" />}>
        <Palette className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Оформление</DropdownMenuLabel>
          {MODES.map(({ id, label, icon: Icon }) => (
            <DropdownMenuItem key={id} onClick={() => setTheme(id)} closeOnClick={false}>
              <Icon className="size-4 text-muted-foreground" />
              {label}
              <Check className={cn("ml-auto size-4", theme === id ? "opacity-100" : "opacity-0")} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Акцент</DropdownMenuLabel>
          {ACCENTS.map((a) => (
            <DropdownMenuItem key={a.id} onClick={() => setAccent(a.id)} closeOnClick={false}>
              <span className="size-3.5 rounded-full ring-1 ring-foreground/10" style={{ background: a.swatch }} />
              {a.label}
              <Check className={cn("ml-auto size-4", accent === a.id ? "opacity-100" : "opacity-0")} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>Виджет Яндекса</DropdownMenuLabel>
          {YM_VIEWS.map((id) => (
            <DropdownMenuItem key={id} onClick={() => setSettings({ ymView: id })} closeOnClick={false}>
              {YM_VIEW_LABELS[id]}
              <Check className={cn("ml-auto size-4", ymView === id ? "opacity-100" : "opacity-0")} />
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
