import { describe, expect, it } from "vitest";
import { waNumber } from "./whatsapp.server";

describe("waNumber (where WhatsApp messages go)", () => {
  it("adds Portugal's code to a 9-digit mobile or landline", () => {
    expect(waNumber("912 345 678")).toBe("351912345678");
    expect(waNumber("212345678")).toBe("351212345678");
  });
  it("keeps numbers that already have a country code", () => {
    expect(waNumber("+351 912 345 678")).toBe("351912345678");
    expect(waNumber("00351912345678")).toBe("351912345678");
    expect(waNumber("+44 7911 123456")).toBe("447911123456");
    expect(waNumber("+55 11 91234-5678")).toBe("5511912345678");
  });
  it("refuses what cannot be a phone number", () => {
    expect(waNumber(null)).toBeNull();
    expect(waNumber("")).toBeNull();
    expect(waNumber("123")).toBeNull();
    expect(waNumber("+1234567890123456")).toBeNull();
  });
});
