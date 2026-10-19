import { CircleAlert, Info, X } from "lucide-react"
import { clearYmIssue, dismissYmIssue, useYmIssue, type YmIssue } from "@/lib/ym-status"
import { YM_ORIGIN } from "@/lib/ym-widget"
import { cn } from "@/lib/utils"

type Message = {
  title: string
  text: string
  tone: "error" | "info"
  action?: { label: string; href?: string; onClick?: () => void }
  close?: "dismiss" | "clear" // dismiss — не показывать до перезагрузки, clear — просто убрать
}

const reload = { label: "Обновить страницу", onClick: () => location.reload() }

const MESSAGES: Record<YmIssue, Message> = {
  insecure: {
    title: "По этому адресу музыка не заиграет",
    text: "Страница открыта по http. Яндекс Музыка играет только на защищённой странице — откройте сайт по адресу, начинающемуся с https.",
    tone: "error",
  },
  unreachable: {
    title: "Нет связи с Яндекс Музыкой",
    text: "Плеер Яндекса не загрузился. Проверьте интернет. Если он есть — возможно, music.yandex.ru недоступен в вашей сети или его блокирует VPN или блокировщик рекламы.",
    tone: "error",
    action: reload,
  },
  stuck: {
    title: "Трек не запускается",
    text: "Яндекс Музыка не начала воспроизведение. Попробуйте ещё раз или обновите страницу.",
    tone: "error",
    action: reload,
  },
  preview: {
    title: "Играют только отрывки по 30 секунд",
    text: "Чтобы слушать целиком, войдите в Яндекс Музыку с Плюсом в этом браузере и обновите страницу. Уже вошли — разрешите сторонние cookie для music.yandex.ru.",
    tone: "info",
    action: { label: "Войти в Яндекс Музыку", href: YM_ORIGIN },
    close: "dismiss",
  },
  unavailable: {
    title: "Трек недоступен в Яндекс Музыке",
    text: "Включили следующий.",
    tone: "info",
    close: "clear",
  },
}

// Понятное сообщение о проблеме с Яндекс Музыкой (если она есть)
export function YmNotice({ className }: { className?: string }) {
  const issue = useYmIssue()
  if (!issue) return null
  const m = MESSAGES[issue]
  const Icon = m.tone === "error" ? CircleAlert : Info
  const link = "font-medium underline underline-offset-4 hover:text-foreground"

  return (
    <div
      role={m.tone === "error" ? "alert" : "status"}
      className={cn(
        "flex gap-3 rounded-xl border p-3.5 text-xs leading-relaxed",
        m.tone === "error" ? "border-destructive/30 bg-destructive/5" : "bg-muted/60",
        className,
      )}
    >
      <Icon className={cn("mt-px size-4 shrink-0", m.tone === "error" ? "text-destructive" : "text-muted-foreground")} />
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-foreground">{m.title}</div>
        <p className="mt-0.5 text-muted-foreground">{m.text}</p>
        {m.action && (
          <div className="mt-2 text-muted-foreground">
            {m.action.href ? (
              <a href={m.action.href} target="_blank" rel="noreferrer" className={link}>{m.action.label}</a>
            ) : (
              <button onClick={m.action.onClick} className={link}>{m.action.label}</button>
            )}
          </div>
        )}
      </div>
      {m.close && (
        <button
          onClick={() => (m.close === "dismiss" ? dismissYmIssue(issue) : clearYmIssue(issue))}
          aria-label="Закрыть"
          className="-mt-1 -mr-1 flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-background hover:text-foreground"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
