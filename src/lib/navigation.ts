export type NavLinkItem = {
  href: string;
  label: string;
};

export type NavItem = NavLinkItem & {
  children?: NavLinkItem[];
};

export const navItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard" },
  {
    href: "/items/phones",
    label: "Items",
    children: [
      { href: "/items/phones", label: "Phones" },
      { href: "/items/phone-catalog", label: "Phone Catalog" },
      { href: "/items/chargers", label: "Chargers" },
      { href: "/items/cables", label: "Cables" },
      { href: "/items/handsfree", label: "Handsfree" },
      { href: "/items/other", label: "Other" },
    ],
  },
  { href: "/lots", label: "Lots" },
  { href: "/sales", label: "Sales" },
  { href: "/returns", label: "Returns" },
  { href: "/quotations", label: "Quotations" },
  { href: "/customers", label: "Customers" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/expenses", label: "Expenses" },
  { href: "/tax-payments", label: "Tax Payments" },
  { href: "/reports", label: "Reports" },
  { href: "/settings", label: "Settings" },
];
