export type DefaultCategory = { name: string; type: "INCOME" | "EXPENSE"; color: string; icon: string };

export const DEFAULT_CATEGORIES: DefaultCategory[] = [
  // Income
  { name: "Client Fees", type: "INCOME", color: "#2f7a5c", icon: "briefcase" },
  { name: "Consultation Fees", type: "INCOME", color: "#4f9d83", icon: "message-square" },
  { name: "Retainers", type: "INCOME", color: "#6f9bb3", icon: "repeat" },
  { name: "Partner Commissions", type: "INCOME", color: "#8b7fb0", icon: "handshake" },
  { name: "Refunds Received", type: "INCOME", color: "#5fa8a0", icon: "rotate-ccw" },
  { name: "Interest Income", type: "INCOME", color: "#86a85f", icon: "percent" },
  { name: "Loan Received", type: "INCOME", color: "#d9a25c", icon: "landmark" },
  { name: "Owner Investment", type: "INCOME", color: "#c98a6b", icon: "piggy-bank" },
  { name: "Other Income", type: "INCOME", color: "#94a39b", icon: "plus-circle" },
  // Expenses
  { name: "Salaries & Contractors", type: "EXPENSE", color: "#3f8f6e", icon: "users" },
  { name: "Staff Reimbursements", type: "EXPENSE", color: "#7fb59b", icon: "wallet" },
  { name: "Software & Subscriptions", type: "EXPENSE", color: "#5b84b1", icon: "monitor" },
  { name: "Marketing & Ads", type: "EXPENSE", color: "#e08a3c", icon: "megaphone" },
  { name: "Government & Visa Fees", type: "EXPENSE", color: "#c9a227", icon: "file-badge" },
  { name: "Legal & Professional", type: "EXPENSE", color: "#8e7cc3", icon: "scale" },
  { name: "Office & Rent", type: "EXPENSE", color: "#b58863", icon: "building" },
  { name: "Travel", type: "EXPENSE", color: "#4fa3a8", icon: "plane" },
  { name: "Meals & Entertainment", type: "EXPENSE", color: "#e0b15a", icon: "utensils" },
  { name: "Bank Fees & Charges", type: "EXPENSE", color: "#9aa5a0", icon: "landmark" },
  { name: "Loan Repayment", type: "EXPENSE", color: "#c96f5b", icon: "credit-card" },
  { name: "Taxes", type: "EXPENSE", color: "#b85c50", icon: "receipt" },
  { name: "Insurance", type: "EXPENSE", color: "#6a9fb5", icon: "shield" },
  { name: "Utilities & Telecom", type: "EXPENSE", color: "#a9b35a", icon: "wifi" },
  { name: "Equipment", type: "EXPENSE", color: "#7d8f69", icon: "laptop" },
  { name: "Education & Training", type: "EXPENSE", color: "#6fb0c4", icon: "graduation-cap" },
  { name: "Client Refunds", type: "EXPENSE", color: "#d98e7a", icon: "rotate-ccw" },
  { name: "Owner Drawings", type: "EXPENSE", color: "#a67c9e", icon: "wallet" },
  { name: "Other Expenses", type: "EXPENSE", color: "#b0b7b2", icon: "more-horizontal" },
];
