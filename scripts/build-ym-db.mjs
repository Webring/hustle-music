// Сборка базы треков для Яндекс Музыки.
//
// На входе — список треков с известным темпом: JSON-массив вида
//   [{ "name": "Артист - Название.mp3", "bpm": 118 }, …]
// (локальный файл или URL). Каждый трек ищем в Яндекс Музыке и сохраняем ID трека
// и альбома из ЯМ. Из исходного списка в базу попадает только BPM.
//
//   node scripts/build-ym-db.mjs --source=tracks-bpm.json            — собрать/досчитать базу
//   node scripts/build-ym-db.mjs --source=https://example.com/x.json — список по ссылке
//   node scripts/build-ym-db.mjs --source=… --refresh                — переспросить ЯМ заново (без кеша)
//   node scripts/build-ym-db.mjs --source=… --limit=40               — пробный прогон на первых треках
//
// Ответы поиска кешируются в scripts/.cache/ — повторный запуск быстрый и не грузит ЯМ.
// Результат: app/src/data/tracks.json, отчёт по несопоставленным — scripts/ym-unmatched.json

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const CACHE_DIR = path.join(ROOT, "scripts", ".cache")
const OUT = path.join(ROOT, "app", "src", "data", "tracks.json")
const REPORT = path.join(ROOT, "scripts", "ym-unmatched.json")

const YM_SEARCH = "https://api.music.yandex.net/search"
const DELAY_MS = 350 // пауза между запросами к ЯМ
const MIN_SCORE = 0.72 // ниже — считаем, что не нашли

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3)
const SOURCE = arg("source")
if (!SOURCE) {
  console.error("Укажите список треков с BPM: --source=<файл или URL> (формат — в начале скрипта)")
  process.exit(1)
}
const refresh = process.argv.includes("--refresh")
const limit = Number(arg("limit")) || Infinity // для пробного прогона
fs.mkdirSync(CACHE_DIR, { recursive: true })
fs.mkdirSync(path.dirname(OUT), { recursive: true })

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------- разбор имён файлов «Артист - Название.mp3» ----------
function parseName(raw) {
  const s = raw
    .replace(/\.(mp3|m4a|ogg|wav|flac|aac)$/i, "")
    .replace(/_/g, " ")
    .replace(/\(?\s*vk\.com\S*\)?/gi, "")
    .replace(/\b\d{2,3}\s*bpm\b/gi, "")
    .replace(/\bwcs\b/gi, "")
    .replace(/^\s*(?:\d{1,3}\s*[.\-)]|0\d\s)\s*/, "")
    .replace(/\s{2,}/g, " ")
    .trim()
  const m = s.match(/^(.+?)\s+[-–—]\s+(.+)$/) || s.match(/^(.+?)-(.+)$/)
  return m ? { artist: m[1].trim(), title: m[2].trim() } : { artist: "", title: s }
}

// ---------- нормализация и сравнение ----------
const FEAT = /\b(feat|ft|featuring|при уч\.?|x)\b\.?/gi
const NOISE = /\b(original|radio|extended|album|clean|explicit|version|edit|mix|remaster(ed)?|official|audio|video|lyrics?|hq|hd|ost|prod\.?\s*by)\b/gi

function norm(s) {
  return s
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/&/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
}
// «Title (feat. X) [Remix]» → «title»
const core = (title) => norm(title.replace(/[([{].*?[)\]}]/g, " ").replace(/\s(feat|ft)\.?\s.*$/i, " "))
const tokens = (s) => new Set(norm(s.replace(FEAT, " ").replace(NOISE, " ")).split(" ").filter((w) => w.length > 1))

function dice(a, b) {
  if (!a || !b) return 0
  if (a === b) return 1
  const grams = (s) => {
    const g = new Map()
    for (let i = 0; i < s.length - 1; i++) g.set(s.slice(i, i + 2), (g.get(s.slice(i, i + 2)) || 0) + 1)
    return g
  }
  const A = grams(a), B = grams(b)
  let inter = 0
  for (const [k, n] of A) inter += Math.min(n, B.get(k) || 0)
  return (2 * inter) / (a.length - 1 + b.length - 1)
}

function overlap(a, b) {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n / Math.min(a.size, b.size)
}

// Версия трека, при которой темп обычно другой: ремиксы, live, акустика, каверы
const VERSION = /\b(remix|rmx|rework|bootleg|acoustic|unplugged|live|cover|mashup|slowed|sped up|speed up|nightcore|club mix|dub mix|extended mix|vip)\b/i
// Подделки под оригинал на стороне ЯМ
const KNOCKOFF = /made famous|in the style of|originally performed|tribute|karaoke|instrumental|минус|караоке/i
const flat = (s) => core(s).replace(/ /g, "")

function matchOne(artist, title, ym) {
  const ymTitle = ym.title + (ym.version ? ` (${ym.version})` : "")
  const ymArtists = (ym.artists || []).map((a) => a.name).join(" ")
  const titleSim = Math.max(
    dice(core(title), core(ym.title)),
    dice(flat(title), flat(ym.title)),
    overlap(tokens(title), tokens(ymTitle)) * 0.95,
  )
  if (!artist) return titleSim * 0.85
  const artistSim = Math.max(overlap(tokens(artist), tokens(ymArtists)), dice(norm(artist), norm(ymArtists)))
  return titleSim * 0.6 + artistSim * 0.4
}

function score(src, ym) {
  const ymTitle = ym.title + (ym.version ? ` (${ym.version})` : "")
  // в именах файлов артист и название иногда перепутаны местами
  let s = Math.max(matchOne(src.artist, src.title, ym), src.artist ? matchOne(src.title, src.artist, ym) - 0.03 : 0)
  // ремикс ≠ оригинал: темп может отличаться, исходный BPM станет неверным
  if (VERSION.test(src.title) !== VERSION.test(ymTitle)) s -= 0.3
  if (KNOCKOFF.test(ymTitle) && !KNOCKOFF.test(src.title)) s -= 0.5
  return s
}

// ---------- запросы ----------
function cacheFile(q) {
  return path.join(CACHE_DIR, Buffer.from(q).toString("base64url").slice(0, 180) + ".json")
}

let lastRequest = 0
async function ymSearch(q) {
  const file = cacheFile(q)
  if (!refresh && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"))
  const wait = lastRequest + DELAY_MS - Date.now()
  if (wait > 0) await sleep(wait)
  lastRequest = Date.now()
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`${YM_SEARCH}?type=track&page=0&text=${encodeURIComponent(q)}`, {
        headers: { Accept: "application/json", "User-Agent": "HustlePlayer-db-builder/1.0" },
      })
      if (r.status === 429 || r.status >= 500) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      const results = (data?.result?.tracks?.results || []).map((t) => ({
        id: String(t.id),
        albumId: t.albums?.[0]?.id != null ? String(t.albums[0].id) : null,
        title: t.title,
        version: t.version || "",
        artists: (t.artists || []).map((a) => ({ name: a.name })),
        durationMs: t.durationMs ?? null,
        available: t.available !== false,
        coverUri: t.coverUri || t.albums?.[0]?.coverUri || null,
      }))
      fs.writeFileSync(file, JSON.stringify(results))
      return results
    } catch (e) {
      if (attempt >= 4) throw e
      await sleep(2000 * attempt)
    }
  }
}

function best(src, results) {
  let top = null
  for (const t of results) {
    if (!t.available || !t.albumId) continue
    const s = score(src, t)
    if (!top || s > top.score) top = { t, score: s }
  }
  return top
}

// ---------- основной цикл ----------
const readSource = async () =>
  /^https?:\/\//.test(SOURCE) ? (await fetch(SOURCE)).json() : JSON.parse(fs.readFileSync(SOURCE, "utf8"))
const srcTracks = (await readSource()).slice(0, limit)
console.log(`Исходный список: ${srcTracks.length} треков`)

const matched = new Map() // ymId → запись
const unmatched = []
let done = 0

for (const raw of srcTracks) {
  const src = { ...parseName(raw.name), bpm: raw.bpm, name: raw.name }
  const queries = [
    `${src.artist} ${core(src.title)}`.trim(),
    core(src.title) + " " + (src.artist.split(/\s(?:feat|ft|&|x|,)\s?/i)[0] || ""),
    src.name.replace(/\.(mp3|m4a)$/i, "").replace(/_/g, " "),
    `${src.artist} ${[...tokens(src.title)].join(" ")}`, // без «radio edit», «feat» и т.п.
  ]
  let found = null
  for (const q of [...new Set(queries.map((x) => x.trim()).filter(Boolean))]) {
    const b = best(src, await ymSearch(q))
    if (b && (!found || b.score > found.score)) found = b
    if (found && found.score >= 0.9) break
  }

  if (found && found.score >= MIN_SCORE) {
    const t = found.t
    const prev = matched.get(t.id)
    if (prev) {
      prev.bpmCandidates.push(src.bpm)
    } else {
      matched.set(t.id, {
        id: t.id,
        albumId: t.albumId,
        artist: t.artists.map((a) => a.name).join(", "),
        title: t.title + (t.version ? ` (${t.version})` : ""),
        bpm: src.bpm,
        bpmCandidates: [src.bpm],
        durationMs: t.durationMs,
        cover: t.coverUri,
        score: Math.round(found.score * 100) / 100,
      })
    }
  } else {
    unmatched.push({
      sourceName: src.name,
      artist: src.artist,
      title: src.title,
      bpm: src.bpm,
      bestGuess: found ? { id: found.t.id, artist: found.t.artists.map((a) => a.name).join(", "), title: found.t.title, score: Math.round(found.score * 100) / 100 } : null,
    })
  }

  done++
  if (done % 50 === 0 || done === srcTracks.length) {
    console.log(`${done}/${srcTracks.length} · найдено ${matched.size} · не найдено ${unmatched.length}`)
  }
}

// Один трек ЯМ мог совпасть с несколькими файлами списка — берём медиану их BPM
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const tracks = [...matched.values()]
  .map(({ bpmCandidates, ...t }) => ({ ...t, bpm: median(bpmCandidates) }))
  .sort((a, b) => a.bpm - b.bpm || a.artist.localeCompare(b.artist, "ru"))

fs.writeFileSync(OUT, JSON.stringify(tracks, null, 0).replace(/\},\{/g, "},\n{") + "\n")
fs.writeFileSync(REPORT, JSON.stringify(unmatched, null, 2) + "\n")
console.log(`\nГотово: ${tracks.length} треков → ${path.relative(ROOT, OUT)}`)
console.log(`Не сопоставлено: ${unmatched.length} → ${path.relative(ROOT, REPORT)}`)
