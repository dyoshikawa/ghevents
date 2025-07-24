import { describe, expect, it } from "vitest";
import type { GitHubEventUnion } from "../types/index.js";
import { XmlGenerator } from "./xml.js";

describe("XmlGenerator", () => {
  it("should generate valid XML for empty events array", () => {
    const generator = new XmlGenerator();
    const events: GitHubEventUnion[] = [];
    const result = generator.generate(events, "asc");

    expect(result).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(result).toContain("<GitHubEvents>");
    expect(result).toContain("</GitHubEvents>");
  });
});
