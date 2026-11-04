import { describe, expect, it } from "vitest";
import { normalizeCode, validCode, validIban } from "./referral.server";

describe("invite codes", () => {
  it("are made from the business name, without accents or spaces", () => {
    expect(normalizeCode("Barbearia São João")).toBe("BARBEARIASAOJOAO");
    expect(normalizeCode("gfp-barber 2")).toBe("GFPBARBER2");
    expect(normalizeCode("Uma barbearia com um nome muito comprido")).toHaveLength(16);
  });
  it("need 4 to 16 letters or digits and cannot be reserved words", () => {
    expect(validCode("GFPBARBER")).toBe(true);
    expect(validCode("ABC")).toBe(false);
    expect(validCode("SYCRAS")).toBe(false);
    expect(validCode("abc d")).toBe(false);
  });
});

describe("IBAN check", () => {
  it("accepts valid IBANs with or without spaces", () => {
    expect(validIban("PT50 0002 0123 1234 5678 9015 4")).toBe("PT50000201231234567890154");
    expect(validIban("DE89370400440532013000")).toBe("DE89370400440532013000");
  });
  it("refuses a mistyped digit or rubbish", () => {
    expect(validIban("PT50 0002 0123 1234 5678 9015 5")).toBeNull();
    expect(validIban("123")).toBeNull();
    expect(validIban("")).toBeNull();
  });
});
