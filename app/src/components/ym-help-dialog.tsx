import { useRef, useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { closeYmHelp, useYmHelpOpen } from "@/lib/ym-help"
import { YM_ORIGIN } from "@/lib/ym-widget"
import { cn } from "@/lib/utils"

type BrowserId = "safari" | "chrome" | "firefox"

// Safari и браузеры на его движке (в том числе всё на iOS) режут вход Яндекса в виджете сильнее всех
function detectBrowser(): BrowserId | null {
  const ua = navigator.userAgent
  if (/firefox|fxios/i.test(ua)) return "firefox"
  if (/safari/i.test(ua) && !/chrome|chromium|crios|edg|opr|android/i.test(ua)) return "safari"
  if (/chrome|chromium|crios|edg|opr/i.test(ua)) return "chrome"
  return null
}

// Адреса внутренних страниц настроек. Ссылкой их не открыть (браузер блокирует переход
// с сайта на chrome:// и подобные), поэтому показываем адрес и даём его скопировать.
function settingsUrl(id: BrowserId): string | null {
  const ua = navigator.userAgent
  if (id === "firefox") return "about:preferences#privacy"
  if (id === "chrome") {
    if (/edg/i.test(ua)) return "edge://settings/content/cookies"
    if (/opr/i.test(ua)) return "opera://settings/cookies"
    if (/yabrowser/i.test(ua)) return null
    return "chrome://settings/cookies"
  }
  return null // у Safari такого адреса нет
}

const BROWSERS: { id: BrowserId; name: string; steps: string }[] = [
  {
    id: "safari",
    name: "Safari",
    steps:
      "Mac: Safari → Настройки → Конфиденциальность → снимите «Предотвращать межсайтовое отслеживание». iPhone и iPad: Настройки → Safari → выключите «Предотвращать межсайтовое отслеживание». Если не хотите менять настройку, откройте сайт в Chrome или Firefox.",
  },
  {
    id: "chrome",
    name: "Chrome, Edge, Яндекс Браузер",
    steps:
      "Настройки → Конфиденциальность и безопасность → Сторонние файлы cookie → «Разрешить» либо добавьте music.yandex.ru в список разрешённых сайтов. В режиме инкогнито сторонние cookie отключены сами — откройте обычное окно.",
  },
  {
    id: "firefox",
    name: "Firefox",
    steps:
      "Нажмите на щит в адресной строке → выключите «Расширенную защиту от отслеживания» для этого сайта. Либо Настройки → Приватность и защита → режим «Стандартная».",
  },
]

export function YmHelpDialog() {
  const open = useYmHelpOpen()
  const okRef = useRef<HTMLButtonElement>(null)
  const mine = detectBrowser()
  const browsers = [...BROWSERS].sort((a, b) => Number(b.id === mine) - Number(a.id === mine))

  return (
    <Dialog open={open} onOpenChange={(o) => !o && closeYmHelp()}>
      <DialogContent initialFocus={okRef}>
        <DialogHeader>
          <DialogTitle>Как слушать треки целиком</DialogTitle>
          <DialogDescription>
            Музыка играет во встроенном плеере Яндекс Музыки. Без входа и подписки он включает только отрывки по 30 секунд.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <ol className="space-y-4">
            <Step n={1} title="Войдите в Яндекс Музыку с подпиской Плюс">
              Откройте Яндекс Музыку в этом же браузере и войдите в аккаунт.
              <a
                href={YM_ORIGIN}
                target="_blank"
                rel="noreferrer"
                className="mt-1.5 flex w-fit items-center gap-1 font-medium text-foreground underline underline-offset-4"
              >
                Открыть Яндекс Музыку <ExternalLink className="size-3.5" />
              </a>
            </Step>

            <Step n={2} title="Разрешите ей сторонние cookie">
              Плеер Яндекса встроен в наш сайт, а многие браузеры не передают встроенным плеерам ваш вход. Тогда
              Яндекс считает вас гостем, даже если в соседней вкладке вы вошли. Настройка для вашего браузера:
              <div className="mt-2 space-y-2">
                {browsers.map((b) => (
                  <div key={b.id} className={cn("rounded-lg border p-3 text-xs leading-relaxed", b.id === mine && "border-foreground/30 bg-muted/60")}>
                    <div className="mb-0.5 flex flex-wrap items-center gap-x-2 text-sm font-medium text-foreground">
                      {b.name}
                      {b.id === mine && <span className="shrink-0 whitespace-nowrap rounded-full bg-foreground px-2 py-px text-[10px] font-normal text-background">ваш браузер</span>}
                    </div>
                    {b.steps}
                    <CopyUrl url={settingsUrl(b.id)} />
                  </div>
                ))}
              </div>
            </Step>

            <Step n={3} title="Обновите эту страницу">
              После этого плеер увидит ваш аккаунт, и треки будут играть целиком.
            </Step>
          </ol>

          <p className="border-t pt-4 text-xs leading-relaxed text-muted-foreground">
            Перемотки в плеере Яндекса нет: приложение не может её включить. Громкость регулируется в самом плеере (кнопка
            «Яндекс Музыка» в углу) или в системе. Эту инструкцию можно открыть снова из сообщения про отрывки.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button ref={okRef} onClick={closeYmHelp}>Понятно</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">{n}</span>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground">
        <div className="font-medium text-foreground">{title}</div>
        {children}
      </div>
    </li>
  )
}

function CopyUrl({ url }: { url: string | null }) {
  const [done, setDone] = useState(false)
  if (!url) return null

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setDone(true)
      setTimeout(() => setDone(false), 2000)
    } catch {
      /* буфер недоступен — адрес виден на экране, можно выделить вручную */
    }
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] text-foreground select-all">{url}</code>
      <Button variant="outline" size="xs" onClick={copy}>
        {done ? <Check /> : <Copy />}
        {done ? "Скопировано" : "Скопировать"}
      </Button>
      <span className="text-[11px]">и вставьте в адресную строку</span>
    </div>
  )
}
