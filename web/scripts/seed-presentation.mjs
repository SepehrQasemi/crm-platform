import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFromFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const line of content.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const sep = line.indexOf("=");
    if (sep <= 0) continue;
    const key = line.slice(0, sep).trim();
    const value = line.slice(sep + 1).trim();
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

const envFile = path.resolve(process.cwd(), ".env.local");
loadEnvFromFile(envFile);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Create web/.env.local first, then rerun npm run seed:presentation.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const KEEP_USER_NAMES = ["Sepehr Qasemi", "Amir Qasemi", "Samar Jalali"];

function normalizeName(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function deleteAllRows(table) {
  const { count, error } = await supabase
    .from(table)
    .delete({ count: "exact" })
    .not("id", "is", null);

  if (error) {
    throw new Error(`Failed to clear ${table}: ${error.message}`);
  }
  return Number(count ?? 0);
}

async function ensureKeepUsersOnly() {
  const keepNameSet = new Set(KEEP_USER_NAMES.map(normalizeName));
  const { data: profiles, error } = await supabase
    .from("profiles")
    .select("id,full_name,first_name,last_name,role")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load profiles: ${error.message}`);

  const keptProfiles = (profiles ?? []).filter((profile) =>
    keepNameSet.has(normalizeName(profile.full_name)),
  );

  if (keptProfiles.length !== KEEP_USER_NAMES.length) {
    const found = keptProfiles.map((item) => item.full_name).join(", ");
    throw new Error(
      `Could not find all required users. Required: ${KEEP_USER_NAMES.join(", ")} | Found: ${found}`,
    );
  }

  const keepIds = new Set(keptProfiles.map((profile) => profile.id));

  const authUsers = [];
  for (let page = 1; page < 20; page += 1) {
    const response = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (response.error) {
      throw new Error(`Failed to list auth users: ${response.error.message}`);
    }
    authUsers.push(...response.data.users);
    if (response.data.users.length < 200) break;
  }

  for (const user of authUsers) {
    if (keepIds.has(user.id)) continue;
    const { error: deleteUserError } = await supabase.auth.admin.deleteUser(user.id, false);
    if (deleteUserError) {
      throw new Error(`Failed to delete auth user ${user.email ?? user.id}: ${deleteUserError.message}`);
    }
  }

  for (const profile of profiles ?? []) {
    if (keepIds.has(profile.id)) continue;
    const { error: deleteProfileError } = await supabase
      .from("profiles")
      .delete()
      .eq("id", profile.id);
    if (deleteProfileError) {
      throw new Error(`Failed to delete profile ${profile.full_name}: ${deleteProfileError.message}`);
    }
  }

  const byName = Object.fromEntries(
    keptProfiles.map((profile) => [normalizeName(profile.full_name), profile]),
  );

  const sepehr = byName[normalizeName("Sepehr Qasemi")];
  const amir = byName[normalizeName("Amir Qasemi")];
  const samar = byName[normalizeName("Samar Jalali")];

  const profileUpdates = [
    {
      id: sepehr.id,
      full_name: "Sepehr Qasemi",
      first_name: "Sepehr",
      last_name: "Qasemi",
      role: "admin",
      position: "General Director",
      department: "Management",
      phone: "+33 6 10 00 00 01",
    },
    {
      id: amir.id,
      full_name: "Amir Qasemi",
      first_name: "Amir",
      last_name: "Qasemi",
      role: "manager",
      position: "Sales Manager",
      department: "Sales",
      phone: "+33 6 10 00 00 02",
    },
    {
      id: samar.id,
      full_name: "Samar Jalali",
      first_name: "Samar",
      last_name: "Jalali",
      role: "standard_user",
      position: "Account Executive",
      department: "Sales",
      phone: "+33 6 10 00 00 03",
    },
  ];

  for (const payload of profileUpdates) {
    const { error: updateError } = await supabase
      .from("profiles")
      .update(payload)
      .eq("id", payload.id);
    if (updateError) {
      throw new Error(`Failed to update profile ${payload.full_name}: ${updateError.message}`);
    }
  }

  return {
    sepehrId: sepehr.id,
    amirId: amir.id,
    samarId: samar.id,
  };
}

async function getStageIds() {
  const { data, error } = await supabase
    .from("pipeline_stages")
    .select("id,name,sort_order")
    .order("sort_order", { ascending: true });

  if (error) throw new Error(`Failed to load pipeline stages: ${error.message}`);

  const stageMap = new Map((data ?? []).map((stage) => [stage.name, stage.id]));
  const aliases = {
    newLead: ["New Lead", "Nouveau lead"],
    qualification: ["Qualification"],
    quoteSent: ["Quote Sent", "Devis envoye"],
    negotiation: ["Negotiation", "Negociation"],
    won: ["Won", "Gagne"],
    lost: ["Lost", "Perdu"],
  };

  function pickAlias(candidates) {
    for (const candidate of candidates) {
      const id = stageMap.get(candidate);
      if (id) return id;
    }
    return null;
  }

  const stageIds = {
    newLead: pickAlias(aliases.newLead),
    qualification: pickAlias(aliases.qualification),
    quoteSent: pickAlias(aliases.quoteSent),
    negotiation: pickAlias(aliases.negotiation),
    won: pickAlias(aliases.won),
    lost: pickAlias(aliases.lost),
  };

  for (const [key, value] of Object.entries(stageIds)) {
    if (!value) throw new Error(`Missing pipeline stage for ${key}`);
  }

  return stageIds;
}

async function insertBatch(table, rows, selectColumns = "id") {
  const { data, error } = await supabase.from(table).insert(rows).select(selectColumns);
  if (error) throw new Error(`Failed to insert ${table}: ${error.message}`);
  return data ?? [];
}

function makeMapByName(rows) {
  return Object.fromEntries(rows.map((row) => [row.name, row.id]));
}

async function main() {
  const users = await ensureKeepUsersOnly();

  const cleared = {};
  cleared.email_logs = await deleteAllRows("email_logs");
  cleared.automation_execution_locks = await deleteAllRows("automation_execution_locks");
  cleared.lead_stage_history = await deleteAllRows("lead_stage_history");
  cleared.tasks = await deleteAllRows("tasks");
  cleared.leads = await deleteAllRows("leads");
  cleared.product_company_links = await deleteAllRows("product_company_links");
  cleared.contacts = await deleteAllRows("contacts");
  cleared.products = await deleteAllRows("products");
  cleared.product_categories = await deleteAllRows("product_categories");
  cleared.companies = await deleteAllRows("companies");

  const categories = await insertBatch("product_categories", [
    {
      name: "Starches",
      description:
        "Functional starches for sauces, bakery, confectionery, and texture optimization.",
      owner_id: users.sepehrId,
    },
    {
      name: "Hydrocolloids",
      description:
        "Stabilizers and thickeners for viscosity control, suspension, and water binding.",
      owner_id: users.sepehrId,
    },
    {
      name: "Cocoa & Chocolate",
      description:
        "Natural and alkalized cocoa ingredients for bakery, beverage, and chocolate systems.",
      owner_id: users.sepehrId,
    },
    {
      name: "Dairy Powders",
      description:
        "Whole and skim milk powders for bakery, confectionery, and instant beverage formulations.",
      owner_id: users.sepehrId,
    },
    {
      name: "Sweeteners",
      description:
        "Bulk and functional sweetening ingredients for food and beverage manufacturing.",
      owner_id: users.sepehrId,
    },
  ], "id,name");

  const companies = await insertBatch("companies", [
    {
      name: "Northstar Ingredient Sourcing GmbH",
      company_role: "supplier",
      sector: "Food Ingredients",
      city: "Hamburg",
      country: "Germany",
      website: "https://northstar-ingredients.example",
      notes: "Primary strategic supplier for starches, hydrocolloids, and dairy powders.",
      owner_id: users.sepehrId,
    },
    {
      name: "Paris Gourmet Foods SAS",
      company_role: "customer",
      sector: "Food Ingredients",
      city: "Paris",
      country: "France",
      website: "https://paris-gourmetfoods.fr",
      notes: "Key customer focused on sauces, dessert mixes, and bakery bases.",
      owner_id: users.amirId,
    },
    {
      name: "Lyon Fine Foods SARL",
      company_role: "customer",
      sector: "Food Ingredients",
      city: "Lyon",
      country: "France",
      website: "https://lyonfinefoods.fr",
      notes: "Regional customer specialized in premium cocoa applications.",
      owner_id: users.samarId,
    },
    {
      name: "Nordic Ingredient Brokers ApS",
      company_role: "both",
      sector: "Food Ingredients",
      city: "Copenhagen",
      country: "Denmark",
      website: "https://nordic-ingredientbrokers.com",
      notes: "Acts as both supplier and customer in selected ingredient categories.",
      owner_id: users.amirId,
    },
    {
      name: "Mediterra Flavors Trading SL",
      company_role: "both",
      sector: "Food Ingredients",
      city: "Barcelona",
      country: "Spain",
      website: "https://mediterra-flavors.com",
      notes: "Mediterranean trading partner with mixed portfolio (buy/sell).",
      owner_id: users.samarId,
    },
  ], "id,name");

  const companyByName = makeMapByName(companies);

  const contacts = await insertBatch("contacts", [
    {
      first_name: "Hugo",
      last_name: "Meyer",
      email: "hugo.meyer@northstar-ingredients.example",
      phone: "+49 40 1111 1001",
      job_title: "Head of Export Sales",
      notes: "Main commercial contact for strategic sourcing.",
      company_id: companyByName["Northstar Ingredient Sourcing GmbH"],
      is_company_agent: true,
      agent_rank: 1,
      owner_id: users.sepehrId,
    },
    {
      first_name: "Elena",
      last_name: "Rossi",
      email: "elena.rossi@northstar-ingredients.example",
      phone: "+49 40 1111 1002",
      job_title: "Technical Sales Manager",
      notes: "Supports product qualification and technical specs.",
      company_id: companyByName["Northstar Ingredient Sourcing GmbH"],
      is_company_agent: true,
      agent_rank: 2,
      owner_id: users.sepehrId,
    },
    {
      first_name: "Claire",
      last_name: "Dubois",
      email: "claire.dubois@paris-gourmetfoods.fr",
      phone: "+33 1 4400 2001",
      job_title: "Purchasing Manager",
      notes: "Primary buyer for dairy and hydrocolloid categories.",
      company_id: companyByName["Paris Gourmet Foods SAS"],
      is_company_agent: true,
      agent_rank: 1,
      owner_id: users.amirId,
    },
    {
      first_name: "Julien",
      last_name: "Martin",
      email: "julien.martin@paris-gourmetfoods.fr",
      phone: "+33 1 4400 2002",
      job_title: "R&D Manager",
      notes: "Evaluates new product models and reformulation options.",
      company_id: companyByName["Paris Gourmet Foods SAS"],
      is_company_agent: false,
      agent_rank: null,
      owner_id: users.amirId,
    },
    {
      first_name: "Nadia",
      last_name: "Benali",
      email: "nadia.benali@lyonfinefoods.fr",
      phone: "+33 4 7200 3001",
      job_title: "Procurement Lead",
      notes: "Main point of contact for annual contracts.",
      company_id: companyByName["Lyon Fine Foods SARL"],
      is_company_agent: true,
      agent_rank: 1,
      owner_id: users.samarId,
    },
    {
      first_name: "Lucas",
      last_name: "Moreau",
      email: "lucas.moreau@lyonfinefoods.fr",
      phone: "+33 4 7200 3002",
      job_title: "Quality Director",
      notes: "Validates technical dossiers and quality deviations.",
      company_id: companyByName["Lyon Fine Foods SARL"],
      is_company_agent: false,
      agent_rank: null,
      owner_id: users.samarId,
    },
    {
      first_name: "Mikkel",
      last_name: "Sorensen",
      email: "mikkel.sorensen@nordic-ingredientbrokers.com",
      phone: "+45 31 2200 4001",
      job_title: "Commercial Director",
      notes: "Leads framework deals in the Nordic market.",
      company_id: companyByName["Nordic Ingredient Brokers ApS"],
      is_company_agent: true,
      agent_rank: 1,
      owner_id: users.amirId,
    },
    {
      first_name: "Sofia",
      last_name: "Ortega",
      email: "sofia.ortega@mediterra-flavors.com",
      phone: "+34 93 3300 5001",
      job_title: "Key Account Manager",
      notes: "Handles sweeteners and functional blends portfolio.",
      company_id: companyByName["Mediterra Flavors Trading SL"],
      is_company_agent: true,
      agent_rank: 1,
      owner_id: users.samarId,
    },
  ], "id,first_name,last_name,company_id");

  const contactByKey = Object.fromEntries(
    contacts.map((contact) => [`${contact.first_name} ${contact.last_name}`, contact.id]),
  );

  const products = await insertBatch("products", [
    {
      name: "Native Corn Starch",
      sku: "CRM-ST-001",
      category: "Starches",
      unit: "kg",
      default_purchase_price: 880,
      default_sale_price: 1120,
      notes: "Standard viscosity profile for sauces and soups.",
      is_active: true,
      owner_id: users.sepehrId,
    },
    {
      name: "Pregelatinized Corn Starch",
      sku: "CRM-ST-002",
      category: "Starches",
      unit: "kg",
      default_purchase_price: 980,
      default_sale_price: 1260,
      notes: "Cold-process starch for instant applications.",
      is_active: true,
      owner_id: users.sepehrId,
    },
    {
      name: "Tapioca Starch Premium",
      sku: "CRM-ST-003",
      category: "Starches",
      unit: "kg",
      default_purchase_price: 1050,
      default_sale_price: 1360,
      notes: "High clarity starch for transparent systems.",
      is_active: true,
      owner_id: users.sepehrId,
    },
    {
      name: "Kappa Carrageenan",
      sku: "CRM-HC-001",
      category: "Hydrocolloids",
      unit: "kg",
      default_purchase_price: 7600,
      default_sale_price: 8920,
      notes: "Gelling hydrocolloid for dairy and meat systems.",
      is_active: true,
      owner_id: users.amirId,
    },
    {
      name: "Iota Carrageenan",
      sku: "CRM-HC-002",
      category: "Hydrocolloids",
      unit: "kg",
      default_purchase_price: 7820,
      default_sale_price: 9180,
      notes: "Elastic gel performance in dairy formulas.",
      is_active: true,
      owner_id: users.amirId,
    },
    {
      name: "Xanthan Gum 200 Mesh",
      sku: "CRM-HC-003",
      category: "Hydrocolloids",
      unit: "kg",
      default_purchase_price: 4100,
      default_sale_price: 4980,
      notes: "High hydration rate with stable viscosity.",
      is_active: true,
      owner_id: users.amirId,
    },
    {
      name: "Guar Gum Food Grade",
      sku: "CRM-HC-004",
      category: "Hydrocolloids",
      unit: "kg",
      default_purchase_price: 2950,
      default_sale_price: 3640,
      notes: "Cost-efficient thickener for sauces and dressings.",
      is_active: true,
      owner_id: users.amirId,
    },
    {
      name: "Cocoa Powder 10-12%",
      sku: "CRM-CC-001",
      category: "Cocoa & Chocolate",
      unit: "kg",
      default_purchase_price: 3550,
      default_sale_price: 4320,
      notes: "Natural cocoa profile for bakery applications.",
      is_active: true,
      owner_id: users.samarId,
    },
    {
      name: "Cocoa Powder 22-24%",
      sku: "CRM-CC-002",
      category: "Cocoa & Chocolate",
      unit: "kg",
      default_purchase_price: 4920,
      default_sale_price: 5780,
      notes: "High-fat cocoa for premium flavor and mouthfeel.",
      is_active: true,
      owner_id: users.samarId,
    },
    {
      name: "Alkalized Cocoa Powder",
      sku: "CRM-CC-003",
      category: "Cocoa & Chocolate",
      unit: "kg",
      default_purchase_price: 4480,
      default_sale_price: 5360,
      notes: "Dark alkalized cocoa for beverage and bakery blends.",
      is_active: true,
      owner_id: users.samarId,
    },
    {
      name: "Whole Milk Powder 26%",
      sku: "CRM-DP-001",
      category: "Dairy Powders",
      unit: "kg",
      default_purchase_price: 3270,
      default_sale_price: 3960,
      notes: "Instantized whole milk powder for bakery and dessert.",
      is_active: true,
      owner_id: users.sepehrId,
    },
    {
      name: "Skim Milk Powder",
      sku: "CRM-DP-002",
      category: "Dairy Powders",
      unit: "kg",
      default_purchase_price: 2980,
      default_sale_price: 3580,
      notes: "Low-fat dairy powder for cost-optimized formulations.",
      is_active: true,
      owner_id: users.sepehrId,
    },
    {
      name: "Dextrose Monohydrate",
      sku: "CRM-SW-001",
      category: "Sweeteners",
      unit: "kg",
      default_purchase_price: 1180,
      default_sale_price: 1490,
      notes: "Bulk sweetener for confectionery and beverage.",
      is_active: true,
      owner_id: users.amirId,
    },
    {
      name: "Fructose Syrup 55",
      sku: "CRM-SW-002",
      category: "Sweeteners",
      unit: "kg",
      default_purchase_price: 1460,
      default_sale_price: 1840,
      notes: "Liquid sweetener for beverage systems.",
      is_active: true,
      owner_id: users.amirId,
    },
    {
      name: "Maltodextrin DE18",
      sku: "CRM-SW-003",
      category: "Sweeteners",
      unit: "kg",
      default_purchase_price: 1320,
      default_sale_price: 1680,
      notes: "Bulking carbohydrate for powdered food blends.",
      is_active: true,
      owner_id: users.amirId,
    },
  ], "id,name");

  const productByName = makeMapByName(products);

  await insertBatch("product_company_links", [
    {
      product_id: productByName["Native Corn Starch"],
      company_id: companyByName["Northstar Ingredient Sourcing GmbH"],
      relation_type: "traded",
      product_model: "Food Grade A",
      last_price: 880,
      notes: "Regular monthly supply.",
      owner_id: users.sepehrId,
    },
    {
      product_id: productByName["Kappa Carrageenan"],
      company_id: companyByName["Northstar Ingredient Sourcing GmbH"],
      relation_type: "traded",
      product_model: "Refined E407",
      last_price: 7600,
      notes: "Strategic annual framework.",
      owner_id: users.sepehrId,
    },
    {
      product_id: productByName["Whole Milk Powder 26%"],
      company_id: companyByName["Northstar Ingredient Sourcing GmbH"],
      relation_type: "traded",
      product_model: "Instant WMP 26",
      last_price: 3270,
      notes: "Stable quarterly supply.",
      owner_id: users.sepehrId,
    },
    {
      product_id: productByName["Dextrose Monohydrate"],
      company_id: companyByName["Northstar Ingredient Sourcing GmbH"],
      relation_type: "traded",
      product_model: "Monohydrate 99.5%",
      last_price: 1180,
      notes: "Bulk purchase program.",
      owner_id: users.sepehrId,
    },
    {
      product_id: productByName["Cocoa Powder 10-12%"],
      company_id: companyByName["Northstar Ingredient Sourcing GmbH"],
      relation_type: "potential",
      product_model: "Natural Brown 10-12",
      last_price: 3550,
      notes: "Under technical validation.",
      owner_id: users.sepehrId,
    },
    {
      product_id: productByName["Cocoa Powder 22-24%"],
      company_id: companyByName["Paris Gourmet Foods SAS"],
      relation_type: "traded",
      product_model: "Dark 22-24",
      last_price: 5780,
      notes: "Used in premium desserts line.",
      owner_id: users.amirId,
    },
    {
      product_id: productByName["Whole Milk Powder 26%"],
      company_id: companyByName["Paris Gourmet Foods SAS"],
      relation_type: "traded",
      product_model: "Bakery Instant",
      last_price: 3960,
      notes: "Core bakery premix ingredient.",
      owner_id: users.amirId,
    },
    {
      product_id: productByName["Kappa Carrageenan"],
      company_id: companyByName["Paris Gourmet Foods SAS"],
      relation_type: "potential",
      product_model: "Dairy Stabilizer Grade",
      last_price: 8920,
      notes: "Potential expansion in dairy desserts.",
      owner_id: users.amirId,
    },
    {
      product_id: productByName["Alkalized Cocoa Powder"],
      company_id: companyByName["Lyon Fine Foods SARL"],
      relation_type: "traded",
      product_model: "Black 12% Fat",
      last_price: 5360,
      notes: "Approved for flagship cocoa line.",
      owner_id: users.samarId,
    },
    {
      product_id: productByName["Tapioca Starch Premium"],
      company_id: companyByName["Lyon Fine Foods SARL"],
      relation_type: "traded",
      product_model: "Clear Gel Grade",
      last_price: 1360,
      notes: "Used in transparent glaze formulas.",
      owner_id: users.samarId,
    },
    {
      product_id: productByName["Skim Milk Powder"],
      company_id: companyByName["Lyon Fine Foods SARL"],
      relation_type: "potential",
      product_model: "Low Heat SMP",
      last_price: 3580,
      notes: "Planned for 2026 reformulation.",
      owner_id: users.samarId,
    },
    {
      product_id: productByName["Iota Carrageenan"],
      company_id: companyByName["Lyon Fine Foods SARL"],
      relation_type: "potential",
      product_model: "Soft Gel Grade",
      last_price: 9180,
      notes: "Pilot trials scheduled next quarter.",
      owner_id: users.samarId,
    },
    {
      product_id: productByName["Tapioca Starch Premium"],
      company_id: companyByName["Nordic Ingredient Brokers ApS"],
      relation_type: "traded",
      product_model: "Neutral Taste Grade",
      last_price: 1360,
      notes: "Brokered in Nordic bakery segment.",
      owner_id: users.amirId,
    },
    {
      product_id: productByName["Xanthan Gum 200 Mesh"],
      company_id: companyByName["Nordic Ingredient Brokers ApS"],
      relation_type: "traded",
      product_model: "200 Mesh Fast Hydration",
      last_price: 4980,
      notes: "Main thickener for sauce producers.",
      owner_id: users.amirId,
    },
    {
      product_id: productByName["Alkalized Cocoa Powder"],
      company_id: companyByName["Nordic Ingredient Brokers ApS"],
      relation_type: "potential",
      product_model: "Dark Dutch Process",
      last_price: 5360,
      notes: "Potential resale to beverage clients.",
      owner_id: users.amirId,
    },
    {
      product_id: productByName["Guar Gum Food Grade"],
      company_id: companyByName["Mediterra Flavors Trading SL"],
      relation_type: "traded",
      product_model: "Fine Viscosity FG",
      last_price: 3640,
      notes: "Active Mediterranean distribution.",
      owner_id: users.samarId,
    },
    {
      product_id: productByName["Fructose Syrup 55"],
      company_id: companyByName["Mediterra Flavors Trading SL"],
      relation_type: "traded",
      product_model: "HFCS-55",
      last_price: 1840,
      notes: "Used in beverage production lines.",
      owner_id: users.samarId,
    },
    {
      product_id: productByName["Maltodextrin DE18"],
      company_id: companyByName["Mediterra Flavors Trading SL"],
      relation_type: "potential",
      product_model: "Spray Drying DE18",
      last_price: 1680,
      notes: "In evaluation for dry mix products.",
      owner_id: users.samarId,
    },
  ], "id");

  const stageIds = await getStageIds();

  const leads = await insertBatch("leads", [
    {
      title: "Annual Carrageenan Program 2026",
      source: "Referral",
      status: "open",
      estimated_value: 68000,
      company_id: companyByName["Paris Gourmet Foods SAS"],
      contact_id: contactByKey["Claire Dubois"],
      assigned_to: users.amirId,
      owner_id: users.amirId,
      current_stage_id: stageIds.qualification,
      last_activity_at: new Date().toISOString(),
      notes: "Pricing alignment requested before final quotation.",
    },
    {
      title: "Premium Cocoa Contract Q3",
      source: "Trade Show",
      status: "open",
      estimated_value: 92000,
      company_id: companyByName["Lyon Fine Foods SARL"],
      contact_id: contactByKey["Nadia Benali"],
      assigned_to: users.sepehrId,
      owner_id: users.sepehrId,
      current_stage_id: stageIds.quoteSent,
      last_activity_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      notes: "Waiting for final volume split confirmation.",
    },
    {
      title: "Milk Powder Backup Supplier",
      source: "Email Campaign",
      status: "open",
      estimated_value: 54000,
      company_id: companyByName["Paris Gourmet Foods SAS"],
      contact_id: contactByKey["Julien Martin"],
      assigned_to: users.samarId,
      owner_id: users.samarId,
      current_stage_id: stageIds.negotiation,
      last_activity_at: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
      notes: "Technical validation complete, commercial terms in discussion.",
    },
    {
      title: "Nordic Brokerage Framework",
      source: "LinkedIn",
      status: "won",
      estimated_value: 120000,
      company_id: companyByName["Nordic Ingredient Brokers ApS"],
      contact_id: contactByKey["Mikkel Sorensen"],
      assigned_to: users.amirId,
      owner_id: users.amirId,
      current_stage_id: stageIds.won,
      last_activity_at: new Date().toISOString(),
      notes: "Signed framework agreement for Nordic channels.",
    },
    {
      title: "Mediterra Sweeteners Opportunity",
      source: "Website",
      status: "open",
      estimated_value: 47000,
      company_id: companyByName["Mediterra Flavors Trading SL"],
      contact_id: contactByKey["Sofia Ortega"],
      assigned_to: users.sepehrId,
      owner_id: users.sepehrId,
      current_stage_id: stageIds.newLead,
      last_activity_at: new Date().toISOString(),
      notes: "Initial discovery call scheduled this week.",
    },
    {
      title: "Legacy Starch Tender",
      source: "Phone",
      status: "lost",
      estimated_value: 35000,
      company_id: companyByName["Lyon Fine Foods SARL"],
      contact_id: contactByKey["Lucas Moreau"],
      assigned_to: users.samarId,
      owner_id: users.samarId,
      current_stage_id: stageIds.lost,
      last_activity_at: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString(),
      notes: "Lost on payment term mismatch.",
    },
  ], "id,title");

  const leadByTitle = makeMapByName(leads);

  await insertBatch("tasks", [
    {
      title: "Follow-up meeting: Carrageenan program",
      description: "Validate final annual volumes and update commercial proposal.",
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      priority: "high",
      status: "todo",
      assigned_to: users.amirId,
      owner_id: users.amirId,
      lead_id: leadByTitle["Annual Carrageenan Program 2026"],
      company_id: companyByName["Paris Gourmet Foods SAS"],
      contact_id: contactByKey["Claire Dubois"],
    },
    {
      title: "Send revised cocoa quotation",
      description: "Issue updated quote with new transport assumptions.",
      due_date: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      priority: "high",
      status: "in_progress",
      assigned_to: users.sepehrId,
      owner_id: users.sepehrId,
      lead_id: leadByTitle["Premium Cocoa Contract Q3"],
      company_id: companyByName["Lyon Fine Foods SARL"],
      contact_id: contactByKey["Nadia Benali"],
    },
    {
      title: "Confirm milk powder technical specs",
      description: "Collect final QA confirmation and allergen statement.",
      due_date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      priority: "normal",
      status: "todo",
      assigned_to: users.samarId,
      owner_id: users.samarId,
      lead_id: leadByTitle["Milk Powder Backup Supplier"],
      company_id: companyByName["Paris Gourmet Foods SAS"],
      contact_id: contactByKey["Julien Martin"],
    },
    {
      title: "Prepare onboarding docs for Nordic",
      description: "Complete signed documents package and handover notes.",
      due_date: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
      priority: "urgent",
      status: "in_progress",
      assigned_to: users.amirId,
      owner_id: users.amirId,
      lead_id: leadByTitle["Nordic Brokerage Framework"],
      company_id: companyByName["Nordic Ingredient Brokers ApS"],
      contact_id: contactByKey["Mikkel Sorensen"],
    },
    {
      title: "Call Mediterra for sweeteners needs",
      description: "Gather product forecast for next quarter planning.",
      due_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      priority: "normal",
      status: "todo",
      assigned_to: users.sepehrId,
      owner_id: users.sepehrId,
      lead_id: leadByTitle["Mediterra Sweeteners Opportunity"],
      company_id: companyByName["Mediterra Flavors Trading SL"],
      contact_id: contactByKey["Sofia Ortega"],
    },
    {
      title: "Post-mortem on lost starch tender",
      description: "Document lessons learned and corrective actions.",
      due_date: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      priority: "low",
      status: "todo",
      assigned_to: users.samarId,
      owner_id: users.samarId,
      lead_id: leadByTitle["Legacy Starch Tender"],
      company_id: companyByName["Lyon Fine Foods SARL"],
      contact_id: contactByKey["Lucas Moreau"],
    },
  ], "id");

  console.log("Presentation seed completed successfully.");
  console.log(`Kept users: ${KEEP_USER_NAMES.join(" | ")}`);
  console.log(
    `Inserted: companies=${companies.length}, contacts=${contacts.length}, categories=${categories.length}, products=${products.length}, leads=${leads.length}, tasks=6`,
  );
  console.log("Cleared rows:", cleared);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});

