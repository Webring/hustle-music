import { useDeferredValue, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react"
import { Pause, Play, Plus, Repeat1, Search, SkipBack, SkipForward, Timer, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { MarkButtons, OpenInYmButton } from "@/components/mark-buttons"
import { YmWidgetSlot } from "@/components/ym-widget-frame"
import { YmNotice } from "@/components/ym-notice"
import { useMarks } from "@/lib/marks"
import { cn } from "@/lib/utils"
import { buildQueue, player, usePlayer } from "@/lib/player"
import { intervalsToHash, setSettings, useSettings, type Interval } from "@/lib/settings"
import { coverUrl, trackLabel, useTracks } from "@/lib/tracks"
import { getSignalName, playSignal, setCustomSignal, subscribeSignal } from "@/lib/signal"

const fmt = (s: number) => (isFinite(s) && s >= 0 ? `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}` : "0:00")
const signature = (intervals: Interval[], shuffle: boolean) => JSON.stringify([intervals, shuffle])
let lastBuilt: string | null = null // переживает переключение страниц

function SectionTitle({ children, aside }: { children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-baseline justify-between">
      <h2 className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">{children}</h2>
      {aside && <span className="text-xs text-muted-foreground">{aside}</span>}
    </div>
  )
}

function IntervalRow({ value, bounds, onChange, onRemove }: {
  value: Interval
  bounds: [number, number]
  onChange: (v: Interval) => void
  onRemove?: () => void
}) {
  return (
    <div className="group flex items-center gap-4">
      <div className="w-[112px] shrink-0 text-sm whitespace-nowrap tabular">
        <span className="font-medium">{value.from}</span>
        <span className="text-muted-foreground"> — </span>
        <span className="font-medium">{value.to}</span>
        <span className="ml-1 text-xs text-muted-foreground">bpm</span>
      </div>
      <Slider
        value={[value.from, value.to]}
        min={bounds[0]}
        max={bounds[1]}
        onValueChange={(v) => {
          const [from, to] = v as number[]
          onChange({ from, to })
        }}
        className="flex-1"
      />
      <Button
        variant="ghost" size="icon-sm" onClick={onRemove} aria-label="Убрать интервал"
        className={cn("text-muted-foreground", !onRemove && "invisible")}
      >
        <X />
      </Button>
    </div>
  )
}

function OptionRow({ title, hint, checked, onChange, children }: {
  title: string
  hint?: string
  checked: boolean
  onChange: (v: boolean) => void
  children?: React.ReactNode
}) {
  return (
    <div className="flex items-start justify-between gap-6 py-3">
      <div className="min-w-0">
        <div className="text-sm">{title}</div>
        {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
        {children}
      </div>
      <Switch checked={checked} onCheckedChange={(v) => onChange(v)} className="mt-0.5" />
    </div>
  )
}

export function PlayerPage() {
  const s = useSettings()
  const p = usePlayer()
  const { tracks, byId, status } = useTracks()
  const signalName = useSyncExternalStore(subscribeSignal, getSignalName)
  const [built, setBuilt] = useState(lastBuilt)
  const [q, setQ] = useState("")
  const marks = useMarks()
  const fileRef = useRef<HTMLInputElement>(null)
  const [seekHint, setSeekHint] = useState(false)
  const seekTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const showSeekHint = () => {
    setSeekHint(true)
    clearTimeout(seekTimer.current)
    seekTimer.current = setTimeout(() => setSeekHint(false), 2500)
  }
  const listRef = useRef<HTMLDivElement>(null)

  // Границы слайдера — по BPM из базы, как на сайте (70–129)
  const bounds = useMemo<[number, number]>(() => {
    const all = [...tracks.map((t) => t.bpm), ...s.intervals.flatMap((i) => [i.from, i.to])]
    return all.length ? [Math.min(...all), Math.max(...all)] : [70, 130]
  }, [tracks, s.intervals])

  const build = () => {
    player.setQueue(buildQueue(tracks, s.intervals, s.shuffle))
    lastBuilt = signature(s.intervals, s.shuffle)
    setBuilt(lastBuilt)
    history.replaceState(null, "", intervalsToHash(s.intervals))
  }
  // как на сайте: список виден сразу
  useEffect(() => {
    if (status === "ready" && lastBuilt == null) build()
  }, [status]) // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = built != null && built !== signature(s.intervals, s.shuffle)
  const active = p.status !== "idle" && p.previewId == null
  const cur = active ? byId.get(p.queue[p.qi]) : p.previewId != null ? byId.get(p.previewId) : undefined
  const remaining = s.timed && active ? Math.max(0, s.timedSec - p.elapsed) : null

  useEffect(() => {
    listRef.current?.querySelector("[data-current]")?.scrollIntoView({ block: "nearest", behavior: "smooth" })
  }, [p.qi, active])

  const setInterval_ = (i: number, v: Interval) => setSettings((st) => ({ intervals: st.intervals.map((x, j) => (j === i ? v : x)) }))
  const addInterval = () => setSettings((st) => {
    const last = st.intervals[st.intervals.length - 1] ?? { from: 100, to: 110 }
    return { intervals: [...st.intervals, { from: Math.max(bounds[0], last.from - 1), to: Math.min(bounds[1], last.to + 1) }] }
  })

  const queueBpm = useMemo(() => {
    const b = p.queue.map((id) => byId.get(id)?.bpm).filter((x): x is number => x != null)
    return b.length ? `${Math.min(...b)}–${Math.max(...b)} bpm` : ""
  }, [p.queue, byId])

  // список подборки перерисовываем только при смене очереди или текущего трека
  // поиск по подборке; индексы сохраняем исходные — по ним плеер переключает треки
  const query = useDeferredValue(q.trim().toLowerCase())
  const visible = useMemo(() => {
    const all = p.queue.map((id, i) => ({ id, i }))
    if (!query) return all
    return all.filter(({ id }) => {
      const t = byId.get(id)
      return t && `${t.artist} ${t.title} ${t.bpm}`.toLowerCase().includes(query)
    })
  }, [p.queue, byId, query])

  // список перерисовываем только при смене подборки, поиска, текущего трека или оценок
  const queueJsx = useMemo(
    () =>
      visible.slice(0, 600).map(({ id, i }) => {
        const t = byId.get(id)
        if (!t) return null
        const isCur = active && i === p.qi
        return (
          <div
            key={id}
            role="button"
            tabIndex={0}
            data-current={isCur || undefined}
            onClick={() => player.playAt(i)}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), player.playAt(i))}
            className={cn(
              "group flex w-full cursor-pointer items-center gap-2 rounded-lg sm:gap-4 py-1.5 pr-1.5 pl-3 text-left text-sm transition-colors outline-none hover:bg-muted/70 focus-visible:bg-muted/70",
              isCur && "bg-muted",
            )}
          >
            <span className={cn("w-8 shrink-0 text-xs tabular sm:w-14", isCur ? "text-primary" : "text-muted-foreground")}>
              {t.bpm}<span className="hidden sm:inline"> bpm</span>
            </span>
            {/* на телефоне — название и артист в две строки, иначе одной строкой */}
            <span className={cn("min-w-0 flex-1 py-1", isCur ? "font-medium" : "text-foreground/85")}>
              <span className="hidden truncate sm:block">{trackLabel(t)}</span>
              <span className="block truncate sm:hidden">{t.title}</span>
              {t.artist && <span className="block truncate text-xs font-normal text-muted-foreground sm:hidden">{t.artist}</span>}
            </span>
            {isCur && <span className="size-1.5 shrink-0 rounded-full bg-primary" />}
            <OpenInYmButton track={t} />
            <MarkButtons id={id} mark={marks[id]} />
          </div>
        )
      }),
    [visible, p.qi, active, byId, marks],
  )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-x-16 gap-y-12 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      {/* ---------- Сайдбар: плеер, «Подобрать треки», настройки ---------- */}
      {/* Липкая колонка — только если экран достаточно высокий, иначе настройкам не хватает места */}
      <aside className="flex flex-col gap-6 self-start desk:sticky desk:top-16 desk:-mt-12 desk:h-[calc(100svh-4rem)] desk:pt-12 desk:pb-8">
        {/* ---------- Сейчас играет ---------- */}
        <section className="rounded-2xl border bg-card p-6">
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">
              {p.previewId != null ? "Прослушивание" : "Сейчас"}
            </span>
            {remaining != null && <span className="text-xs text-muted-foreground tabular">ещё {fmt(remaining)}</span>}
          </div>
          <div className="mt-3 flex min-h-[3.5rem] items-center gap-3">
            {coverUrl(cur) && <img src={coverUrl(cur, 100)!} alt="" className="size-12 shrink-0 rounded-md object-cover" />}
            <div className="min-w-0 flex-1">
              <div className="truncate text-xl font-medium tracking-tight">{cur?.title || "—"}</div>
              {/* длинный список артистов обрезаем, а темп оставляем видимым всегда */}
              <div className="mt-0.5 flex text-sm text-muted-foreground">
                {cur ? (
                  <>
                    {cur.artist && <span className="truncate">{cur.artist}</span>}
                    <span className="shrink-0 whitespace-pre">{cur.artist ? " · " : ""}{cur.bpm} bpm</span>
                  </>
                ) : (
                  "Ничего не играет"
                )}
              </div>
            </div>
          </div>

          <YmNotice className="mt-4" />

          {/* Перемотки в виджете Яндекс Музыки нет — это только индикатор. На попытку
              перемотать (клик или протяжка по полосе) коротко объясняем, почему нельзя. */}
          <div className="mt-5 cursor-default py-1.5 -my-1.5" onPointerDown={showSeekHint}>
            <div className={cn("h-1 overflow-hidden rounded-full transition-colors", seekHint ? "bg-muted-foreground/25" : "bg-muted")}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-300" style={{ width: `${p.duration ? Math.min(100, (p.time / p.duration) * 100) : 0}%` }} />
            </div>
            <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular">
              {seekHint ? (
                <span className="w-full truncate text-center animate-in fade-in">Перемотка недоступна в Яндекс Музыке</span>
              ) : (
                <>
                  <span>{fmt(p.time)}</span>
                  <span>{fmt(p.duration)}</span>
                </>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <Button
              variant={s.timed ? "secondary" : "ghost"} size="sm" onClick={() => setSettings({ timed: !s.timed })}
              aria-pressed={s.timed} title={s.timed ? `Режим ${s.timedSec} секунд включён` : `Включить режим ${s.timedSec} секунд`}
              className={cn("tabular", s.timed ? "text-primary" : "text-muted-foreground")}
            >
              <Timer /> {s.timedSec}
            </Button>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={() => player.prev()} aria-label="Предыдущий"><SkipBack /></Button>
              <Button size="icon" className="size-12 rounded-full" onClick={() => player.togglePlay()} aria-label="Играть / пауза">
                {p.paused ? <Play className="size-5 translate-x-px" /> : <Pause className="size-5" />}
              </Button>
              <Button variant="ghost" size="icon" onClick={() => player.next()} aria-label="Следующий"><SkipForward /></Button>
            </div>
            <Button
              variant={s.repeat ? "secondary" : "ghost"} size="icon-sm" onClick={() => setSettings({ repeat: !s.repeat })}
              aria-pressed={s.repeat} title="Повторять трек" aria-label="Повторять трек"
              className={s.repeat ? "text-primary" : "text-muted-foreground"}
            >
              <Repeat1 />
            </Button>
          </div>

          {s.ymView === "embed" && <YmWidgetSlot className="mt-5" />}

          <Separator className="my-5" />
          <p className="text-xs leading-relaxed text-muted-foreground">
            Музыка играет через Яндекс Музыку. Полные треки — если вы вошли в{" "}
            <a href="https://music.yandex.ru" target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">аккаунт</a>{" "}
            с Плюсом, иначе — отрывки по 30 секунд.
          </p>
        </section>

        <div className="shrink-0">
          <Button size="lg" variant={dirty ? "default" : "outline"} onClick={build} disabled={status !== "ready"} className="h-11 w-full">
            Подобрать треки
          </Button>
          {dirty && <p className="mt-2 text-center text-xs text-muted-foreground">Настройки изменились — подберите треки заново</p>}
        </div>

        <div className="min-h-0 flex-1 [scrollbar-width:thin] desk:-mr-4 desk:overflow-y-auto desk:pr-4">
          <div className="flex flex-col gap-8 border-t pt-6">
            <section>
              <SectionTitle>Темп</SectionTitle>
              <div className="space-y-5">
                {s.intervals.map((iv, i) => (
                  <IntervalRow
                    key={i}
                    value={iv}
                    bounds={bounds}
                    onChange={(v) => setInterval_(i, v)}
                    onRemove={s.intervals.length > 1 ? () => setSettings((st) => ({ intervals: st.intervals.filter((_, j) => j !== i) })) : undefined}
                  />
                ))}
              </div>
              <Button variant="ghost" size="sm" onClick={addInterval} className="mt-3 -ml-2 text-muted-foreground">
                <Plus /> Добавить интервал
              </Button>
            </section>

            <section>
              <SectionTitle>Параметры</SectionTitle>
              <div className="divide-y">
                <OptionRow title="Случайный порядок" checked={s.shuffle} onChange={(v) => setSettings({ shuffle: v })} />
                <OptionRow
                  title="Bring the action"
                  hint={signalName ? `Звучит при смене трека · ${signalName}` : "Звучит при смене трека"}
                  checked={s.bta}
                  onChange={(v) => setSettings({ bta: v })}
                >
                  <div className="mt-1.5 flex gap-3 text-xs">
                    <button className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => playSignal()}>
                      Прослушать
                    </button>
                    <button className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => fileRef.current?.click()}>
                      {signalName ? "Заменить звук" : "Свой звук"}
                    </button>
                    {signalName && (
                      <button className="text-muted-foreground underline-offset-4 hover:text-foreground hover:underline" onClick={() => setCustomSignal(null)}>
                        Сбросить
                      </button>
                    )}
                    <input
                      ref={fileRef} type="file" accept="audio/*" hidden
                      onChange={(e) => {
                        const f = e.target.files?.[0]
                        if (f) setCustomSignal(f)
                        e.target.value = ""
                      }}
                    />
                  </div>
                </OptionRow>
              </div>
            </section>
          </div>
        </div>
      </aside>

      {/* ---------- Правая колонка: подборка ---------- */}
      <section className="min-w-0">
        <SectionTitle aside={p.queue.length ? `${query ? `${visible.length} из ` : ""}${p.queue.length} · ${queueBpm}` : undefined}>Подборка</SectionTitle>
        {status === "ready" && !p.queue.length && (
          <p className="text-sm text-muted-foreground">Под эти интервалы ничего не нашлось.</p>
        )}
        {p.queue.length > 0 && (
          <div className="relative mb-3">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск в подборке" className="h-9 pl-9" />
          </div>
        )}
        {query && !visible.length && <p className="text-sm text-muted-foreground">В подборке ничего не нашлось.</p>}
        <div ref={listRef} className="-mx-3">
          {queueJsx}
          {visible.length > 600 && <p className="px-3 py-2 text-xs text-muted-foreground">…и ещё {visible.length - 600}</p>}
        </div>
      </section>
    </div>
  )
}
