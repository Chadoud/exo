import { describe, expect, it } from "vitest";
import {
  composeStartupRoutine,
  emptyStartupSections,
  parseStartupOffer,
  parseStartupRoutine,
} from "./startupRoutine";

describe("startupRoutine", () => {
  it("round-trips calendar, mail, news, and weather with a city", () => {
    const composed = composeStartupRoutine({
      calendar: true,
      mail: true,
      news: true,
      weather: true,
      city: "Geneva",
    });
    expect(composed).toBe("calendar and email and news and weather for Geneva");
    const parsed = parseStartupRoutine(composed);
    expect(parsed.calendar).toBe(true);
    expect(parsed.mail).toBe(true);
    expect(parsed.news).toBe(true);
    expect(parsed.weather).toBe(true);
    expect(parsed.city).toBe("Geneva");
  });

  it("treats none and an empty routine as every section off", () => {
    expect(parseStartupRoutine("none")).toEqual(emptyStartupSections());
    expect(parseStartupRoutine("")).toEqual(emptyStartupSections());
  });

  it("treats spoken task and message keywords as calendar and mail", () => {
    const parsed = parseStartupRoutine("today's tasks and unread messages");
    expect(parsed.calendar).toBe(true);
    expect(parsed.mail).toBe(true);
  });

  it("writes none when every section is off", () => {
    expect(
      composeStartupRoutine({
        calendar: false,
        mail: false,
        news: false,
        weather: false,
        city: "",
      }),
    ).toBe("none");
  });

  it("maps consent to offer", () => {
    expect(parseStartupOffer("granted")).toBe("always");
    expect(parseStartupOffer("declined")).toBe("never");
    expect(parseStartupOffer("")).toBe("ask");
  });
});
