// Step-by-step guides shown from the "How to use this page" button on every page and
// collected on /help. Pure data — safe for client and server.

export type TutorialStep = { title: string; body: string };
export type Tutorial = {
  id: string;
  title: string;
  /** One line on what the page is for. */
  summary: string;
  steps: TutorialStep[];
  tips?: string[];
  /** Who can use it, when not everyone. */
  access?: string;
  /** Representative path, for links from the Help page. */
  path: string;
};

export const TUTORIALS: Tutorial[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    path: "/dashboard",
    summary: "Your daily snapshot: sales, profit, stock alerts, lot progress and what's selling.",
    steps: [
      { title: "Read the key numbers", body: "The tiles at the top show this month's sales (and profit for managers) with ▲/▼ compared to the same number of days last month. Click any tile to jump to the details behind it." },
      { title: "Use the quick actions", body: "New sale, New quotation, Lots, Phones and Reports buttons sit next to the greeting so the most common jobs are one click away." },
      { title: "Check the 30-day sales chart", body: "Bars are daily revenue; managers also see a gross-profit line. Hover (or tap) a day for the exact figures and number of sales." },
      { title: "Watch lots and stock", body: "Lots Overview shows each lot's stage, payment status and sell-through — bookmarked lots (★) are always listed first. The Low stock watchlist lists what to reorder, most urgent first." },
      { title: "Make it yours", body: "Press Customize above the tiles to reorder or hide them. Your layout is remembered in this browser; Reset restores the default." },
    ],
    tips: ["Amber-outlined tiles need attention (low stock, unpaid invoices).", "Profit, margins and costs are only shown to admins and managers."],
  },
  {
    id: "lots",
    title: "Lots",
    path: "/lots",
    summary: "Purchase batches from suppliers — where all phone stock comes from.",
    steps: [
      { title: "Create a lot", body: "Enter a lot number, pick the supplier (or add one with +) and the start date, then Create. Every lot starts in the Collection stage and opens automatically." },
      { title: "Find a lot", body: "Search by lot number or supplier, filter by start date, and switch between List and Grid. Use Search IMEI to find which lot a phone came from." },
      { title: "Bookmark lots you work on", body: "Click ☆ on a lot to bookmark it. Bookmarks appear as shortcuts above the list, can be filtered with \"Bookmarked only\", and lead the dashboard's Lots Overview." },
      { title: "See spend in a foreign currency", body: "Managers can enter a currency and its rate to LKR above the list to see each lot's total spend converted — view only, nothing is saved to the lots." },
      { title: "Delete a mistaken lot", body: "Delete asks for your password. Lots with sold units can't be deleted; deleted lots go to the Recycle Bin for 30 days." },
    ],
    tips: ["Landed cost/unit = shipping + tax + customs + other charges ÷ units."],
  },
  {
    id: "lot",
    title: "Lot details",
    path: "/lots",
    summary: "Add phones and accessories to a lot and move it through Collection → Shipped → Cleared.",
    steps: [
      { title: "Register phones", body: "In Register Phones, click the variant box to open the picker: type to search, or narrow by model → storage → RAM → color. Not there? Use \"Create new variant\" at the bottom of the list." },
      { title: "Build a batch", body: "Scan or type each IMEI and press Add to Batch — the variant and prices stay selected so you can keep scanning. Prices accept foreign currency: tick \"Foreign currency?\" and enter the amount and rate. Press Register to save the whole batch." },
      { title: "Move through the stages", body: "Collection: goods cost builds up from what you add. Shipped: enter the shipping cost. Cleared: enter tax, customs and other charges. Grading (A/B/C) opens once the lot is Cleared." },
      { title: "Record supplier payments", body: "Add each payment with its method, reference and optional proof image; the lot's payment status (Unpaid/Partial/Paid) updates automatically." },
      { title: "Fix a unit", body: "Edit on a unit changes its prices, grade or IMEI. After Collection, cost edits ask for your password; an IMEI change always asks you to re-type the new number." },
    ],
    tips: ["Click a unit row to see its full cost and profit breakdown.", "Bookmark (★) the lot from the top bar to find it quickly later."],
  },
  {
    id: "phones",
    title: "Phones",
    path: "/items/phones",
    summary: "Phone models, their variants (storage / RAM / color) and every unit by IMEI.",
    steps: [
      { title: "Understand the three levels", body: "A model is the phone family (Apple iPhone 13). A variant is a configuration of it — storage, RAM and color, all optional. A unit is one physical phone with its own IMEI." },
      { title: "Quick add", body: "Use the tabs to add a single unit, a variant or a model. Receiving a batch? Register units on the lot's page instead — it's faster and builds the lot's cost." },
      { title: "Browse models & options", body: "Each model card shows its available colors (in their real colors), storage and RAM. Switch between \"In stock\" and \"All options\", and filter the cards by name or color." },
      { title: "Manage variants and models", body: "Click a variant to see its units and edit it — including moving it to another model. Delete on a card removes a model; it's refused while any of its variants still has stock." },
      { title: "Find units", body: "Search units by IMEI, model, variant or color, filter by status, and switch List/Grid. Archive removes a unit from stock (recoverable from the Recycle Bin for 30 days)." },
    ],
    tips: ["Status pills: In stock, Reserved, Sold, Returned, In repair, Written off.", "Price history shows every retail/wholesale price change."],
  },
  {
    id: "variant",
    title: "Variant details",
    path: "/items/phones",
    summary: "One variant's specs, default costs and all its units.",
    steps: [
      { title: "Edit specs", body: "Press Edit to change storage, RAM, color and other specs. Leave the name blank and it's rebuilt from the specs." },
      { title: "Move to another model", body: "Pick a different Phone model in the Edit form to move this variant — and all its units — there. If that model already has a variant with the same name, you'll be asked to rename first." },
      { title: "Default tag & battery cost", body: "These pre-fill when you register new units of this variant on a lot." },
      { title: "Check its units", body: "The stock summary and units table list every unit of this variant; click a row for its cost and profit breakdown." },
    ],
  },
  {
    id: "catalog",
    title: "Phone Catalog",
    path: "/items/phone-catalog",
    summary: "A read-only browser of every model and variant with full specs and stock.",
    steps: [
      { title: "Filter", body: "Narrow by make, storage, RAM, color or price range." },
      { title: "Compare", body: "Each variant shows its specs and how many are in stock — useful when a customer asks what you have." },
      { title: "Open a variant", body: "Click View to open the variant page with its units." },
    ],
    tips: ["To add or edit models and variants, use the Phones page."],
  },
  {
    id: "priceHistory",
    title: "Price History",
    path: "/items/phones/price-history",
    summary: "Every change to a unit's retail or wholesale price, with who changed it.",
    steps: [
      { title: "Search", body: "Find changes by IMEI, brand, model, variant or lot number." },
      { title: "Filter", body: "Show only retail or wholesale changes (wholesale is visible to managers), and limit to a date range." },
      { title: "Read a change", body: "Each row shows old → new price, the change in amount and %, the unit's current price and who made it." },
    ],
    tips: ["Changes are recorded when a unit's price is edited on its lot page."],
  },
  {
    id: "accessories",
    title: "Accessories",
    path: "/items/chargers",
    summary: "Chargers, cables, handsfree and other accessories tracked by quantity.",
    steps: [
      { title: "Add an accessory", body: "Enter name, SKU, prices, quantity and category-specific specs (e.g. connector type, wattage)." },
      { title: "Keep stock right", body: "Quantities go down automatically when accessories are sold and up when added to a lot. Set a low-stock threshold to get dashboard alerts." },
      { title: "Edit or archive", body: "Edit a row to change prices or details; archive removes it from stock (recoverable for 30 days)." },
    ],
  },
  {
    id: "sales",
    title: "Sales",
    path: "/sales",
    summary: "Create sales; an invoice is generated automatically.",
    steps: [
      { title: "Pick customer and price type", body: "Choose a customer (or leave as walk-in, or add one with +) and Retail or Wholesale pricing. Switching re-prices lines you haven't edited by hand." },
      { title: "Add items", body: "Search phones (by model, color, IMEI) or accessories and add them. A popup shows price options, margin (managers) and any notes before adding." },
      { title: "Finish the sale", body: "Adjust quantities or prices, add tax, handling fee or discount, then save. The invoice is created automatically." },
      { title: "Afterwards", body: "Open a sale to record payments, print the receipt or download the invoice PDF." },
    ],
    tips: ["Filter the list by status, payment status and Retail/Wholesale."],
  },
  {
    id: "sale",
    title: "Sale details",
    path: "/sales",
    summary: "One sale's items, invoice and payments.",
    steps: [
      { title: "Record a payment", body: "Enter the amount and method; the invoice moves from Unpaid to Partially paid to Paid." },
      { title: "Print or share", body: "Open the receipt to print it, or download the invoice as a PDF." },
      { title: "Returns", body: "Items coming back are handled on the Returns page, which links back to this sale and issues a credit note." },
    ],
  },
  {
    id: "returns",
    title: "Returns",
    path: "/returns",
    summary: "Take items back against their original sale and issue a credit note.",
    steps: [
      { title: "Pick the sale", body: "Every return is linked to the sale it came from." },
      { title: "Choose items and condition", body: "Select what's coming back and why. Good-condition phones return to stock; damaged ones are flagged." },
      { title: "Credit note", body: "A credit note is generated automatically for the returned amount." },
    ],
  },
  {
    id: "quotations",
    title: "Quotations",
    path: "/quotations",
    summary: "Price quotes for customers that can be converted into a sale.",
    steps: [
      { title: "Create a quotation", body: "Pick a customer, Retail or Wholesale, and add models or specific variants (shown with color and storage). Set a valid-until date." },
      { title: "Share it", body: "Open the quotation and use Print for a paper copy or Download PDF to email or WhatsApp it. The PDF button in the list downloads it straight away." },
      { title: "Convert to a sale", body: "When the customer agrees, convert it — the sale is created from the quoted lines." },
    ],
  },
  {
    id: "quotation",
    title: "Quotation details",
    path: "/quotations",
    summary: "One quotation's lines, totals and validity.",
    steps: [
      { title: "Review", body: "Check the customer, validity date, line items (model, variant and color/storage) and total." },
      { title: "Print or download", body: "Print opens a clean printable version (no menus). Download PDF saves a branded PDF you can email or share." },
      { title: "Convert", body: "Convert it to a sale from the Quotations page when the customer accepts." },
    ],
  },
  {
    id: "customers",
    title: "Customers",
    path: "/customers",
    summary: "Customer contacts, purchase history and lifetime value.",
    steps: [
      { title: "Add a customer", body: "Enter name and optional phone, email and address. You can also add customers on the fly while making a sale." },
      { title: "Edit", body: "Press Edit to update their details in a popup." },
      { title: "Delete", body: "Delete asks for your password. Past sales stay intact; the record goes to the Recycle Bin for 30 days." },
      { title: "See history", body: "Click a name to see all their sales, totals and unpaid invoices." },
    ],
  },
  {
    id: "customer",
    title: "Customer details",
    path: "/customers",
    summary: "One customer's sales, spend and unpaid invoices.",
    steps: [
      { title: "Review purchases", body: "Every sale with its date, total and payment status." },
      { title: "Chase unpaid invoices", body: "The unpaid total and list show what's still owed." },
    ],
  },
  {
    id: "suppliers",
    title: "Suppliers",
    path: "/suppliers",
    summary: "Who you buy stock from, with their lots and units.",
    steps: [
      { title: "Add a supplier", body: "Enter name and contact details — or add one with + while creating a lot." },
      { title: "Review", body: "See how many lots and units each supplier has provided." },
      { title: "Archive", body: "Archiving hides a supplier you no longer use; it's recoverable for 30 days." },
    ],
  },
  {
    id: "expenses",
    title: "Expenses",
    path: "/expenses",
    summary: "Operating costs outside a lot's landed cost — rent, utilities, repairs.",
    steps: [
      { title: "Record an expense", body: "Pick a category, amount, date and description; attach a receipt if you have one." },
      { title: "Link it to an item", body: "Optionally link a repair or similar cost to a phone or accessory — it then shows in that item's cost breakdown." },
      { title: "Find expenses", body: "Search by category or description." },
    ],
  },
  {
    id: "taxPayments",
    title: "Tax Payments",
    path: "/tax-payments",
    summary: "A log of tax payments with receipts.",
    steps: [
      { title: "Log a payment", body: "Enter the period, amount and paid date, and attach the receipt file." },
      { title: "Reopen receipts", body: "Stored receipts can be opened again from the table." },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    path: "/reports",
    access: "Admins and managers",
    summary: "Profit & loss, cost of goods, inventory valuation, receivables and payables.",
    steps: [
      { title: "Pick a date range", body: "Most figures follow the From/To range. Receivables/Payables and Inventory Valuation are always as of right now." },
      { title: "Read the P&L", body: "Revenue, cost of goods (phones and accessories), gross profit, expenses, tax and refunds, ending in net profit and margin." },
      { title: "Trends and best sellers", body: "Charts show revenue/profit over time and what sold most." },
      { title: "Export", body: "Download Report exports the current range." },
    ],
  },
  {
    id: "recycleBin",
    title: "Recycle Bin",
    path: "/recycle-bin",
    access: "Admins and managers",
    summary: "Recover anything deleted in the last 30 days.",
    steps: [
      { title: "Find the item", body: "Everything deleted in the last 30 days is listed, newest first; filter by type with the chips. \"Permanently deleted in\" counts down the days left." },
      { title: "Check for problems first", body: "If something would block the restore — e.g. its lot or variant is still deleted, or its IMEI is now used by another unit — it's listed under the item in red." },
      { title: "Fix and restore", body: "Use the \"Go to …\" link to jump to the blocking item and \"Why & how to fix\" for the steps, then press Restore. Restoring a lot or model also brings back what was deleted with it." },
    ],
    tips: ["After 30 days records are removed permanently — unless sales history still needs them."],
  },
  {
    id: "errorLog",
    title: "Error Log",
    path: "/error-log",
    access: "Admins and managers",
    summary: "Every crash or failed save, recorded automatically with what was happening at the time.",
    steps: [
      { title: "What gets recorded", body: "Failed saves (sales, payments, lots, quotations, returns, expenses), page crashes and browser errors — with the user, page, time, how long it ran, a safe summary of the submitted data (passwords are never stored) and the technical details." },
      { title: "Find a problem", body: "Open errors are listed first; repeats of the same failure are grouped with a ×count. Expand Details for developers to see the submitted data and stack trace." },
      { title: "Match a report", body: "When something fails, the screen shows a reference (e.g. 4PIAGTKW) — the same reference appears in the error message here." },
      { title: "Hand off and close", body: "Export JSON downloads the open errors for a developer. Once fixed, Mark resolved (with a note); it can be reopened if it happens again." },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    path: "/settings",
    summary: "Users and roles, your password, backups and the activity log.",
    steps: [
      { title: "Users & roles", body: "Admins create users and set their role: admin (everything), manager (costs, reports, deletes) or staff (day-to-day selling)." },
      { title: "Passwords", body: "Change your own password, or (admins) reset someone else's." },
      { title: "Backups", body: "Admins can export the whole database as a file and import it again." },
      { title: "Activity log", body: "Recent actions such as password changes, restores and imports." },
    ],
    access: "Most actions are admin-only",
  },
  {
    id: "help",
    title: "Help & tutorials",
    path: "/help",
    summary: "Every page's guide, common questions and how to get support.",
    steps: [
      { title: "Open a page's tutorial", body: "Every page has a \"How to use this page\" button in its header. This page collects them all in one place." },
      { title: "Field help", body: "The small (i) icons next to section titles explain that section." },
    ],
  },
];

const ROUTES: [RegExp, string][] = [
  [/^\/dashboard/, "dashboard"],
  [/^\/lots\/[^/]+/, "lot"],
  [/^\/lots/, "lots"],
  [/^\/items\/phones\/variants\//, "variant"],
  [/^\/items\/phones\/price-history/, "priceHistory"],
  [/^\/items\/phones/, "phones"],
  [/^\/items\/phone-catalog/, "catalog"],
  [/^\/items\/(chargers|cables|handsfree|other)/, "accessories"],
  [/^\/sales\/[^/]+/, "sale"],
  [/^\/sales/, "sales"],
  [/^\/returns/, "returns"],
  [/^\/quotations\/[^/]+/, "quotation"],
  [/^\/quotations/, "quotations"],
  [/^\/customers\/[^/]+/, "customer"],
  [/^\/customers/, "customers"],
  [/^\/suppliers/, "suppliers"],
  [/^\/expenses/, "expenses"],
  [/^\/tax-payments/, "taxPayments"],
  [/^\/reports/, "reports"],
  [/^\/recycle-bin/, "recycleBin"],
  [/^\/settings/, "settings"],
  [/^\/error-log/, "errorLog"],
  [/^\/help/, "help"],
];

export function tutorialForPath(pathname: string): Tutorial | null {
  const match = ROUTES.find(([pattern]) => pattern.test(pathname));
  return match ? TUTORIALS.find((tutorial) => tutorial.id === match[1]) ?? null : null;
}
