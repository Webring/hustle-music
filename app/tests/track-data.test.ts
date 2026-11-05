import { test } from "node:test"
import assert from "node:assert/strict"
import { fadeGain, normalizeTags, parseLibrary, parseTrackUrl, parseYandexUrl, serializeLibrary, validateAuth, validateCustomTrack } from "../src/lib/track-data.ts"

const yandex = { id: "123", albumId: "45", source: "yandex", url: "https://music.yandex.ru/album/45/track/123?utm_source=share", title: "Трек", artist: "Артист", bpm: 108, tags: ["разминка"] }
const audio = { id: "audio:123-abc", source: "audio", url: "https://example.com/track.mp3", title: "Аудио", bpm: 100, auth: { type: "bearer" } }

test("ссылки ЯМ и iframe приводятся к одному ID и адресу", () => {
  const expected = { id: "123", albumId: "45", url: "https://music.yandex.ru/album/45/track/123" }
  for (const url of [yandex.url, "https://music.yandex.com/album/45/track/123", "https://music.yandex.ru/iframe/track/123/45", "https://music.yandex.ru/iframe/#track/123/45"]) assert.deepEqual(parseYandexUrl(url), expected)
  for (const url of ["https://music.yandex.ru.evil.com/album/45/track/123", "https://music.yandex.ru/album/45", "https://music.yandex.ru/track/123"]) assert.throws(() => parseYandexUrl(url))
})

test("BPM обязателен, должен быть числом в допустимом диапазоне", () => {
  for (const bpm of [undefined, null, "100", 0, -1, 401, NaN, Infinity]) assert.throws(() => validateCustomTrack({ ...yandex, bpm }))
  assert.equal(validateCustomTrack({ ...audio, bpm: 104.5 }).bpm, 104.5)
})

test("теги нормализуются без повторов, сохраняя первый регистр", () => {
  assert.deepEqual(normalizeTags(" Разминка,разминка;  медленный   трек\nлюбимое, "), ["Разминка", "медленный трек", "любимое"])
  assert.throws(() => validateCustomTrack({ ...yandex, tags: [1] }))
})

test("прямые ссылки запрещают схемы и встроенный логин", () => {
  assert.equal(parseTrackUrl("https://example.com/song.mp3?key=abc").protocol, "https:")
  for (const url of ["javascript:alert(1)", "file:///a.mp3", "data:audio/mp3,a", "https://user:pass@example.com/a.mp3", "/a.mp3"]) assert.throws(() => parseTrackUrl(url))
})

test("компактный JSON сохраняет треки и теги, исключая секреты", () => {
  const library = parseLibrary(JSON.stringify({ version: 1, tracks: [yandex, { ...audio, token: "do-not-export", auth: { type: "bearer", token: "do-not-export" } }], tags: { "456": ["Техника"] }, credentials: { password: "do-not-export" } }))
  const exported = serializeLibrary(library)
  assert.equal(exported, JSON.stringify(JSON.parse(exported)))
  assert.ok(!exported.includes("do-not-export"))
  assert.deepEqual(parseLibrary(exported), library)
  assert.deepEqual(library.tags["456"], ["Техника"])
  assert.equal(library.tracks[0].url, "https://music.yandex.ru/album/45/track/123")
})

test("невалидный импорт и дубли ID отклоняются целиком", () => {
  for (const json of ["not json", "[]", "null", JSON.stringify({ version: 2, tracks: [], tags: {} }), JSON.stringify({ version: 1, tracks: [yandex, yandex], tags: {} }), JSON.stringify({ version: 1, tracks: [yandex, { ...audio, bpm: 0 }], tags: {} }), JSON.stringify({ version: 1, tracks: [], tags: { "123": "wrong" } })]) assert.throws(() => parseLibrary(json))
})

test("API key требует корректный заголовок", () => {
  assert.deepEqual(validateAuth({ type: "api-key", header: "X-API-Key" }), { type: "api-key", header: "X-API-Key" })
  for (const header of ["", "bad header", "X-Key\r\n", "Authorization", "Cookie", "Sec-Test"]) assert.throws(() => validateAuth({ type: "api-key", header }))
})

test("затухание покрывает конец, короткие треки и неизвестную длительность", () => {
  assert.equal(fadeGain(92, 100, 5), 1)
  assert.equal(fadeGain(97.5, 100, 5), 0.5)
  assert.equal(fadeGain(100, 100, 5), 0)
  assert.equal(fadeGain(101, 100, 5), 0)
  assert.equal(fadeGain(0, 2, 5), 1)
  assert.equal(fadeGain(1, 2, 5), 0.5)
  assert.equal(fadeGain(1, NaN, 5), 1)
  assert.equal(fadeGain(100, 100, 0), 1)
  assert.equal(fadeGain(88, Math.min(180, 90), 5), 0.4)
})
