import { expect, test } from "@playwright/test";
import {
  loginAsE2EAdmin,
  pickSelectOptionByText,
  sectionByHeading,
  toDateTimeLocalInputValue,
  uniqueLabel,
} from "./helpers";

test.describe("CRM end-to-end", () => {
  test.skip(({ isMobile }) => isMobile, "Desktop-only suite");

  test("@smoke login uses compact reset flow", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "CRM Platform" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reset" })).toHaveCount(0);

    await page.getByRole("button", { name: "Forgot password?" }).click();
    await expect(page.getByRole("button", { name: "Send reset link" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Back to login" })).toBeVisible();

    await page.getByRole("button", { name: "Back to login" }).click();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
  });

  test("@smoke covers dashboard, companies, products, leads, tasks, and emails", async ({ page }) => {
    const companyName = uniqueLabel("Company");
    const productName = uniqueLabel("Product");
    const agentFirstName = `Agent${Date.now().toString().slice(-5)}`;
    const agentLastName = "Buyer";
    const agentEmail = `agent.${Date.now()}@example.test`;
    const leadTitle = uniqueLabel("Lead");
    const taskTitle = uniqueLabel("Task");
    const sku = `SKU-${Date.now()}`;

    await loginAsE2EAdmin(page);

    await page.getByRole("button", { name: "7 days" }).click();
    await expect(page.getByText("Pipeline by stage (count + value)")).toBeVisible();
    await page.getByRole("button", { name: "30 days" }).click();
    await expect(page.getByText("Sales leaderboard (won leads value)")).toBeVisible();
    const csvDownloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export CSV" }).click();
    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toContain(".csv");

    await page.getByRole("link", { name: "Companies" }).click();
    await expect(page).toHaveURL(/\/companies$/);
    await page.getByRole("tab", { name: "New company" }).click();
    const companyForm = sectionByHeading(page, "New company");
    await companyForm.getByLabel("Name").fill(companyName);
    await companyForm.getByLabel("Company role").selectOption("both");
    await companyForm.getByLabel("Sector").fill("Food Ingredients");
    await companyForm.getByLabel("City").fill("Paris");
    await companyForm.getByLabel("Country").fill("France");
    await companyForm.getByRole("button", { name: "Create company" }).click();

    const companyList = sectionByHeading(page, "Company list");
    const companyRow = companyList.locator("tbody tr", { hasText: companyName }).first();
    await expect(companyRow).toBeVisible();
    await expect(companyRow).toContainText("Supplier + Customer");
    const companyLookup = await page.request.get(
      `/api/companies?q=${encodeURIComponent(companyName)}`,
    );
    expect(companyLookup.ok()).toBeTruthy();
    const companyLookupJson = (await companyLookup.json()) as {
      companies?: Array<{ id: string; name: string }>;
    };
    const companyId = companyLookupJson.companies?.find((item) => item.name === companyName)?.id;
    expect(companyId).toBeTruthy();

    const createAgentRes = await page.request.post("/api/contacts", {
      data: {
        first_name: agentFirstName,
        last_name: agentLastName,
        email: agentEmail,
        company_id: companyId,
        is_company_agent: true,
        agent_rank: 1,
      },
    });
    expect(createAgentRes.ok()).toBeTruthy();

    await page.getByRole("link", { name: "Products", exact: true }).click();
    await expect(page).toHaveURL(/\/products$/);
    await page.getByRole("tab", { name: "New product" }).click();
    const productForm = sectionByHeading(page, "New product");
    await productForm.getByLabel("Name").fill(productName);
    await productForm.getByLabel("SKU").fill(sku);
    await pickSelectOptionByText(productForm.getByLabel("Category"), "Cocoa");
    await productForm.getByLabel("Purchase price").fill("1200");
    await productForm.getByLabel("Sale price").fill("1450");
    await productForm.getByRole("button", { name: "Create product" }).click();
    await expect(page.getByText("Product created")).toBeVisible();
    await expect(
      sectionByHeading(page, "Product list").locator("tbody tr", { hasText: productName }).first(),
    ).toBeVisible();

    await page.getByRole("tab", { name: "Product Relations" }).click();
    const relationSection = sectionByHeading(page, "Product-company relations");
    const relationProductSelect = relationSection.getByLabel("Product");
    const relationCompanySelect = relationSection.getByLabel("Company");
    const relationCategorySelect = relationSection.getByLabel("Category");
    const saveRelationButton = relationSection.getByRole("button", { name: "Save relation" });

    await pickSelectOptionByText(relationProductSelect, productName);
    await pickSelectOptionByText(relationCompanySelect, companyName);
    await relationCategorySelect.selectOption("traded");
    await relationSection.getByLabel("Model / Grade").fill("Food Grade A");
    await saveRelationButton.click();
    await expect(page.getByText("Product relation saved")).toBeVisible();

    await pickSelectOptionByText(relationProductSelect, productName);
    await pickSelectOptionByText(relationCompanySelect, companyName);
    await relationCategorySelect.selectOption("potential");
    await relationSection.getByLabel("Model / Grade").fill("Food Grade B");
    await saveRelationButton.click();
    await expect(page.getByText("Product relation saved")).toBeVisible();

    await page.getByRole("tab", { name: "Customer Finder" }).click();
    const finderSection = sectionByHeading(page, "Customer finder by product");
    await pickSelectOptionByText(finderSection.getByLabel("Product for customer search"), productName);
    await finderSection.getByLabel("Relation focus").selectOption("traded");
    const suggestionRow = finderSection.locator("tbody tr", { hasText: companyName }).first();
    await expect(suggestionRow).toBeVisible();
    await expect(suggestionRow).toContainText("Food Grade A");
    await expect(suggestionRow).toContainText(agentFirstName);
    await suggestionRow.getByRole("button", { name: "Create lead" }).click();
    await page.waitForTimeout(400);

    await page.getByRole("tab", { name: "Product list" }).click();
    const productList = sectionByHeading(page, "Product list");
    const productRow = productList.locator("tbody tr", { hasText: productName }).first();
    await expect(productRow).toBeVisible();
    await productRow.getByRole("link", { name: "View details" }).click();
    await expect(page).toHaveURL(/\/products\/.+/);
    const productProfile = sectionByHeading(page, "Product-company relations");
    await expect(
      productProfile.locator("tbody tr", { hasText: companyName }).first(),
    ).toBeVisible();
    await expect(productProfile.getByText("Food Grade A")).toBeVisible();
    await expect(productProfile.getByText("Food Grade B")).toBeVisible();
    await page.getByRole("link", { name: "Back to products" }).click();

    await page.getByRole("link", { name: "Companies" }).click();
    const companyRowAfterLinks = sectionByHeading(page, "Company list")
      .locator("tbody tr", { hasText: companyName })
      .first();
    await expect(companyRowAfterLinks).toContainText(`Agent 1: ${agentFirstName} ${agentLastName}`);
    await expect(companyRowAfterLinks).toContainText("Traded: 1");
    await expect(companyRowAfterLinks).toContainText("Potential: 1");

    await page.getByRole("link", { name: "Leads" }).click();
    await expect(page).toHaveURL(/\/leads$/);
    await page.getByRole("tab", { name: "New lead" }).click();
    const leadForm = sectionByHeading(page, "New lead");
    await leadForm.getByLabel("Title").fill(leadTitle);
    await leadForm.getByLabel("Source").selectOption("LinkedIn");
    await leadForm.getByLabel("Estimated value").fill("5200");
    const companyInput = leadForm.getByLabel("Company");
    await companyInput.fill("Demo");
    await expect(page.locator("#lead-company-suggestions button").first()).toBeVisible();
    await companyInput.fill(companyName);

    const contactInput = leadForm.getByLabel("Contact");
    await contactInput.fill(agentFirstName.slice(0, 4));
    await expect(page.locator("#lead-contact-suggestions button").first()).toBeVisible();
    await contactInput.fill(`${agentFirstName} ${agentLastName} - ${agentEmail}`);
    await leadForm.getByRole("button", { name: "Create lead" }).click();

    await expect(
      sectionByHeading(page, "Pipeline board").locator(".lead-card", { hasText: leadTitle }).first(),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Lead list" }).click();
    const leadList = sectionByHeading(page, "Lead list");
    const leadRow = leadList.locator("tbody tr", { hasText: leadTitle }).first();
    await expect(leadRow).toBeVisible();
    const leadStageCell = () =>
      leadList.locator("tbody tr", { hasText: leadTitle }).first().locator("td").nth(1);
    const stageBeforeMove = (await leadStageCell().innerText()).trim();

    await page.getByRole("tab", { name: "Pipeline board" }).click();
    const leadCard = sectionByHeading(page, "Pipeline board")
      .locator(".lead-card", { hasText: leadTitle })
      .first();
    await expect(leadCard).toBeVisible();
    await leadCard.getByRole("button", { name: "Next" }).click();
    await page.getByRole("tab", { name: "Lead list" }).click();

    await expect
      .poll(
        async () =>
          (
            await sectionByHeading(page, "Lead list")
              .locator("tbody tr", { hasText: leadTitle })
              .first()
              .locator("td")
              .nth(1)
              .innerText()
          ).trim(),
        {
        message: "Lead stage should change after quick move",
        },
      )
      .not.toBe(stageBeforeMove);

    const leadsSnapshot = await page.request.get("/api/leads");
    expect(leadsSnapshot.ok()).toBeTruthy();
    const leadsSnapshotJson = (await leadsSnapshot.json()) as {
      leads?: Array<{ id: string; title: string }>;
      stages?: Array<{ id: string; name: string }>;
    };
    const createdLeadId = leadsSnapshotJson.leads?.find((lead) => lead.title === leadTitle)?.id;
    const negotiationStageId = leadsSnapshotJson.stages?.find((stage) =>
      stage.name.toLowerCase().includes("negotiation"),
    )?.id;
    if (!createdLeadId || !negotiationStageId) {
      throw new Error("Could not resolve lead/stage ids for negotiation check");
    }

    const moveToNegotiation = await page.request.post(
      `/api/leads/${createdLeadId}/stage`,
      {
        data: {
          stage_id: negotiationStageId,
          comment: "E2E to negotiation",
        },
      },
    );
    expect(moveToNegotiation.ok()).toBeTruthy();

    await page.reload();
    await page.getByRole("tab", { name: "Pipeline board" }).click();
    const negotiationLeadCard = sectionByHeading(page, "Pipeline board")
      .locator(".lead-card", { hasText: leadTitle })
      .first();
    await expect(negotiationLeadCard).toBeVisible();
    await expect(
      negotiationLeadCard.getByRole("button", { name: /Mark Won|Marquer gagn/i }),
    ).toBeVisible();
    await expect(
      negotiationLeadCard.getByRole("button", { name: /Mark Lost|Marquer perd/i }),
    ).toBeVisible();
    await expect(negotiationLeadCard.getByRole("button", { name: "Prev" })).toBeVisible();
    await expect(negotiationLeadCard.getByRole("button", { name: "Create task" })).toBeVisible();
    await expect(negotiationLeadCard.getByRole("button", { name: "Edit" })).toBeVisible();

    await page.getByRole("link", { name: "Tasks" }).click();
    await expect(page).toHaveURL(/\/tasks$/);
    await page.getByRole("tab", { name: "New task" }).click();
    const taskForm = sectionByHeading(page, "New task");
    await taskForm.getByLabel("Title").fill(taskTitle);
    await taskForm
      .getByLabel("Due date")
      .fill(toDateTimeLocalInputValue(new Date(Date.now() + 48 * 60 * 60 * 1000)));
    await taskForm.getByLabel("Priority").selectOption("high");
    await taskForm.getByLabel("Status").selectOption("todo");
    await taskForm.getByLabel("Description").fill("E2E follow-up task");
    await taskForm.getByRole("button", { name: "Create task" }).click();

    const taskList = sectionByHeading(page, "Task list");
    const taskRow = taskList.locator("tbody tr", { hasText: taskTitle }).first();
    await expect(taskRow).toBeVisible();
    const taskStatusSelect = taskRow.locator("select").first();
    await taskStatusSelect.selectOption("done");
    await expect(taskStatusSelect).toHaveValue("done");

    await page.getByRole("link", { name: "Emails" }).click();
    await expect(page).toHaveURL(/\/emails$/);
    await sectionByHeading(page, "Run follow-up 72h").getByRole("button", { name: "Dry run follow-up" }).click();
    await expect(page.getByText(/Follow-up dry-run:/)).toBeVisible();
    await expect(sectionByHeading(page, "Email logs")).toBeVisible();
  });

  test("language switch persists and help center is reachable", async ({ page }) => {
    await loginAsE2EAdmin(page);

    await page.getByRole("button", { name: "FR" }).first().click();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.getAttribute("dir")))
      .toBe("ltr");

    const helpLink = page.locator('a[href="/help"]').first();
    await expect(helpLink).toBeVisible();
    await helpLink.click();
    await expect(page).toHaveURL(/\/help$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    await page.reload();
    await expect
      .poll(async () => page.evaluate(() => document.documentElement.getAttribute("data-locale")))
      .toBe("fr");
  });

  test("saved filters persist on leads and tasks", async ({ page }) => {
    await loginAsE2EAdmin(page);

    await page.getByRole("link", { name: "Leads" }).click();
    const leadFilters = sectionByHeading(page, "Lead filters");
    await leadFilters.getByLabel("Search").fill("E2E");
    await leadFilters.getByRole("button", { name: "Save filters" }).click();
    await page.reload();
    await expect(sectionByHeading(page, "Lead filters").getByLabel("Search")).toHaveValue("E2E");

    await page.getByRole("link", { name: "Tasks" }).click();
    const taskFilters = sectionByHeading(page, "Task filters");
    await taskFilters.getByLabel("Search").fill("E2E");
    await taskFilters.getByRole("button", { name: "Save filters" }).click();
    await page.reload();
    await expect(sectionByHeading(page, "Task filters").getByLabel("Search")).toHaveValue("E2E");
  });

  test("company/contact filters use exact role logic and prefix suggestions", async ({ page }) => {
    await loginAsE2EAdmin(page);

    const stamp = Date.now();
    const prefix = `Filter${stamp}`;
    const supplierCompany = `${prefix}-Supplier`;
    const customerCompany = `${prefix}-Customer`;
    const bothCompany = `${prefix}-Both`;
    const extraCompanies = [`${prefix}-A1`, `${prefix}-A2`, `${prefix}-A3`];

    async function createCompany(name: string, companyRole: "supplier" | "customer" | "both") {
      const response = await page.request.post("/api/companies", {
        data: {
          name,
          company_role: companyRole,
          sector: "Food Ingredients",
          city: "Paris",
          country: "France",
        },
      });
      expect(response.ok()).toBeTruthy();
      const json = (await response.json()) as { company?: { id: string } };
      expect(json.company?.id).toBeTruthy();
      return json.company!.id;
    }

    const supplierCompanyId = await createCompany(supplierCompany, "supplier");
    const customerCompanyId = await createCompany(customerCompany, "customer");
    await createCompany(bothCompany, "both");
    for (const name of extraCompanies) {
      await createCompany(name, "supplier");
    }

    const supplierContactFullName = `Sup${stamp} Buyer`;
    const customerContactFullName = `Cus${stamp} Buyer`;

    const createSupplierContact = await page.request.post("/api/contacts", {
      data: {
        first_name: `Sup${stamp}`,
        last_name: "Buyer",
        company_id: supplierCompanyId,
        email: `sup.${stamp}@example.test`,
      },
    });
    expect(createSupplierContact.ok()).toBeTruthy();

    const createCustomerContact = await page.request.post("/api/contacts", {
      data: {
        first_name: `Cus${stamp}`,
        last_name: "Buyer",
        company_id: customerCompanyId,
        email: `cus.${stamp}@example.test`,
      },
    });
    expect(createCustomerContact.ok()).toBeTruthy();

    await page.getByRole("link", { name: "Companies" }).click();
    await page.getByRole("tab", { name: "Company list" }).click();
    const companyFilters = sectionByHeading(page, "Company filters");
    await companyFilters.getByLabel("Search (name)").fill(prefix);

    const companySearchSuggestions = page.locator("#company-search-suggestions button");
    await expect(companySearchSuggestions).toHaveCount(5);
    const companySuggestionValues = await companySearchSuggestions.evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ""),
    );
    expect(
      companySuggestionValues.every((value) => value.toLowerCase().startsWith(prefix.toLowerCase())),
    ).toBeTruthy();

    await companyFilters.getByLabel("Role").selectOption("supplier");
    await companyFilters.getByRole("button", { name: "Apply filters" }).click();
    const companyList = sectionByHeading(page, "Company list");
    await expect(companyList.locator("tbody tr", { hasText: supplierCompany })).toHaveCount(1);
    await expect(companyList.locator("tbody tr", { hasText: bothCompany })).toHaveCount(0);

    await companyFilters.getByLabel("Role").selectOption("both");
    await companyFilters.getByRole("button", { name: "Apply filters" }).click();
    await expect(companyList.locator("tbody tr", { hasText: bothCompany })).toHaveCount(1);
    await expect(companyList.locator("tbody tr", { hasText: supplierCompany })).toHaveCount(0);

    await page.getByRole("link", { name: "Contacts" }).click();
    await page.getByRole("tab", { name: "Contact list" }).click();
    const contactFilters = sectionByHeading(page, "Contact filters");
    await contactFilters.getByLabel("Company").fill(prefix);

    const contactCompanySuggestions = page.locator("#contact-company-suggestions button");
    await expect(contactCompanySuggestions).toHaveCount(5);
    const contactSuggestionValues = await contactCompanySuggestions.evaluateAll((nodes) =>
      nodes.map((node) => node.textContent?.trim() ?? ""),
    );
    expect(
      contactSuggestionValues.every((value) => value.toLowerCase().startsWith(prefix.toLowerCase())),
    ).toBeTruthy();

    await contactFilters.getByLabel("Company").fill(supplierCompany);
    await contactFilters.getByRole("button", { name: "Apply filters" }).click();
    const contactList = sectionByHeading(page, "Contact list");
    await expect(contactList.locator("thead tr th", { hasText: "Agent" })).toHaveCount(0);
    await expect(contactList.locator("tbody tr", { hasText: supplierContactFullName })).toHaveCount(1);
    await expect(contactList.locator("tbody tr", { hasText: customerContactFullName })).toHaveCount(0);
  });

  test("profile and access pages work for admin", async ({ page }) => {
    await loginAsE2EAdmin(page);

    await page.getByRole("link", { name: "My Profile" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole("heading", { name: "My Profile" })).toBeVisible();

    const phone = `+33-${Date.now().toString().slice(-8)}`;
    await page.getByLabel("Phone").fill(phone);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Profile updated.")).toBeVisible();

    await page.getByRole("link", { name: "Access" }).click();
    await expect(page).toHaveURL(/\/access$/);
    await expect(page.getByRole("heading", { name: "Access" })).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("entity profile pages open from list and edit stays in profile page", async ({ page }) => {
    await loginAsE2EAdmin(page);

    await page.getByRole("link", { name: "Contacts" }).click();
    await page.getByRole("tab", { name: "Contact list" }).click();
    await page.getByRole("link", { name: "View details" }).first().click();
    await expect(page).toHaveURL(/\/contacts\/.+/);
    await expect(page.getByRole("heading", { name: "Contact profile" })).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit contact" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel edit" }).click();

    await page.getByRole("link", { name: "Companies" }).click();
    await page.getByRole("tab", { name: "Company list" }).click();
    await page.getByRole("link", { name: "View details" }).first().click();
    await expect(page).toHaveURL(/\/companies\/.+/);
    await expect(page.getByRole("heading", { name: "Company profile" })).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit company" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel edit" }).click();

    await page.getByRole("link", { name: "Products" }).click();
    await page.getByRole("tab", { name: "Product list" }).click();
    await page.getByRole("link", { name: "View details" }).first().click();
    await expect(page).toHaveURL(/\/products\/.+/);
    await expect(page.getByRole("heading", { name: "Product profile" })).toBeVisible();
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("heading", { name: "Edit product" })).toBeVisible();
  });

  test("notification bell opens notifications page", async ({ page }) => {
    await loginAsE2EAdmin(page);
    await page.getByRole("link", { name: "Open notifications page" }).click();
    await expect(page).toHaveURL(/\/notifications$/);
    await expect(page.getByRole("heading", { level: 1, name: "Notifications" })).toBeVisible();
    await page.getByRole("button", { name: "Clear all" }).click();
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("mobile navigation opens and routes correctly", async ({ page }) => {
      await loginAsE2EAdmin(page);
      await expect(page.getByRole("button", { name: "Toggle navigation menu" })).toBeVisible();

      await page.getByRole("button", { name: "Toggle navigation menu" }).click();
      await page.getByRole("link", { name: "Products" }).click();
      await expect(page).toHaveURL(/\/products$/);
      await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();

      await page.getByRole("button", { name: "Toggle navigation menu" }).click();
      await page.getByRole("link", { name: "Dashboard" }).click();
      await expect(page).toHaveURL(/\/dashboard$/);
      await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
    });
  });
});

