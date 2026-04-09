-------------- celery@Comreton-Macbook-Air.local v5.4.0 (opalescent)
--- **\*** -----
-- **\*\*\*** ---- macOS-26.3.1-arm64-arm-64bit 2026-04-09 19:10:53

- _\*\* --- _ ---
- \*\* ---------- [config]
- \*\* ---------- .> app: panelsummary:0x10c2db230
- \*\* ---------- .> transport: redis://localhost:6379//
- \*\* ---------- .> results: redis://localhost:6379/
- **_ --- _ --- .> concurrency: 10 (solo)
  -- **\***** ---- .> task events: OFF (enable -E to monitor tasks in this worker)
  --- **\*** -----
  -------------- [queues]
  .> celery exchange=celery(direct) key=celery

[tasks]
. app.celery_worker.generate_summary_task
. app.celery_worker.parse_pdf_task
. generate_reels_task
. generate_video_reel_task

[2026-04-09 19:10:53,489: INFO/MainProcess] Connected to redis://localhost:6379//
[2026-04-09 19:10:53,491: INFO/MainProcess] mingle: searching for neighbors
[2026-04-09 19:10:54,497: INFO/MainProcess] mingle: all alone
[2026-04-09 19:10:54,502: INFO/MainProcess] celery@Comreton-Macbook-Air.local ready.
[2026-04-09 19:12:24,118: INFO/MainProcess] Task generate_video_reel_task[9ae8c213-6216-4a9f-9050-e297ae4efcaf] received
[2026-04-09 19:12:27,574: INFO/MainProcess] Created reel memory for book 69d78e68a9edd9f3592ceb04
[2026-04-09 19:12:27,784: INFO/MainProcess] Selected 8/191 content items (used: 0)
[2026-04-09 19:12:28,127: INFO/MainProcess] LLM client initialized: openrouter/google/gemini-2.0-flash-001
[2026-04-09 19:12:28,128: INFO/MainProcess] Generating Video DSL for ' ' (8 items)
[2026-04-09 19:12:28,129: INFO/MainProcess] [LLM] → google/gemini-2.0-flash-001 | ~2449 input tokens
[2026-04-09 19:12:31,327: INFO/MainProcess] HTTP Request: POST https://openrouter.ai/api/v1/chat/completions "HTTP/1.1 200 OK"
[2026-04-09 19:12:45,065: INFO/MainProcess] [LLM] ← google/gemini-2.0-flash-001 | 2989 out tokens | 16.9s
────────────────────────────────────────────────────────────

```json
{
  "version": "1.0",
  "canvas": {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "background": "#F2E8D5"
  },
  "fonts": ["Dela Gothic One", "Outfit"],
  "palette": {
    "bg": "#F2E8D5",
    "fg": "#1A1825",
    "accent": "#E8191A",
    "accent2": "#F5A623",
    "muted": "#5E5C78"
  },
  "scenes": [
    {
      "id": "scene-intro",
      "duration_ms": 4000,
      "transition": {
        "type": "fade",
        "duration_ms": 500
      },
      "camera": {
        "zoom": [1.0, 1.05],
        "pan": { "x": [0, 0], "y": [0, -10] },
        "easing": "ease-in-out"
      },
      "layers": [
        {
          "id": "bg-intro",
          "type": "background",
          "gradient": ["#F2E8D5", "#E0D8C5"],
          "gradientAngle": 45
        },
        {
          "id": "text-intro",
          "type": "text",
          "content": "FEELING STUCK?",
          "fontSize": "clamp(4rem, 10vw, 8rem)",
          "fontFamily": "Dela Gothic One",
          "color": "#1A1825",
          "textAlign": "center",
          "x": "50%",
          "y": "50%",
          "anchorX": "center",
          "anchorY": "center"
        }
      ],
      "timeline": [
        {
          "at": 500,
          "target": "text-intro",
          "animate": {
            "opacity": [0, 1],
            "scale": [0.5, 1]
          },
          "duration": 1000,
          "easing": "spring"
        }
      ]
    },
    {
      "id": "scene-cheese",
      "duration_ms": 5000,
      "transition": {
        "type": "wipe",
        "duration_ms": 400,
        "direction": "right"
      },
      "camera": {
        "zoom": [1.0, 1.1],
        "pan": { "x": [0, -20], "y": [0, 0] },
        "easing": "ease-in-out"
      },
      "layers": [
        {
          "id": "bg-cheese",
          "type": "background",
          "color": "#F2E8D5"
        },
        {
          "id": "text-cheese",
          "type": "text",
          "content": "The Maze...",
          "fontSize": "clamp(3rem, 8vw…
────────────────────────────────────────────────────────────
[2026-04-09 19:12:45,067: INFO/MainProcess] Video DSL generated: 5 scenes, 25000ms total
[2026-04-09 19:12:46,637: INFO/MainProcess] Rendering reel: npx remotion render src/index.ts ReelComposition /Users/comreton/Desktop/Book-Reel/storage/reels/69d78e68a9edd9f3592ceb04/reel-69d7acd5375990b438f3ac4f.mp4...
[2026-04-09 19:12:46,637: INFO/MainProcess] Output: /Users/comreton/Desktop/Book-Reel/storage/reels/69d78e68a9edd9f3592ceb04/reel-69d7acd5375990b438f3ac4f.mp4 (750 frames, 25000ms)
[2026-04-09 19:13:16,349: ERROR/MainProcess] Remotion render failed: Error: Module build failed (from ./node_modules/@remotion/bundler/dist/esbuild-loader/index.js):
Error: Transform failed with 1 error:
/Users/comreton/Desktop/Book-Reel/reel-renderer/src/index.ts:15:5: ERROR: Unexpected ">"
    at failureErrorWithLog (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/esbuild/lib/main.js:1477:15)
    at /Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/esbuild/lib/main.js:756:50
    at responseCallbacks.<computed> (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/esbuild/lib/main.js:623:9)
    at handleIncomingPacket (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/esbuild/lib/main.js:678:12)
    at Socket.readFromStdout (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/esbuild/lib/main.js:601:7)
    at Socket.emit (node:events:519:28)
    at addChunk (node:internal/streams/readable:559:12)
    at readableAddChunkPushByteMode (node:internal/streams/readable:510:3)
    at Readable.push (node:internal/streams/readable:390:5)
    at Pipe.onStreamRead (node:internal/stream_base_commons:191:23)
undefined
    at runWebpack (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/@remotion/bundler/dist/bundle.js:226:23)
    at async Object.internalBundle (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/@remotion/bundler/dist/bundle.js:230:13)
    at async bundleOnCli (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/@remotion/cli/dist/setup-cache.js:150:21)
    at async bundleOnCliOrTakeServeUrl (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/@remotion/cli/dist/setup-cache.js:35:21)
    at async renderVideoFlow (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/@remotion/cli/dist/render-flows/render.js:167:53)
    at async render (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/@remotion/cli/dist/render.js:168:5)
    at async cli (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/@remotion/cli/dist/index.js:98:13)

[2026-04-09 19:13:16,349: ERROR/MainProcess] Render failed: Render failed: Error: Module build failed (from ./node_modules/@remotion/bundler/dist/esbuild-loader/index.js):
Error: Transform failed with 1 error:
/Users/comreton/Desktop/Book-Reel/reel-renderer/src/index.ts:15:5: ERROR: Unexpected ">"
    at failureErrorWithLog (/Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/esbuild/lib/main.js:1477:15)
    at /Users/comreton/Desktop/Book-Reel/reel-renderer/node_modules/esbuild/lib/main.js:756:50
    at responseCallbacks.<computed> (/Users/comreton/Desktop/Bo
[2026-04-09 19:13:16,659: INFO/MainProcess] Task generate_video_reel_task[9ae8c213-6216-4a9f-9050-e297ae4efcaf] succeeded in 52.541588082996896s: None
```
