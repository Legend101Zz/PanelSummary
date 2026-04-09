-------------- celery@Comreton-Macbook-Air.local v5.4.0 (opalescent)
--- **\*** -----
-- **\*\*\*** ---- macOS-26.3.1-arm64-arm-64bit 2026-04-09 19:06:19

- _\*\* --- _ ---
- \*\* ---------- [config]
- \*\* ---------- .> app: panelsummary:0x108623770
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

[2026-04-09 19:06:19,065: INFO/MainProcess] Connected to redis://localhost:6379//
[2026-04-09 19:06:19,067: INFO/MainProcess] mingle: searching for neighbors
[2026-04-09 19:06:20,071: INFO/MainProcess] mingle: all alone
[2026-04-09 19:06:20,078: INFO/MainProcess] celery@Comreton-Macbook-Air.local ready.
[2026-04-09 19:07:08,059: INFO/MainProcess] Task generate_video_reel_task[04619a1a-40cd-4551-b24b-99faafd730d9] received
[2026-04-09 19:07:12,357: ERROR/MainProcess] Video reel generation failed:
Traceback (most recent call last):
File "/Users/comreton/Desktop/Book-Reel/backend/app/celery_worker.py", line 294, in \_run
memory = await get_or_create_memory(book_id, summary_id)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
File "/Users/comreton/Desktop/Book-Reel/backend/app/reel_engine/memory.py", line 19, in get_or_create_memory
memory = await BookReelMemory.find_one({"book_id": book_id})
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
File "/Users/comreton/Desktop/Book-Reel/backend/.venv/lib/python3.12/site-packages/beanie/odm/interfaces/find.py", line 112, in find_one
args = cls.\_add_class_id_filter(args, with_children)
^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
File "/Users/comreton/Desktop/Book-Reel/backend/.venv/lib/python3.12/site-packages/beanie/odm/interfaces/find.py", line 438, in \_add_class_id_filter
if any(
^^^^
File "/Users/comreton/Desktop/Book-Reel/backend/.venv/lib/python3.12/site-packages/beanie/odm/interfaces/find.py", line 442, in <genexpr>
if isinstance(a, Iterable) and cls.get_settings().class_id in a
^^^^^^^^^^^^^^^^^^
File "/Users/comreton/Desktop/Book-Reel/backend/.venv/lib/python3.12/site-packages/beanie/odm/documents.py", line 1109, in get_settings
raise CollectionWasNotInitialized
beanie.exceptions.CollectionWasNotInitialized
[2026-04-09 19:07:12,523: INFO/MainProcess] Task generate_video_reel_task[04619a1a-40cd-4551-b24b-99faafd730d9] succeeded in 4.463279833988054s: None
