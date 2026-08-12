import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tenant detail" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
