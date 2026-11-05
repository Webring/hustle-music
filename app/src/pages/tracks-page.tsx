import { useDeferredValue, useMemo, useRef, useState } from "react"
import { Download, MoreHorizontal, Pause, Pencil, Play, Plus, Search, Tags, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { MarkButtons, OpenInYmButton } from "@/components/mark-buttons"
import { selectClass, TagsDialog, TrackDialog } from "@/components/track-dialog"
import { cn } from "@/lib/utils"
import { YmNotice } from "@/components/ym-notice"
import { player, usePlayer } from "@/lib/player"
import { exportLibrary, importLibrary, removeCustomTrack, trackLabel, useTracks, type Track } from "@/lib/tracks"
import { setAudioCredentials } from "@/lib/audio-source"
import { useMarks, type Mark } from "@/lib/marks"

type SortKey = "artist" | "title" | "bpm"
type Filter = "all" | "custom" | Mark

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "custom", label: "Мои треки" },
  { id: "like", label: "Лайки" },
  { id: "dislike", label: "Дизлайки" },
]

// Колонки: ▶ · BPM · (артист) · название · оценка
// На телефоне колонки уже, а артист и название — в две строки в одной ячейке
const COLS = "grid-cols-[1.75rem_2.5rem_minmax(0,1fr)_auto] gap-x-2 sm:grid-cols-[2.5rem_3.5rem_minmax(0,1fr)_minmax(0,1.3fr)_7rem] sm:gap-x-4"
const tagKey = (tag: string) => tag.toLocaleLowerCase("ru")

function SortButton({ column, sort, onSort, children, className }: {
  column: SortKey; sort: { key: SortKey; dir: 1 | -1 }; onSort: (key: SortKey) => void; children: React.ReactNode; className?: string
}) {
  return <button onClick={() => onSort(column)} className={cn("text-left text-[11px] font-medium tracking-[0.18em] whitespace-nowrap uppercase transition-colors hover:text-foreground", sort.key === column ? "text-foreground" : "text-muted-foreground", className)}>
    {children}<span className="ml-1 inline-block w-2">{sort.key === column ? (sort.dir === 1 ? "↑" : "↓") : ""}</span>
  </button>
}

export function TracksPage() {
  const { tracks, warning } = useTracks()
  const p = usePlayer()
  const marks = useMarks()
  const [q, setQ] = useState("")
  const [filter, setFilter] = useState<Filter>("all")
  const [tag, setTag] = useState("")
  const [editing, setEditing] = useState<Track | "new" | null>(null)
  const [tagging, setTagging] = useState<Track | null>(null)
  const [deleting, setDeleting] = useState<Track | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "artist", dir: 1 })
  const query = useDeferredValue(q.trim().toLowerCase())
  const allTags = useMemo(() => {
    const tags = new Map<string, string>()
    for (const t of tracks) for (const value of t.tags ?? []) if (!tags.has(tagKey(value))) tags.set(tagKey(value), value)
    return [...tags.values()].sort((a, b) => a.localeCompare(b, "ru"))
  }, [tracks])
  const activeTag = tag === "__untagged" || allTags.some((t) => tagKey(t) === tag) ? tag : ""

  const counts = useMemo(() => {
    return { all: tracks.length, custom: tracks.filter((t) => t.custom).length, like: tracks.filter((t) => marks[t.id] === "like").length, dislike: tracks.filter((t) => marks[t.id] === "dislike").length }
  }, [marks, tracks])

  const rows = useMemo(() => {
    const list = tracks.filter(
      (t) => (filter === "all" || (filter === "custom" ? t.custom : marks[t.id] === filter))
        && (!query || `${t.artist} ${t.title} ${t.bpm} ${t.tags?.join(" ") ?? ""}`.toLowerCase().includes(query))
        && (!activeTag || (activeTag === "__untagged" ? !t.tags?.length : t.tags?.some((value) => tagKey(value) === activeTag))),
    )
    const { key, dir } = sort
    return list.sort((a, b) => (key === "bpm" ? a.bpm - b.bpm : a[key].localeCompare(b[key], "ru")) * dir)
  }, [tracks, query, sort, filter, marks, activeTag])

  const playingId = p.previewId ?? (p.status !== "idle" ? p.queue[p.qi] : null)
  const list = useMemo(() => rows.map((t) => <TrackRow key={t.id} track={t} isCurrent={t.id === playingId} paused={p.paused} mark={marks[t.id]} onEdit={setEditing} onTags={setTagging} onDelete={setDeleting} onTag={(value) => setTag(tagKey(value))} />), [rows, playingId, p.paused, marks])
  const onSort = (key: SortKey) => setSort((s) => ({ key, dir: s.key === key && s.dir === 1 ? -1 : 1 }))
  const download = () => {
    const url = URL.createObjectURL(new Blob([exportLibrary()], { type: "application/json" }))
    const a = document.createElement("a")
    a.href = url
    a.download = "hustle-tracks.json"
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Треки</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {`Треков: ${rows.length === tracks.length ? tracks.length : `${rows.length} из ${tracks.length}`}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => importRef.current?.click()}><Upload /> Импорт JSON</Button>
          <Button variant="outline" onClick={download}><Download /> Скачать JSON</Button>
          <Button onClick={() => setEditing("new")}><Plus /> Добавить трек</Button>
        </div>
      </div>

      <input ref={importRef} type="file" accept=".json,application/json" hidden onChange={async (e) => {
        const file = e.target.files?.[0]
        e.target.value = ""
        if (!file) return
        setError(null)
        setMessage(null)
        try {
          const text = await file.text()
          const previous = player.current()
          importLibrary(text)
          const next = player.current()
          if (previous && (previous.url !== next?.url || JSON.stringify(previous.auth) !== JSON.stringify(next?.auth))) player.stop()
          setMessage("JSON импортирован. Треки и теги добавлены в библиотеку.")
        }
        catch (e) { setError(e instanceof Error ? e.message : "Не удалось импортировать JSON.") }
      }} />

      <div className="mb-4 flex flex-wrap gap-x-6 gap-y-2 text-sm">
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

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="relative min-w-0 flex-1 basis-60">
          <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Артист, название, BPM или тег" aria-label="Поиск треков" className="h-9 pl-9" />
        </div>
        <select aria-label="Фильтр по тегу" className={cn(selectClass, "w-full sm:w-52")} value={activeTag} onChange={(e) => setTag(e.target.value)}>
          <option value="">Все теги</option>
          <option value="__untagged">Без тегов</option>
          {allTags.map((value) => <option key={tagKey(value)} value={tagKey(value)}>{value}</option>)}
        </select>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">Свои треки и теги сохраняются в этом браузере. JSON скачивается без отступов, токенов и паролей.</p>
      {warning && <p role="status" className="mb-4 rounded-lg border p-3 text-sm">{warning}</p>}
      {message && <p role="status" className="mb-4 text-sm text-muted-foreground">{message}</p>}
      {error && <p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
      {player.current()?.source !== "audio" && <YmNotice className="mb-4" />}
      {p.error && <p role="alert" className="mb-4 text-sm text-destructive">{p.error}</p>}

      <div className={cn("grid items-end border-b px-3 pb-3", COLS)}>
        <span />
        <SortButton column="bpm" sort={sort} onSort={onSort}>BPM</SortButton>
        <SortButton column="artist" sort={sort} onSort={onSort} className="hidden sm:block">Артист</SortButton>
        <SortButton column="title" sort={sort} onSort={onSort}>Название</SortButton>
        <span />
      </div>

      <div>{list}</div>
      {!rows.length && (
        <p className="px-3 py-8 text-sm text-muted-foreground">
          {filter === "custom" && !query && !activeTag ? "Своих треков пока нет. Добавьте трек Яндекс Музыки или ссылку на аудиофайл." : filter === "dislike" && !query && !activeTag ? "Дизлайков пока нет. Такие треки не попадают в плеер." : filter === "like" && !query && !activeTag ? "Лайков пока нет." : "Ничего не нашлось."}
        </p>
      )}
      {editing && <TrackDialog track={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      {tagging && <TagsDialog track={tagging} onClose={() => setTagging(null)} />}
      {deleting && <Dialog open onOpenChange={(open) => !open && setDeleting(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Удалить свой трек?</DialogTitle><DialogDescription>{trackLabel(deleting)}</DialogDescription></DialogHeader>
          <DialogBody>Трек будет удалён из вашей библиотеки в этом браузере.</DialogBody>
          <DialogFooter><Button variant="ghost" onClick={() => setDeleting(null)}>Отмена</Button><Button variant="destructive" onClick={() => {
            player.forgetTrack(deleting.id)
            removeCustomTrack(deleting.id)
            setAudioCredentials(deleting.id, null)
            setDeleting(null)
          }}>Удалить</Button></DialogFooter>
        </DialogContent>
      </Dialog>}
    </div>
  )
}

function TrackRow({ track: t, isCurrent: isCur, paused, mark, onEdit, onTags, onDelete, onTag }: {
  track: Track; isCurrent: boolean; paused: boolean; mark?: Mark
  onEdit: (track: Track) => void; onTags: (track: Track) => void; onDelete: (track: Track) => void; onTag: (tag: string) => void
}) {
  const disliked = mark === "dislike"
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
              {t.custom && <span className="block text-[10px] font-normal text-muted-foreground">{t.source === "audio" ? "Аудиофайл" : "Свой трек ЯМ"}</span>}
              {!!t.tags?.length && <span className="mt-1 flex flex-wrap gap-1 font-normal" onDoubleClick={(e) => e.stopPropagation()}>
                {t.tags.map((tag) => <button key={tagKey(tag)} onClick={() => onTag(tag)} title={`Показать тег: ${tag}`} className="max-w-full truncate rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground">{tag}</button>)}
              </span>}
            </span>
            <div className="flex items-center justify-end">
              <OpenInYmButton track={t} />
              <MarkButtons id={t.id} mark={mark} />
              <div onDoubleClick={(e) => e.stopPropagation()}>
                <DropdownMenu>
                  <DropdownMenuTrigger aria-label={`Действия: ${trackLabel(t)}`} className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><MoreHorizontal className="size-4" /></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => onTags(t)}><Tags /> Изменить теги</DropdownMenuItem>
                    {t.custom && <DropdownMenuItem onClick={() => onEdit(t)}><Pencil /> Изменить трек</DropdownMenuItem>}
                    {t.custom && <DropdownMenuItem variant="destructive" onClick={() => onDelete(t)}><Trash2 /> Удалить трек</DropdownMenuItem>}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
  )
}
