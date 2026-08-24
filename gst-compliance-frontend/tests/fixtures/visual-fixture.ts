import type { Page } from "@playwright/test";

import { test as base } from "./app-fixture";

const FIXED_VISUAL_NOW = "2026-06-29T13:30:00.000Z";
type MockDateArgs =
  | []
  | [value: string | number | Date]
  | [year: number, monthIndex: number, date?: number, hours?: number, minutes?: number, seconds?: number, ms?: number];

async function freezeVisualTime(page: Page) {
  const now = new Date(FIXED_VISUAL_NOW).valueOf();

  await page.addInitScript(({ fixedNow }) => {
    const RealDate = Date;

    class MockDate extends RealDate {
      constructor(...args: MockDateArgs) {
        if (args.length === 0) {
          super(fixedNow);
          return;
        }
        super(...args);
      }

      static now() {
        return fixedNow;
      }
    }

    MockDate.UTC = RealDate.UTC;
    MockDate.parse = RealDate.parse;
    MockDate.prototype = RealDate.prototype;

    Object.defineProperty(window, "Date", {
      configurable: true,
      writable: true,
      value: MockDate,
    });
  }, { fixedNow: now });
}

export const test = base.extend({});

test.use({
  viewport: { width: 1440, height: 1200 },
});

test.beforeEach(async ({ browserName, page }) => {
  test.skip(browserName !== "chromium", "Visual baselines are maintained on Chromium to reduce cross-browser snapshot noise.");
  await freezeVisualTime(page);
});

export { expect } from "./app-fixture";
