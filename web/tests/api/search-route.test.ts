import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFluentQuery } from "./helpers";

const mocks = vi.hoisted(() => ({
  requireAuthenticatedUser: vi.fn(),
  getUserRole: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: mocks.requireAuthenticatedUser,
  getUserRole: mocks.getUserRole,
}));

vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: {
    from: mocks.from,
  },
}));

import { GET } from "@/app/api/search/route";

describe("GET /api/search", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireAuthenticatedUser.mockResolvedValue({
      user: { id: "user-1", email: "user@example.test" },
      response: null,
    });
  });

  it("returns empty groups when query is empty", async () => {
    const response = await GET(new Request("http://127.0.0.1:3000/api/search?q="));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.from).not.toHaveBeenCalled();
    expect(json.results).toEqual({
      leads: [],
      tasks: [],
      companies: [],
      contacts: [],
      products: [],
      categories: [],
      colleagues: [],
    });
  });

  it("returns grouped matches and limits tasks to owned/assigned scope for non-admin", async () => {
    mocks.getUserRole.mockResolvedValue("commercial");

    const companiesQuery = createFluentQuery({
      data: [{ id: "cmp-1", name: "Northstar Foods", sector: "Food", city: "Paris", country: "France" }],
      error: null,
    });
    const contactsQuery = createFluentQuery({
      data: [{ id: "con-1", first_name: "Amir", last_name: "Qasemi", email: "amir@example.test", job_title: "Buyer" }],
      error: null,
    });
    const productsQuery = createFluentQuery({
      data: [{ id: "prd-1", name: "Carrageenan", sku: "CRG-01", category: "Hydrocolloid", is_active: true }],
      error: null,
    });
    const categoriesQuery = createFluentQuery({
      data: [{ id: "cat-1", name: "Hydrocolloid", description: "Stabilizers" }],
      error: null,
    });
    const colleaguesQuery = createFluentQuery({
      data: [{ id: "usr-2", full_name: "Sara Demo", first_name: "Sara", last_name: "Demo", position: "Sales", department: "CRM" }],
      error: null,
    });
    const leadsQuery = createFluentQuery({
      data: [{ id: "lead-1", title: "Carrageenan lead", source: "LinkedIn", status: "open", estimated_value: 1200 }],
      error: null,
    });
    const tasksQuery = createFluentQuery({
      data: [{ id: "task-1", title: "Call Northstar Foods", status: "todo", priority: "high", due_date: null }],
      error: null,
    });

    mocks.from
      .mockReturnValueOnce(companiesQuery)
      .mockReturnValueOnce(contactsQuery)
      .mockReturnValueOnce(productsQuery)
      .mockReturnValueOnce(colleaguesQuery)
      .mockReturnValueOnce(categoriesQuery)
      .mockReturnValueOnce(leadsQuery)
      .mockReturnValueOnce(tasksQuery);

    const response = await GET(new Request("http://127.0.0.1:3000/api/search?q=northstar"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(tasksQuery.or).toHaveBeenCalledWith("owner_id.eq.user-1,assigned_to.eq.user-1");
    expect(tasksQuery.ilike).toHaveBeenCalledWith("title", "%northstar%");

    expect(json.results.companies[0].href).toBe("/companies/cmp-1");
    expect(json.results.contacts[0].href).toBe("/contacts/con-1");
    expect(json.results.products[0].href).toBe("/products/prd-1");
    expect(json.results.categories[0].href).toBe("/categories/cat-1");
    expect(json.results.colleagues[0].href).toBe("/colleagues/usr-2");
    expect(json.results.leads[0].href).toContain("/leads?q=");
    expect(json.results.tasks[0].href).toContain("/tasks?q=");
  });
});
