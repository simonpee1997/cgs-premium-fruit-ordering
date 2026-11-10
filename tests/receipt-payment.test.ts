import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: true,
  active: true,
  role: "cashier",
  branch: "branch-one",
  saleBranch: "branch-one",
  service: vi.fn(),
  columns: "",
  filterBranch: "",
}));
vi.mock("@/lib/supabase", () => ({
  database: async () => ({
    auth: {
      getUser: async () => ({
        data: { user: state.user ? { id: "staff" } : null },
      }),
    },
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: (key: string, value: string) => {
          if (table === "sales" && key === "branch_id")
            state.filterBranch = value;
          return builder;
        },
        single: async () => ({
          data: {
            branch_id: state.branch,
            active: state.active,
            role: state.role,
          },
        }),
        maybeSingle: async () => ({
          data:
            state.saleBranch === state.filterBranch
              ? { id: "sale", branch_id: state.saleBranch }
              : null,
        }),
      };
      return builder;
    },
  }),
}));
vi.mock("@/lib/shop-server", () => ({
  shopService: () => {
    state.service();
    return {
      from: () => ({
        select: (columns: string) => {
          state.columns = columns;
          return {
            eq: (_key: string, branch: string) => ({
              maybeSingle: async () => ({
                data: {
                  bank_name: "Test bank",
                  bank_account_name: "Test store",
                  bank_account_number: branch,
                },
              }),
            }),
          };
        },
      }),
    };
  },
}));
import { GET } from "../src/app/api/receipt-payment/route";
const request = () =>
  new Request(
    "http://localhost/api/receipt-payment?sale_id=60000000-0000-4000-8000-000000000001",
  );
beforeEach(() => {
  Object.assign(state, {
    user: true,
    active: true,
    role: "cashier",
    branch: "branch-one",
    saleBranch: "branch-one",
    columns: "",
    filterBranch: "",
  });
  state.service.mockClear();
});
describe("receipt payment details access", () => {
  it("rejects anonymous and inactive staff before service access", async () => {
    state.user = false;
    expect((await GET(request())).status).toBe(401);
    state.user = true;
    state.active = false;
    expect((await GET(request())).status).toBe(403);
    expect(state.service).not.toHaveBeenCalled();
  });
  it("rejects unrelated branch sales before reading payment settings", async () => {
    state.saleBranch = "other-branch";
    expect((await GET(request())).status).toBe(404);
    expect(state.filterBranch).toBe("branch-one");
    expect(state.service).not.toHaveBeenCalled();
  });
  it("returns only the authorized sale branch's saved customer-facing fields", async () => {
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(state.columns).toBe(
      "bank_name,bank_account_name,bank_account_number",
    );
    expect(await response.json()).toEqual({
      bank_name: "Test bank",
      bank_account_name: "Test store",
      bank_account_number: "branch-one",
    });
  });
  it("rejects malformed identifiers without service access", async () => {
    expect(
      (
        await GET(
          new Request("http://localhost/api/receipt-payment?sale_id=bad"),
        )
      ).status,
    ).toBe(404);
    expect(state.service).not.toHaveBeenCalled();
  });
});
