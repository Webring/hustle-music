import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react"
import { Music2, X } from "lucide-react"
import { ymWidget } from "@/lib/ym-widget"
import { getTracks } from "@/lib/tracks"
import { useSettings } from "@/lib/settings"
import { usePage } from "@/lib/nav"
import { cn } from "@/lib/utils"

// Виджет Яндекс Музыки. Монтируется один раз на всё приложение: если пересоздать
// iframe, музыка оборвётся. Через него и идёт звук, наш интерфейс им управляет.
export function YmWidgetFrame({ className }: { className?: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [src] = useState(() => {
    const first = getTracks().tracks[0]
    return ymWidget.supported && first ? ymWidget.src({ trackId: first.id, albumId: first.albumId }) : null
  })

  useEffect(() => {
    const frame = ref.current
    if (!frame) return
    ymWidget.attach(frame)
    return () => ymWidget.detach(frame)
  }, [])

  if (!src) {
    return (
      <div className={cn("p-4 text-xs text-muted-foreground", className)}>
        Плеер Яндекс Музыки работает только на странице, открытой по адресу http(s), а не из файла.
      </div>
    )
  }

  return (
    <iframe
      ref={ref}
      src={src}
      title="Яндекс Музыка"
      allow="autoplay; encrypted-media"
      className={cn("block w-full border-0", className)}
    />
  )
}

// ---------- Место для виджета внутри карточки плеера ----------
// Переносить iframe в другое место DOM нельзя (он перезагрузится), поэтому виджет
// остаётся в App, а слот только сообщает, где его нарисовать.

let slot: HTMLElement | null = null
const slotListeners = new Set<() => void>()
const setSlot = (el: HTMLElement | null) => {
  slot = el
  slotListeners.forEach((fn) => fn())
}
const useSlot = () =>
  useSyncExternalStore(
    (fn) => (slotListeners.add(fn), () => void slotListeners.delete(fn)),
    () => slot,
  )

export function YmWidgetSlot({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    setSlot(ref.current)
    return () => setSlot(null)
  }, [])
  return <div ref={ref} className={cn("h-[102px]", className)} /> // виджет 100px + рамка
}

// Виджет на всё приложение. Режимы (Настройки → «Виджет Яндекса»):
// float — окно в углу; embed — поверх слота в карточке плеера (на других страницах — в углу);
// button и hidden — виджет прозрачный, но на экране (display:none браузер может притормозить).
// В button остаётся кнопка «Яндекс Музыка»: открывает виджет, чтобы войти в аккаунт или поменять громкость.
// В репитере ЯМ не участвует — там виджет и кнопка скрыты в любом режиме (iframe не выгружаем).
export function YmWidgetDock() {
  const { ymView } = useSettings()
  const currentSlot = useSlot()
  const target = ymView === "embed" ? currentSlot : null
  const ref = useRef<HTMLElement>(null)
  const [peekFor, setPeekFor] = useState<string | null>(null) // открыт ли скрытый виджет; сбрасывается при смене режима
  const peek = peekFor === ymView
  const offPage = usePage() === "repeater"
  const concealed = ymView === "button" || ymView === "hidden"
  const hidden = offPage || (concealed && !peek)

  // Держим виджет ровно над слотом: синхронно на скролл/ресайз, без отставания на кадр
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    if (!target) {
      el.removeAttribute("style")
      return
    }
    const place = () => {
      const r = target.getBoundingClientRect()
      Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, right: "auto", bottom: "auto" })
    }
    place()
    const ro = new ResizeObserver(place)
    ro.observe(target)
    ro.observe(document.body)
    addEventListener("scroll", place, true)
    addEventListener("resize", place)
    return () => {
      ro.disconnect()
      removeEventListener("scroll", place, true)
      removeEventListener("resize", place)
      el.removeAttribute("style")
    }
  }, [target])

  return (
    <>
      <aside
        ref={ref}
        className={cn(
          "fixed z-30 overflow-hidden bg-card",
          target
            ? "rounded-lg border"
            : "right-4 bottom-4 w-[min(340px,calc(100vw-2rem))] rounded-xl border shadow-lg",
          hidden && "pointer-events-none opacity-0",
          concealed && "bottom-16",
        )}
      >
        <YmWidgetFrame className="h-[100px]" />
      </aside>

      {ymView === "button" && !offPage && (
        <button
          onClick={() => setPeekFor(peek ? null : ymView)}
          title={peek ? "Скрыть виджет" : "Показать виджет Яндекс Музыки (вход в аккаунт, громкость)"}
          className="fixed right-4 bottom-4 z-30 flex h-9 items-center gap-2 rounded-full border bg-card/90 px-3.5 text-xs text-muted-foreground shadow-sm backdrop-blur transition-colors hover:text-foreground"
        >
          {peek ? <X className="size-3.5" /> : <Music2 className="size-3.5" />}
          Яндекс Музыка
        </button>
      )}
    </>
  )
}
