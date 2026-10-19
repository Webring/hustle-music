import { useRef } from "react"
import { ChevronLeft, ChevronRight, Crosshair, Pause, Play, Repeat, RotateCcw, Upload, Volume2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Switch } from "@/components/ui/switch"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { repeater, useRepeater } from "@/lib/repeater"
import { setSettings, useSettings } from "@/lib/settings"

// 1:05.3
const fmt = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = s - m * 60
  return `${m}:${sec.toFixed(1).padStart(4, "0")}`
}

function EdgeControl({ label, value, edge }: { label: string; value: number; edge: "a" | "b" }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-[11px] font-medium tracking-[0.18em] text-muted-foreground uppercase">{label}</div>
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <span className="text-2xl font-medium tracking-tight tabular">{fmt(value)}</span>
        <div className="flex items-center">
          <Button variant="ghost" size="icon-sm" onClick={() => repeater.nudge(edge, -0.1)} aria-label={`${label}: −0,1 с`}>
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="icon-sm" onClick={() => repeater.nudge(edge, 0.1)} aria-label={`${label}: +0,1 с`}>
            <ChevronRight />
          </Button>
        </div>
      </div>
      <button
        onClick={() => repeater.markHere(edge)}
        className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        <Crosshair className="size-3" /> Поставить на текущее место
      </button>
    </div>
  )
}

export function RepeaterPage() {
  const r = useRepeater()
  const s = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)
  const barRef = useRef<HTMLDivElement>(null)

  const upload = (
    <>
      <input
        ref={fileRef} type="file" accept="audio/*" hidden
        onChange={(e) => {
          const f = e.target.files?.[0]
          if (f) repeater.setFile(f)
          e.target.value = ""
        }}
      />
    </>
  )

  const d = r.duration || 1
  const pct = (x: number) => `${(Math.max(0, Math.min(x, d)) / d) * 100}%`
  const playing = r.status === "playing" || r.status === "signal"

  return (
    <div className="mx-auto max-w-2xl">
      {upload}
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Репитер</h1>
          <p className="mt-1 text-sm text-muted-foreground">Фрагмент трека по кругу — от начала до конца отрезка</p>
        </div>
        {r.source && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={() => fileRef.current?.click()} className="text-muted-foreground">
              <Upload /> Свой файл
            </Button>
            <Button variant="ghost" size="sm" onClick={() => repeater.clear()} className="text-muted-foreground">
              <X /> Убрать
            </Button>
          </div>
        )}
      </div>

      {!r.source ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed px-6 py-16 text-center">
          <Repeat className="size-6 text-muted-foreground" />
          <p className="mt-4 max-w-sm text-sm text-muted-foreground">
            Загрузите свой аудиофайл.
          </p>
          <div className="mt-6 flex gap-2">
            <Button onClick={() => fileRef.current?.click()}>
              <Upload /> Загрузить файл
            </Button>
          </div>
        </div>
      ) : (
        <section className="rounded-2xl border bg-card p-6 sm:p-8">
          <div className="min-w-0">
            <div className="truncate text-xl font-medium tracking-tight">
              {r.source.name}
            </div>
            <div className="mt-0.5 truncate text-sm text-muted-foreground">
              Свой файл
            </div>
          </div>

          {r.error ? (
            <p className="mt-8 text-sm text-destructive">Не удалось загрузить трек.</p>
          ) : (
            <>
              {/* Весь трек: отрезок A–B и текущее место. Клик — перемотка. */}
              <div className="mt-8">
                <div
                  ref={barRef}
                  className="relative h-8 cursor-pointer"
                  onClick={(e) => {
                    const rect = barRef.current!.getBoundingClientRect()
                    repeater.seek(((e.clientX - rect.left) / rect.width) * r.duration)
                  }}
                  title="Перемотать"
                >
                  <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-muted" />
                  <div
                    className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-primary/35"
                    style={{ left: pct(r.a), width: `calc(${pct(r.b)} - ${pct(r.a)})` }}
                  />
                  <div
                    className="absolute top-1/2 h-4 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground"
                    style={{ left: pct(r.time) }}
                  />
                </div>
                <Slider
                  value={[r.a, r.b]}
                  min={0}
                  max={d}
                  step={0.1}
                  disabled={r.loading}
                  onValueChange={(v) => {
                    const [a, b] = v as number[]
                    repeater.setRange(a, b)
                  }}
                  className="mt-2"
                />
                <div className="mt-2 flex justify-between text-xs text-muted-foreground tabular">
                  <span>0:00</span>
                  <span>{r.loading ? "загрузка…" : fmt(r.duration)}</span>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <EdgeControl label="Начало" value={r.a} edge="a" />
                <EdgeControl label="Конец" value={r.b} edge="b" />
              </div>

              <div className="mt-8 flex items-center justify-between">
                <div className="w-28 text-xs text-muted-foreground tabular">
                  <div>фрагмент {fmt(r.b - r.a)}</div>
                  <div className="mt-0.5">повтор {r.loops}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button variant="ghost" size="icon" onClick={() => repeater.restart()} aria-label="В начало фрагмента">
                    <RotateCcw />
                  </Button>
                  <Button size="icon" className="size-12 rounded-full" onClick={() => repeater.toggle()} disabled={r.loading} aria-label="Играть / пауза">
                    {playing ? <Pause className="size-5" /> : <Play className="size-5 translate-x-px" />}
                  </Button>
                </div>
                <div className={cn("w-28 text-right text-xs tabular", r.status === "signal" ? "text-primary" : "text-muted-foreground")}>
                  {r.status === "signal" ? "Bring the action" : fmt(r.time)}
                </div>
              </div>
            </>
          )}

          <Separator className="my-6" />

          <div className="flex items-start justify-between gap-6">
            <div>
              <div className="text-sm">Bring the action</div>
              <div className="mt-0.5 text-xs text-muted-foreground">Звучит перед каждым повтором</div>
            </div>
            <Switch checked={r.bta} onCheckedChange={(v) => repeater.setBta(v)} className="mt-0.5" />
          </div>
          <div className="mt-5 flex items-center gap-3 text-muted-foreground">
            <Volume2 className="size-4" />
            <Slider
              value={[s.vol]}
              onValueChange={(v) => {
                setSettings({ vol: (v as number[])[0] })
                repeater.applyVol()
              }}
              className="max-w-48"
            />
          </div>
        </section>
      )}
    </div>
  )
}
