import { describe, expect, it } from "vitest";
import { CHIP_ROOM, READ_SCALE, chipBesidePage, fitScale, PAGE, restScale } from "./camera";

describe("reader first view (#93 item 1)", () => {
  const desktop = { w: 1440, h: 776 }; // 1440x900 window minus the top bar (56) and the bottom bar (60 + 8)
  it("keeps the read size at 1440x900: the smallest lettering stays over 14 px", () => {
    const rest = restScale(desktop, 28, "read");
    expect(rest).toBe(READ_SCALE);
    expect(22 * rest).toBeGreaterThan(14); // 15.4 px
  });
  it("fitting the page height would make the smallest lettering unreadable", () => {
    expect(22 * fitScale(PAGE, desktop, 28)).toBeLessThan(14); // 10.7 px
  });
  it("floats the Whole page chip beside the page only where the graphite beside it is wide enough", () => {
    expect(chipBesidePage(desktop, READ_SCALE)).toBe(true); // (1440 - 700) / 2 = 370
    expect(chipBesidePage({ w: 1100, h: 800 }, READ_SCALE)).toBe(true); // 200
    expect(chipBesidePage({ w: 1024, h: 700 }, READ_SCALE)).toBe(false); // 162
    expect(chipBesidePage({ w: 768, h: 900 }, READ_SCALE)).toBe(false); // 34: the chip goes to the bottom bar
    expect(((1100 - PAGE.w * READ_SCALE) / 2) >= CHIP_ROOM).toBe(true);
  });
});
