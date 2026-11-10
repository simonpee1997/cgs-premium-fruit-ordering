import { describe, it, expect } from "vitest";
import { correctChipstiBank } from "../scripts/correct-chipsti-bank.mjs";
describe("one-time merchant bank correction", () => {
  it("writes only three bank fields after business verification and confirms raw digits", async () => {
    const calls: { url: string; method: string; body?: string }[] = [];
    const responses = [
      [
        {
          branch_id: "branch",
          bank_name: "MAYBANK",
          bank_account_name: "512222906185",
          bank_account_number: "512222906185",
        },
      ],
      [{ id: "branch", business_id: "business" }],
      [
        {
          id: "business",
          name: "CHIPSTI ENTERPRISE",
          ssm: "202603232290 (RA0139100-V)",
        },
      ],
      [{ branch_id: "branch" }],
      [
        {
          bank_name: "Maybank",
          bank_account_name: "CHIPSTI ENTERPRISE",
          bank_account_number: "512222906185",
        },
      ],
    ];
    const request = async (url: string, init: RequestInit) => {
      calls.push({
        url,
        method: String(init.method),
        body: init.body as string,
      });
      return new Response(JSON.stringify(responses.shift()), { status: 200 });
    };
    const result = await correctChipstiBank({
      request: request as typeof fetch,
      key: "test-only",
      apply: true,
    });
    expect(result.applied).toBe(true);
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(1);
    expect(JSON.parse(calls[3].body!)).toEqual({
      bank_name: "Maybank",
      bank_account_name: "CHIPSTI ENTERPRISE",
      bank_account_number: "512222906185",
    });
    expect(calls[3].url).toContain("branch_id=eq.branch");
  });
  it("rejects an unrelated business without any writes", async () => {
    let writes = 0;
    const responses = [
      [{ branch_id: "branch" }],
      [{ id: "branch", business_id: "other" }],
      [{ name: "OTHER", ssm: "OTHER" }],
    ];
    const request = async (_url: string, init: RequestInit) => {
      if (init.method !== "GET") writes++;
      return new Response(JSON.stringify(responses.shift()));
    };
    await expect(
      correctChipstiBank({
        request: request as typeof fetch,
        key: "test-only",
        apply: true,
      }),
    ).rejects.toThrow("Business verification failed");
    expect(writes).toBe(0);
  });
});
