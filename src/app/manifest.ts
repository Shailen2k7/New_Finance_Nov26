import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Migrizo Finance",
    short_name: "Migrizo",
    description: "Income, expenses, loans and reports for Migrizo.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f3f5f2",
    theme_color: "#ffffff",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add transaction", short_name: "Add", url: "/transactions?new=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Transactions", url: "/transactions", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Reports", url: "/reports", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Import statement", short_name: "Import", url: "/import", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
