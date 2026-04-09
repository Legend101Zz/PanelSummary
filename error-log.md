./start.sh

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
⚡ PanelSummary — Starting Up
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

▶ Checking Redis...
✓ Redis is running
▶ Setting up Python environment...
✓ Backend dependencies ready
▶ Starting FastAPI backend...
✓ FastAPI → http://localhost:8000 (pid 47592)
▶ Starting Celery worker...
✓ Celery worker running (pid 47593)
▶ Setting up Node 24 via nvm...
✓ Node v24.13.1
▶ Setting up Reel Renderer (Remotion)...
✓ Reel renderer deps ready
✓ ffmpeg found — MP4 video export enabled
▶ Starting Next.js frontend...

▶ Waiting for services to be ready...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Backend → http://localhost:8000
✓ Frontend → http://localhost:3000
✓ API Docs → http://localhost:8000/docs
✓ Reels Hub → http://localhost:3000/video-reels
✓ MP4 Export enabled (ffmpeg + Remotion)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Logs: tail -f /tmp/backend.log
tail -f /tmp/celery.log
tail -f /tmp/frontend.log

Stop: ./stop.sh

-------------- celery@Comreton-Macbook-Air.local v5.4.0 (opalescent)
--- **\*** -----
-- **\*\*\*** ---- macOS-26.3.1-arm64-arm-64bit 2026-04-09 18:56:37

- _\*\* --- _ ---
- \*\* ---------- [config]
- \*\* ---------- .> app: panelsummary:0x10818f4d0
- \*\* ---------- .> transport: redis://localhost:6379//
- \*\* ---------- .> results: redis://localhost:6379/
- **_ --- _ --- .> concurrency: 10 (solo)
  -- **\*\***\* ---- .> task events: OFF (enable -E to monitor tasks in this worker)
  --- **\*\*\* -----
  -------------- [queues]
  .> celery exchange=celery(direct) key=celery

[tasks]
. app.celery_worker.generate_summary_task
. app.celery_worker.parse_pdf_task
. generate_reels_task
. generate_video_reel_task

[2026-04-09 18:56:37,241: INFO/MainProcess] Connected to redis://localhost:6379//
[2026-04-09 18:56:37,248: INFO/MainProcess] mingle: searching for neighbors
[2026-04-09 18:56:38,252: INFO/MainProcess] mingle: all alone
[2026-04-09 18:56:38,262: INFO/MainProcess] celery@Comreton-Macbook-Air.local ready.
[2026-04-09 18:58:53,830: INFO/MainProcess] Task generate_video_reel_task[d89866f2-58a2-429e-a9c7-5bc685b7cf27] received
[2026-04-09 18:58:58,040: ERROR/MainProcess] Video reel generation failed: book_id
Traceback (most recent call last):
File "/Users/comreton/Desktop/Book-Reel/backend/app/celery_worker.py", line 294, in \_run
memory = await get_or_create_memory(book_id, summary_id)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
File "/Users/comreton/Desktop/Book-Reel/backend/app/reel_engine/memory.py", line 19, in get_or_create_memory
memory = await BookReelMemory.find_one(BookReelMemory.book_id == book_id)
^^^^^^^^^^^^^^^^^^^^^^
File "/Users/comreton/Desktop/Book-Reel/backend/.venv/lib/python3.12/site-packages/pydantic/\_internal/\_model_construction.py", line 320, in **getattr**
raise AttributeError(item)
AttributeError: book_id
[2026-04-09 18:58:58,255: INFO/MainProcess] Task generate_video_reel_task[d89866f2-58a2-429e-a9c7-5bc685b7cf27] succeeded in 4.424867333000293s: None
