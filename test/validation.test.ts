import { describe, expect, it } from "vitest";
import {
  parseLatitude,
  parseLongitude,
  validateCacheMode,
  validateDeSOId,
  validateElectionType,
  validateElectionYear,
  validateOutputFormat
} from "../src/utils/validation.js";
import { ValidationError } from "../src/errors.js";

describe("validation", () => {
  it("accepts valid coordinates", () => {
    expect(parseLatitude("59.3293")).toBe(59.3293);
    expect(parseLongitude("18.0686")).toBe(18.0686);
  });

  it("rejects invalid coordinates", () => {
    expect(() => parseLatitude("200")).toThrow(ValidationError);
    expect(() => parseLongitude("-200")).toThrow(ValidationError);
  });

  it("accepts supported output and cache modes", () => {
    expect(validateOutputFormat("json")).toBe("json");
    expect(validateCacheMode("refresh")).toBe("refresh");
  });

  it("accepts supported election values", () => {
    expect(validateElectionType("riksdag")).toBe("riksdag");
    expect(validateElectionYear("2022")).toBe(2022);
  });

  it("rejects malformed deso ids", () => {
    expect(() => validateDeSOId("bad")).toThrow(ValidationError);
  });
});
