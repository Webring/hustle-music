import { test } from "node:test"
import assert from "node:assert/strict"
import { audioHeaders, fetchAudio } from "../src/lib/audio-source.ts"

test("Bearer, Basic и API key формируют нужный заголовок", () => {
  assert.equal(audioHeaders({ type: "bearer" }, { token: " test-token " }).get("Authorization"), "Bearer test-token")
  assert.equal(audioHeaders({ type: "api-key", header: "X-API-Key" }, { token: "test-key" }).get("X-API-Key"), "test-key")
  const basic = audioHeaders({ type: "basic" }, { username: "имя", password: "пароль" }).get("Authorization")!
  assert.equal(new TextDecoder().decode(Uint8Array.from(atob(basic.slice(6)), (c) => c.charCodeAt(0))), "имя:пароль")
  assert.equal([...audioHeaders({ type: "none" }, { token: "unused" })].length, 0)
})

test("пустые данные авторизации и переносы строк не уходят на сервер", () => {
  assert.throws(() => audioHeaders({ type: "bearer" }, {}), /токен/)
  assert.throws(() => audioHeaders({ type: "bearer" }, { token: "a\r\nb" }), /одной строкой/)
  assert.throws(() => audioHeaders({ type: "basic" }, { username: "a:b", password: "p" }), /двоеточие/)
})

test("аудиозапрос отправляет заголовок и возвращает файл", async (t) => {
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    assert.equal((init.headers as Headers).get("Authorization"), "Bearer test-token")
    assert.equal(init.credentials, "omit")
    assert.ok(init.signal instanceof AbortSignal)
    return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "audio/mpeg" } })
  })
  const blob = await fetchAudio("https://example.com/a.mp3", { type: "bearer" }, { token: "test-token" }, new AbortController().signal)
  assert.equal(blob.size, 3)
})

test("ошибки доступа, HTML вместо аудио и пустой файл объясняются пользователю", async (t) => {
  const mocked = t.mock.method(globalThis, "fetch")
  for (const [response, pattern] of [
    [new Response(null, { status: 401 }), /авторизацию/],
    [new Response(null, { status: 404 }), /404/],
    [new Response("<html>", { headers: { "content-type": "text/html" } }), /страница/],
    [new Response(new Uint8Array()), /пустой/],
  ] as const) {
    mocked.mock.mockImplementation(async () => response)
    await assert.rejects(fetchAudio("https://example.com/a", undefined, {}, new AbortController().signal), pattern)
  }
  mocked.mock.mockImplementation(async () => { throw new TypeError("Failed to fetch") })
  await assert.rejects(fetchAudio("https://example.com/a", undefined, {}, new AbortController().signal), /CORS/)
})
