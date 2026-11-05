import { useId, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { getTracks, saveCustomTrack, setTrackTags, type AudioAuth, type Track } from "@/lib/tracks"
import { audioHeaders, getAudioCredentials, setAudioCredentials } from "@/lib/audio-source"
import { normalizeTags, parseTrackUrl, parseYandexUrl, validateAuth, validateBpm } from "@/lib/track-data"
import { ymTrackUrl } from "@/lib/ym-widget"
import { player } from "@/lib/player"

export const selectClass = "h-9 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"

export function TrackDialog({ track, onClose }: { track?: Track; onClose: () => void }) {
  const id = useId()
  const [source, setSource] = useState<"yandex" | "audio">(track?.source === "audio" ? "audio" : "yandex")
  const [url, setUrl] = useState(track?.url ?? (track ? ymTrackUrl(track) : ""))
  const [title, setTitle] = useState(track?.title ?? "")
  const [artist, setArtist] = useState(track?.artist ?? "")
  const [bpm, setBpm] = useState(track ? String(track.bpm) : "")
  const [tags, setTags] = useState(track?.tags?.join(", ") ?? "")
  const [authType, setAuthType] = useState<AudioAuth["type"]>(track?.auth?.type ?? "none")
  const [header, setHeader] = useState(track?.auth?.type === "api-key" ? track.auth.header : "X-API-Key")
  const initial = track ? getAudioCredentials(track.id) : {}
  const [token, setToken] = useState(initial.token ?? "")
  const [username, setUsername] = useState(initial.username ?? "")
  const [password, setPassword] = useState(initial.password ?? "")
  const [error, setError] = useState<string | null>(null)

  const fillKnown = () => {
    if (source !== "yandex" || track) return
    try {
      const parsed = parseYandexUrl(url)
      const known = getTracks().byId.get(parsed.id)
      if (known) {
        setTitle(known.title)
        setArtist(known.artist)
        setBpm(String(known.bpm))
        setTags(known.tags?.join(", ") ?? "")
      }
    } catch { /* проверим ссылку при сохранении */ }
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    try {
      const link = source === "yandex" ? parseYandexUrl(url) : { id: track?.id ?? `audio:${crypto.randomUUID()}`, albumId: "", url: parseTrackUrl(url).href }
      const auth = source === "audio" ? validateAuth({ type: authType, header }) : undefined
      const values = authType === "basic" ? { username, password } : { token }
      if (auth && auth.type !== "none") audioHeaders(auth, values)
      const known = source === "yandex" ? getTracks().byId.get(link.id) : undefined
      const fallbackTitle = source === "yandex" ? `Трек ЯМ ${link.id}` : new URL(link.url).pathname.split("/").filter(Boolean).at(-1) || "Аудиотрек"
      const saved = saveCustomTrack({
        ...link, source, title: title.trim() || known?.title || fallbackTitle, artist: artist.trim(), bpm: validateBpm(Number(bpm)),
        tags: normalizeTags(tags), auth, custom: true,
        durationMs: known?.durationMs ?? (track?.url === link.url ? track.durationMs : null),
        cover: known?.cover ?? null,
      }, track?.id)
      setAudioCredentials(saved.id, auth && auth.type !== "none" ? values : null)
      if (track && track.id !== saved.id) {
        player.forgetTrack(track.id)
        setAudioCredentials(track.id, null)
      } else if (track?.source === "audio" && player.current()?.id === track.id
        && (track.url !== saved.url || JSON.stringify(track.auth) !== JSON.stringify(saved.auth) || JSON.stringify(initial) !== JSON.stringify(values))) {
        player.stop()
      }
      onClose()
    } catch (e) { setError(e instanceof Error ? e.message : "Не удалось сохранить трек.") }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form onSubmit={submit} className="flex min-h-0 flex-col">
          <DialogHeader>
            <DialogTitle>{track ? "Изменить трек" : "Добавить трек"}</DialogTitle>
            <DialogDescription>Укажите ссылку и BPM. Теги помогут собрать подборку для тренировки.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor={`${id}-source`} className="text-sm font-medium">Источник</label>
              <select id={`${id}-source`} className={selectClass} value={source} disabled={!!track} onChange={(e) => { setSource(e.target.value as typeof source); setUrl(""); setError(null) }}>
                <option value="yandex">Яндекс Музыка</option>
                <option value="audio">Аудиофайл по ссылке</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-url`} className="text-sm font-medium">{source === "yandex" ? "Ссылка на трек ЯМ" : "Прямая ссылка на аудиофайл"} *</label>
              <Input id={`${id}-url`} type="url" required value={url} onChange={(e) => setUrl(e.target.value)} onBlur={fillKnown} placeholder={source === "yandex" ? "https://music.yandex.ru/album/…/track/…" : "https://example.com/music/track.mp3"} />
              {source === "audio" && <p className="text-xs text-muted-foreground">Сервер с файлом должен разрешать доступ с этого сайта (CORS).</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-title`} className="text-sm font-medium">Название</label>
              <Input id={`${id}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder="Необязательно — можно подписать трек" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
              <div className="space-y-1.5">
                <label htmlFor={`${id}-artist`} className="text-sm font-medium">Артист</label>
                <Input id={`${id}-artist`} value={artist} onChange={(e) => setArtist(e.target.value)} maxLength={300} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor={`${id}-bpm`} className="text-sm font-medium">BPM *</label>
                <Input id={`${id}-bpm`} type="number" min={1} max={400} step="any" required value={bpm} onChange={(e) => setBpm(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${id}-tags`} className="text-sm font-medium">Теги</label>
              <Input id={`${id}-tags`} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="разминка, медленный, любимое" />
              <p className="text-xs text-muted-foreground">Через запятую, необязательно.</p>
            </div>
            {source === "audio" && (
              <div className="space-y-3 rounded-lg border p-3">
                <div className="space-y-1.5">
                  <label htmlFor={`${id}-auth`} className="text-sm font-medium">Авторизация</label>
                  <select id={`${id}-auth`} className={selectClass} value={authType} onChange={(e) => setAuthType(e.target.value as typeof authType)}>
                    <option value="none">Без авторизации</option>
                    <option value="bearer">Bearer token</option>
                    <option value="basic">Basic — логин и пароль</option>
                    <option value="api-key">API key в заголовке</option>
                  </select>
                </div>
                {authType === "api-key" && <div className="space-y-1.5">
                  <label htmlFor={`${id}-header`} className="text-xs">Название заголовка</label>
                  <Input id={`${id}-header`} value={header} onChange={(e) => setHeader(e.target.value)} required />
                </div>}
                {(authType === "bearer" || authType === "api-key") && <div className="space-y-1.5">
                  <label htmlFor={`${id}-token`} className="text-xs">{authType === "bearer" ? "Токен" : "API key"}</label>
                  <Input id={`${id}-token`} type="password" autoComplete="off" required value={token} onChange={(e) => setToken(e.target.value)} />
                </div>}
                {authType === "basic" && <>
                  <div className="space-y-1.5">
                    <label htmlFor={`${id}-username`} className="text-xs">Логин</label>
                    <Input id={`${id}-username`} autoComplete="off" required value={username} onChange={(e) => setUsername(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <label htmlFor={`${id}-password`} className="text-xs">Пароль</label>
                    <Input id={`${id}-password`} type="password" autoComplete="off" required value={password} onChange={(e) => setPassword(e.target.value)} />
                  </div>
                </>}
                {authType !== "none" && <p className="text-xs leading-relaxed text-muted-foreground">Токен и пароль хранятся только в этой вкладке и не входят в JSON. После импорта их нужно ввести заново.</p>}
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" type="button" onClick={onClose}>Отмена</Button>
            <Button type="submit">{track ? "Сохранить" : "Добавить"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function TagsDialog({ track, onClose }: { track: Track; onClose: () => void }) {
  const id = useId()
  const [tags, setTags] = useState(track.tags?.join(", ") ?? "")
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <form className="flex min-h-0 flex-col" onSubmit={(e) => { e.preventDefault(); setTrackTags(track.id, tags); onClose() }}>
          <DialogHeader>
            <DialogTitle>Теги трека</DialogTitle>
            <DialogDescription>{track.artist ? `${track.artist} — ` : ""}{track.title}</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-1.5">
            <label htmlFor={id} className="text-sm font-medium">Теги через запятую</label>
            <Input id={id} value={tags} onChange={(e) => setTags(e.target.value)} placeholder="разминка, медленный, любимое" />
            <p className="text-xs text-muted-foreground">Чтобы снять все теги, оставьте поле пустым.</p>
          </DialogBody>
          <DialogFooter><Button variant="ghost" type="button" onClick={onClose}>Отмена</Button><Button type="submit">Сохранить</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
