import { useDeferredValue, useMemo, useState } from "react"
import { Pause, Play, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { MarkButtons, OpenInYmButton } from "@/components/mark-buttons"
import { cn } from "@/lib/utils"
import { YmNotice } from "@/components/ym-notice"
import { player, usePlayer } from "@/lib/player"
import { useTracks, type Track } from "@/lib/tracks"
import { useMarks, type Mark } from "@/lib/marks"

type SortKey = "artist" | "title" | "bpm"
type Filter = "all" | Mark

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "like", label: "Лайки" },
  { id: "dislike", label: "Дизлайки" },
]

// Колонки: ▶ · BPM · (артист) · название · оценка
// На телефоне колонки уже, а артист и название — в две строки в одной ячейке
const COLS = "grid-cols-[1.75rem_2.5rem_minmax(0,1fr)_auto] gap-x-2 sm:grid-cols-[2.5rem_3.5rem_minmax(0,1fr)_minmax(0,1.3fr)_5.75rem] sm:gap-x-4"

export function TracksPage() {
  const { tracks } = useTracks()
  const p = usePlayer()
  const marks = useMarks()
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "artist", dir: 1 })
  const query = useDeferredValue(q.trim().toLowerCase())

  const counts = useMemo(() => {
    const v = Object.values(marks)
    return { all: tracks.length, like: v.filter((m) => m === "like").length, dislike: v.filter((m) => m === "dislike").length }
  }, [marks, tracks.length])

  const rows = useMemo(() => {
    const list = tracks.filter(
      (t) => (filter === "all" || marks[t.id] === filter) && (!query || `${t.artist} ${t.title} ${t.bpm}`.toLowerCase().includes(query)),
    )
    const { key, dir } = sort
    return list.sort((a, b) => (key === "bpm" ? a.bpm - b.bpm : a[key].localeCompare(b[key], "ru")) * dir)
  }, [tracks, query, sort, filter, marks])

  const playingId = p.previewId ?? (p.status !== "idle" ? p.queue[p.qi] : null)
  const list = useRowsJsx(rows, playingId, p.paused, marks)

  const Th = ({ k, children, className }: { k: SortKey; children: React.ReactNode; className?: string }) => (
    <button
      onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (s.dir === 1 ? -1 : 1) : 1 }))}
      className={cn("text-left text-[11px] font-medium tracking-[0.18em] whitespace-nowrap uppercase transition-colors hover:text-foreground", sort.key === k ? "text-foreground" : "text-muted-foreground", className)}
    >
      {children}
      <span className="ml-1 inline-block w-2">{sort.key === k ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
    </button>
  )

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Треки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {`Треков: ${rows.length === tracks.length ? tracks.length : `${rows.length} из ${tracks.length}`}`}
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Артист, название, bpm" className="h-9 pl-9" />
        </div>
      </div>

      <div className="mb-6 flex gap-6 text-sm">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={cn("transition-colors", filter === f.id ? "text-foreground" : "text-muted-foreground hover:text-foreground")}
          >
            {f.label}
            <span className="ml-1.5 text-xs text-muted-foreground tabular">{counts[f.id]}</span>
          </button>
        ))}
      </div>

      <YmNotice className="mb-4" />

      <div className={cn("grid items-end border-b px-3 pb-3", COLS)}>
        <span />
        <Th k="bpm">BPM</Th>
        <Th k="artist" className="hidden sm:block">Артист</Th>
        <Th k="title">Название</Th>
        <span />
      </div>

      <div>{list}</div>
      {!rows.length && (
        <p className="px-3 py-8 text-sm text-muted-foreground">
          {filter === "dislike" && !query ? "Дизлайков пока нет. Такие треки не попадают в плеер." : filter === "like" && !query ? "Лайков пока нет." : "Ничего не нашлось."}
        </p>
      )}
    </div>
  )
}

function useRowsJsx(rows: Track[], playingId: string | null, paused: boolean, marks: Record<string, Mark>) {
  return useMemo(
    () =>
      rows.map((t) => {
        const isCur = t.id === playingId
        const disliked = marks[t.id] === "dislike"
        return (
          <div
            key={t.id}
            onDoubleClick={() => player.preview(t.id)}
            className={cn(
              "group grid items-center border-b border-border/60 px-3 py-1.5 text-sm",
              COLS,
              isCur ? "bg-muted" : "hover:bg-muted/50",
            )}
          >
            <button
              onClick={() => player.preview(t.id)}
              aria-label={isCur && !paused ? "Пауза" : "Прослушать"}
              className={cn("flex size-7 items-center justify-center rounded-full transition-opacity hover:bg-background", isCur ? "text-primary opacity-100" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100")}
            >
              {isCur && !paused ? <Pause className="size-3.5" /> : <Play className="size-3.5 translate-x-px" />}
            </button>
            <span className="text-xs text-muted-foreground tabular">{t.bpm}</span>
            <span className={cn("hidden truncate sm:block", disliked ? "text-muted-foreground" : "text-foreground/85")}>{t.artist || "—"}</span>
            <span className={cn("min-w-0", isCur && "font-medium", disliked && "text-muted-foreground")}>
              <span className="block truncate">{t.title}</span>
              {t.artist && <span className="block truncate text-xs font-normal text-muted-foreground sm:hidden">{t.artist}</span>}
            </span>
            <div className="flex items-center justify-end">
              <OpenInYmButton track={t} />
              <MarkButtons id={t.id} mark={marks[t.id]} />
            </div>
          </div>
        )
      }),
    [rows, playingId, paused, marks],
  )
}
