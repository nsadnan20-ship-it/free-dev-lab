import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseCsvText } from "@/lib/universal/parse";
import { analyzeTable } from "@/lib/universal/pipeline";

const t = parseCsvText(readFileSync("tests/fixtures/realistic-reports/28-inventory-stockout-reorder.csv", "utf8"));
const r = analyzeTable(t, "unknown-report.csv");
const st = (id: string) => r.capabilities.find((c) => c.id === id)?.status;

describe("universal pipeline", () => {
  it("evaluates every capability on any report", () => expect(r.capabilities.length).toBe(32));
  it("never claims causal analysis without a design", () => expect(st("causal")).toBe("BLOCKED"));
  it("no cross-source reconciliation from a single file", () => expect(st("reconciliation")).toBe("NOT_AVAILABLE"));
  it("every insight carries proof", () => r.insights.forEach((i) => expect(i.proof.metrics.length).toBeGreaterThan(0)));
});
