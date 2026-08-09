# Asset reuse

- Prefer an accepted asset with matching character, pose, expression, and camera.
- Asset identity comes only from broker-returned metadata.
- Preserve canonical character features across adjacent pages and slices.
- A missing pose is a blocker or upstream asset request, not permission to invent
  an asset ID.
- Background reuse is acceptable when location continuity is unchanged.
- Never encode remote URLs or filesystem paths in a composition candidate.
