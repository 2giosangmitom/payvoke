import { describe, expect, it } from "vitest";
import { commandFields, isActiveInvocation, type SlashCommand } from "../src/lib/provider-commands";

const command: SlashCommand = {
  name: "logo",
  description: "One symbol",
  inputSchema: {
    type: "object",
    properties: {
      brief: { type: "string", maxLength: 8000 },
      style: { type: "string", maxLength: 20, enum: ["geometric", "organic"] },
    },
    required: ["brief"],
    additionalProperties: false,
  },
};
describe("provider command forms", () => {
  it("sends only declared fields and omits unused optional values", () => {
    expect(
      commandFields(command, { brief: "Moon", style: "", secret: "must not be sent" }),
    ).toEqual({ brief: "Moon" });
    expect(commandFields(command, { brief: "Moon", style: "organic" })).toEqual({
      brief: "Moon",
      style: "organic",
    });
  });
  it("bounds encoded input, not just character count", () => {
    expect(() => commandFields(command, { brief: "\u0000".repeat(8000) })).toThrow("32 KiB");
    expect(() => commandFields(command, { brief: "A moon symbol" }, 5)).toThrow(
      "5 input characters",
    );
  });
  it("polls unfinished work, never interprets uncertainty as an automatic retry", () => {
    for (const state of ["queued", "running", "completed", "failed", "uncertain"]) {
      expect(isActiveInvocation({ state })).toBe(state === "queued" || state === "running");
    }
  });
});
