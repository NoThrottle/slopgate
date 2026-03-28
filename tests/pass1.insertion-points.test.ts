import { describe, expect, it } from "vitest";
import { collectInsertionPoints } from "../src/pass1/js-dead-code";

describe("pass1 insertion points", () => {
  it("does not return insertion points inside object literal bodies", () => {
    const code = [
      "const config = {",
      "  alpha: 1,",
      "  beta: 2",
      "};",
      "console.log(config.alpha);",
      ""
    ].join("\n");

    const objectOpen = code.indexOf("{");
    const objectClose = code.indexOf("};");
    const points = collectInsertionPoints(code);

    expect(points.length).toBeGreaterThan(0);
    expect(points.some((point) => point > objectOpen && point < objectClose)).toBe(false);
  });

  it("does not return insertion points inside class bodies", () => {
    const code = [
      "class Example {",
      "  value = 1;",
      "  method() {",
      "    return this.value;",
      "  }",
      "}",
      "console.log(new Example().method());",
      ""
    ].join("\n");

    const classOpen = code.indexOf("{");
    const classClose = code.indexOf("}\nconsole.log");
    const points = collectInsertionPoints(code);

    expect(points.length).toBeGreaterThan(0);
    expect(points.some((point) => point > classOpen && point < classClose)).toBe(false);
  });
});
