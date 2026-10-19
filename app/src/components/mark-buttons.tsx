import { ExternalLink, ThumbsDown, ThumbsUp } from "lucide-react"
import { cn } from "@/lib/utils"
import { toggleMark, type Mark } from "@/lib/marks"
import { player } from "@/lib/player"
import { ymTrackUrl } from "@/lib/ym-widget"
import type { Track } from "@/lib/tracks"

// Лайк / дизлайк в строке списка. Без оценки кнопки видны при наведении на строку
// (у строки должен быть класс group) и всегда — на сенсорных экранах; поставленная оценка видна всегда.
export function MarkButtons({ id, mark, className }: { id: string; mark?: Mark; className?: string }) {
  const click = (e: React.MouseEvent, m: Mark) => {
    e.stopPropagation()
    if (toggleMark(id, m) === "dislike") player.removeFromQueue(id)
  }
  const btn = "flex size-7 items-center justify-center rounded-full transition hover:bg-background focus-visible:opacity-100"
  return (
    <div className={cn("flex shrink-0 items-center", className)} onDoubleClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => click(e, "like")}
        aria-label={mark === "like" ? "Убрать лайк" : "Лайк"}
        aria-pressed={mark === "like"}
        className={cn(btn, mark === "like" ? "text-primary" : "text-muted-foreground opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 hover:text-foreground")}
      >
        <ThumbsUp className={cn("size-3.5", mark === "like" && "fill-current")} />
      </button>
      <button
        onClick={(e) => click(e, "dislike")}
        aria-label={mark === "dislike" ? "Убрать дизлайк" : "Дизлайк — не показывать в плеере"}
        aria-pressed={mark === "dislike"}
        className={cn(btn, mark === "dislike" ? "text-foreground" : "text-muted-foreground opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 hover:text-foreground")}
      >
        <ThumbsDown className={cn("size-3.5", mark === "dislike" && "fill-current")} />
      </button>
    </div>
  )
}

// Открыть трек на сайте Яндекс Музыки
export function OpenInYmButton({ track }: { track: Track }) {
  return (
    <a
      href={ymTrackUrl(track)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      aria-label="Открыть в Яндекс Музыке"
      title="Открыть в Яндекс Музыке"
      className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground opacity-0 transition group-hover:opacity-100 pointer-coarse:opacity-100 hover:bg-background hover:text-foreground focus-visible:opacity-100"
    >
      <ExternalLink className="size-3.5" />
    </a>
  )
}
