# Reel Renderer — Future Work

`reel-renderer/` exists as a Remotion-based experiment for future video export.
It is not part of the current production manga flow.

Current product scope:

- PDF upload,
- parsed book reader,
- manga project generation,
- v2 manga reader,
- character library.

The local starter and README intentionally do not advertise a live reels route
because the current frontend does not ship one. We are not doing the classic
"half-deleted feature still has three buttons" routine. Very brave.

---

## Existing folder

```text
reel-renderer/
  package.json
  remotion.config.ts
  src/
  test/
```

Current scripts:

```bash
npm run preview
npm run render
npm run test-render
```

These are for direct Remotion experimentation, not the main app startup path.

---

## Future integration plan

When reels return, add them deliberately instead of wiring random subprocesses
into the manga reader.

Suggested shape:

1. Define a typed `ReelScript` domain model.
2. Add a backend endpoint/job to create a reel script from existing manga/book
   artifacts.
3. Persist reel jobs separately from manga pages.
4. Add a frontend route for reel preview/export.
5. Add a service boundary that invokes Remotion with explicit input/output
   paths.
6. Add tests for script serialization and job state.
7. Only then put reel startup/export instructions in README/start scripts.

---

## Non-goals for now

- Do not add a `/video-reels` link until the route exists.
- Do not make manga slice generation depend on Remotion.
- Do not start Remotion from `./start.sh` by default.
- Do not store generated MP4s in Mongo.
- Do not hide failed renders as successful manga jobs.

---

## Likely dependencies

- Node/React matching the Remotion package.
- `ffmpeg` for MP4 export.
- A storage location for rendered video outputs.
- A job queue path if renders are long-running.

Until this work is planned, treat `reel-renderer/` as a parked future module.
