/**
 * Neutral backdrops by KIND of place (v0.3, #81): a plain room, a hall, a passage,
 * rough walls (cave, burrow, dungeon) and an open outdoor place. They carry no
 * furniture of their own (no bed, no fireplace, no chandelier, no fence), so a
 * place that no named environment fits is not drawn as a wrong one. They have
 * some structure (floor lines, wall blocks, a window) so a panel is not empty,
 * and `drawFeatures` draws the location's features (door, window, high_wall,
 * trees, ...) on them.
 */
import { toneFill } from "../style.js";
import { between, seeded } from "../prng.js";
import { xRangeAt, type V3 } from "./camera.js";
import { LAYER, add, pathEl, polyD, wAt, type Stage } from "./stage.js";
import { drawGround } from "./ground.js";
import { hills, rock, treeLine, bush } from "./nature.js";
import { panelling, roomShell, stoneBlocks, wallDecal, wallWindow, type Room } from "./interior.js";
import { sitesFor } from "./scenes-interior.js";
import type { Sites } from "./features.js";

/** A plain room: floor boards, plain walls, one window, nothing else. */
export function genericRoom(st: Stage): Sites {
  const W = 6;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 3, zf: -1.5, h: 2.8 };
  const walls = roomShell(st, room, { floor: "boards" });
  const [back, left, right] = walls;
  // a dado rail and skirting give the walls some structure without furniture
  panelling(st, back, 0.9, "none");
  panelling(st, left, 0.9, "none");
  panelling(st, right, 0.9, "none");
  wallWindow(st, back, W * 0.6, 1.1, 1.0, 1.1, {});
  return sitesFor(
    room,
    walls,
    [
      ["back", 0.5, 1.6],
      ["left", 1.4, 1.6],
      ["right", 1.4, 1.6],
    ],
    [
      { x: room.x0 + 1.1, z: room.zb - 1.2 },
      { x: room.x1 - 1.1, z: room.zb - 1.2 },
      { x: 0, z: room.zb - 0.8 },
    ],
    ["window"],
  );
}

/** A hall: wider and higher than the room, flagged floor, two tall windows, no chandelier. */
export function genericHall(st: Stage): Sites {
  const W = 11;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 7, zf: -1.5, h: 5.2 };
  const walls = roomShell(st, room, { floor: "flags" });
  const [back, left, right] = walls;
  panelling(st, back, 1.2, "none");
  panelling(st, left, 1.2, "none");
  panelling(st, right, 1.2, "none");
  for (const u of [W * 0.2, W * 0.64]) wallWindow(st, back, u, 1.7, 1.3, 2.6, { arched: true });
  return sitesFor(
    room,
    walls,
    [
      ["back", W * 0.45, 1.6],
      ["left", 2.2, 2.2],
      ["right", 2.2, 2.2],
    ],
    [
      { x: room.x0 + 1.8, z: room.zb - 2.2 },
      { x: room.x1 - 1.8, z: room.zb - 2.2 },
      { x: 0, z: room.zb - 1.2 },
    ],
    ["window"],
  );
}

/** A narrow, long passage in perspective with stone walls (corridor, tunnel, maze lane). */
export function genericPassage(st: Stage): Sites {
  const W = 3;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 14, zf: -1.5, h: 2.8 };
  const walls = roomShell(st, room, { floor: "flags", wall: toneFill("stone", st.p), sideWall: toneFill("dots", st.p), ceiling: toneFill("light", st.p) });
  const [back, left, right] = walls;
  stoneBlocks(st, back, 0.5);
  stoneBlocks(st, left, 0.5);
  stoneBlocks(st, right, 0.5);
  // joints across the floor, one every 1.5 units, so the length of the passage reads
  let d = "";
  for (let z = 1; z < room.zb; z += 1.5) {
    const a: V3 = { x: room.x0, y: 0.01, z };
    const b: V3 = { x: room.x1, y: 0.01, z };
    d += polyD(st, [a, b, { ...b, z: z + 0.02 }, { ...a, z: z + 0.02 }]);
  }
  add(st, LAYER.decal, room.zb, pathEl(d, { stroke: st.pal.ink, w: wAt(st, st.zmid) * 0.5 }));
  return sitesFor(
    room,
    walls,
    [
      ["back", 0.6, 1.4],
      ["left", 3, 1.6],
      ["right", 3, 1.6],
    ],
    [
      { x: 0, z: st.zmid + 2.2 },
      { x: 0.5, z: st.zmid + 6 },
      { x: -0.5, z: st.zmid + 9 },
    ],
    [],
  );
}

/** Rough stone walls and a dark ceiling with hanging teeth: cave, burrow, dungeon. */
export function genericRough(st: Stage): Sites {
  const W = 7;
  const room: Room = { x0: -W / 2, x1: W / 2, zb: st.zmid + 4, zf: -1.5, h: 3.6 };
  const walls = roomShell(st, room, { floor: "dirt", wall: toneFill("stone", st.p), sideWall: toneFill("dots", st.p), ceiling: toneFill("dark", st.p) });
  const [back, left, right] = walls;
  stoneBlocks(st, back, 0.7);
  stoneBlocks(st, left, 0.7);
  stoneBlocks(st, right, 0.7);
  // teeth hanging from the ceiling line of each wall
  const r = seeded(st.seed, st.env, "teeth");
  for (const wall of walls) {
    let s = "";
    let u = 0.2;
    while (u < wall.len - 0.3) {
      const w = between(r, 0.35, 0.8);
      const depth = between(r, 0.25, 0.75);
      const top = wall.top(u);
      const q = polyD(st, [wall.map(u, top), wall.map(u + w, top), wall.map(u + w * 0.5, top - depth)]);
      if (q) s += q;
      u += w + between(r, 0.1, 0.6);
    }
    wallDecal(st, pathEl(s, { fill: toneFill("dark", st.p), stroke: st.pal.ink, w: wAt(st, room.zb) * 0.8 }), wall);
  }
  // a few rocks on the floor
  if (st.lod >= 1) {
    rock(st, room.x0 + 0.9, room.zb - 1.1, 0.5);
    rock(st, room.x1 - 1.0, st.zmid + 1.6, 0.4);
    if (st.lod >= 2) rock(st, room.x1 - 2.2, room.zb - 0.8, 0.3);
  }
  return sitesFor(
    room,
    walls,
    [
      ["back", 1.2, 1.6],
      ["left", 1.6, 1.6],
      ["right", 1.6, 1.6],
    ],
    [
      { x: room.x0 + 1.5, z: st.zmid + 0.6 },
      { x: room.x1 - 1.5, z: st.zmid + 1 },
      { x: 0, z: room.zb - 1.3 },
    ],
    [],
  );
}

function span(st: Stage, z: number): [number, number] {
  const [a, b] = xRangeAt(st.cam, z);
  return [a - 2, b + 2];
}

/** An open place: sky, a low horizon, a ground line, a few stones and bushes. No fence, no building. */
export function genericOutdoor(st: Stage): Sites {
  hills(st, 0.08, st.pal.night ? toneFill("dark", st.p) : toneFill("light", st.p), 1100, 2);
  treeLine(st, 0.03, 600);
  drawGround(st, "dirt", { density: 0.9 });
  const r = seeded(st.seed, st.env, "outdoor");
  if (st.lod >= 1) {
    const [na, nb] = xRangeAt(st.cam, st.zmid + 3);
    for (let i = 0; i < 3; i += 1) rock(st, between(r, na, nb) * 0.9, st.zmid + between(r, 1, 10), between(r, 0.3, 0.7));
    for (let i = 0; i < 2; i += 1) bush(st, between(r, na, nb) * 0.8, st.zmid + between(r, 6, 14), between(r, 0.6, 1));
  }
  const backZ = st.zmid + 10;
  const [a, b] = span(st, st.zmid + 2);
  return {
    interior: false,
    wallSlots: [],
    spots: [
      { x: a * 0.6, z: st.zmid + 2 },
      { x: b * 0.6, z: st.zmid + 2.5 },
      { x: a * 0.35, z: backZ - 2 },
      { x: b * 0.35, z: backZ - 2 },
    ],
    centre: { x: 0, z: st.zmid + 6 },
    backZ,
    span: span(st, backZ),
  };
}
