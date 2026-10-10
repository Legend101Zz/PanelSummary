import { describe, expect, it } from "vitest";
import { columns, groupPages, moveIndex, pageLabel, ticksAreButtons } from "./picker";
import { MAX_FIT_MULTIPLE, READ_SCALE, fitScale, maxZoom, overflows, PAGE, restScale, scrollStep, zoomCam } from "./camera";

describe("pageLabel", () => {
  it("names each state", () => {
    expect(pageLabel(12, "accepted")).toBe("Page 12");
    expect(pageLabel(13, "failed")).toBe("Page 13, could not be drawn");
    expect(pageLabel(14, "pending")).toBe("Page 14, not drawn yet");
  });
});

describe("groupPages", () => {
  const pages = [1, 2, 3, 4, 5].map((n) => ({ page_number: n, section_id: n <= 2 ? "a" : "b", status: n === 4 ? "failed" : "accepted" }));
  it("groups by section with titles", () => {
    const g = groupPages(pages, 5, [{ id: "a", title: "One" }, { id: "b", title: "Two" }]);
    expect(g.map((x) => [x.title, x.from, x.to])).toEqual([["One", 1, 2], ["Two", 3, 5]]);
    expect(g[1].pages[1]).toEqual({ n: 4, status: "failed" });
  });
  it("gives one untitled group without section names", () => {
    const g = groupPages(pages, 5, []);
    expect(g).toHaveLength(1);
    expect(g[0].title).toBeNull();
    expect(g[0].pages.map((p) => p.n)).toEqual([1, 2, 3, 4, 5]);
  });
  it("counts unlisted pages as pending", () => {
    const g = groupPages([], 3, []);
    expect(g[0].pages.every((p) => p.status === "pending")).toBe(true);
    expect(g[0].pages).toHaveLength(3);
  });
});

describe("grid", () => {
  it("fits 44 px cells", () => {
    expect(columns(44)).toBe(1);
    expect(columns(350)).toBe(7);
    expect(columns(10)).toBe(1);
  });
  it("moves and clamps", () => {
    expect(moveIndex(0, "ArrowLeft", 6, 60)).toBe(0);
    expect(moveIndex(10, "ArrowDown", 6, 60)).toBe(16);
    expect(moveIndex(58, "ArrowDown", 6, 60)).toBe(59);
    expect(moveIndex(5, "ArrowUp", 6, 60)).toBe(0);
    expect(moveIndex(5, "End", 6, 60)).toBe(59);
    expect(moveIndex(5, "a", 6, 60)).toBeNull();
  });
  it("ticks are buttons only at 44 px each", () => {
    expect(ticksAreButtons(700, 12)).toBe(true);
    expect(ticksAreButtons(294, 10)).toBe(false);
    expect(ticksAreButtons(1200, 60)).toBe(false);
  });
});

describe("read scale", () => {
  const d = { w: 1440, h: 784 };
  it("fills the width up to READ_SCALE on a desktop", () => {
    expect(restScale(d, 28)).toBe(READ_SCALE);
    expect(restScale(d, 28, "whole")).toBeCloseTo(fitScale(PAGE, d, 28));
    expect(22 * restScale(d, 28)).toBeGreaterThanOrEqual(14);
  });
  it("is the whole-page fit on a phone", () => {
    const p = { w: 390, h: 680 };
    expect(restScale(p, 10)).toBeCloseTo(fitScale(PAGE, p, 10));
    expect(overflows(p, restScale(p, 10))).toBe(false);
  });
  it("never drops below the whole-page fit on a tall screen", () => {
    const big = { w: 2560, h: 2400 };
    expect(restScale(big, 28)).toBeCloseTo(Math.max(fitScale(PAGE, big, 28), READ_SCALE));
  });
  it("overflows on a desktop in read view only", () => {
    expect(overflows(d, restScale(d, 28))).toBe(true);
    expect(overflows(d, restScale(d, 28, "whole"))).toBe(false);
  });
  it("limits zoom to the same absolute scale", () => {
    const base = restScale(d, 28);
    expect(base * maxZoom(d, 28, base)).toBeCloseTo(fitScale(PAGE, d, 28) * MAX_FIT_MULTIPLE);
    expect(maxZoom(d, 28, 100)).toBe(1);
  });
});

describe("scrolling", () => {
  const d = { w: 1440, h: 784 };
  const base = restScale(d, 28);
  it("rests at the top, then scrolls to the bottom and reports the edge", () => {
    const top = zoomCam(d, 28, 1, 500, 0, base);
    expect(top.cam.y).toBeCloseTo(-28 / base);
    let z = { z: 1, cx: top.cx, cy: top.cy };
    let edge = false;
    for (let i = 0; i < 10 && !edge; i++) {
      const r = scrollStep(d, 28, base, z, 1, 0.85);
      z = r.zoom;
      edge = r.atEdge;
    }
    expect(edge).toBe(true);
    const cam = zoomCam(d, 28, 1, z.cx, z.cy, base).cam;
    expect(cam.y + cam.h).toBeCloseTo(PAGE.h + 28 / base);
    expect(scrollStep(d, 28, base, z, -1, 0.85).atEdge).toBe(false);
  });
  it("centres a page that fits", () => {
    const w = zoomCam(d, 28, 1, 500, 0, restScale(d, 28, "whole"));
    expect(w.cy).toBe(750);
    expect(w.cx).toBe(500);
  });
});
