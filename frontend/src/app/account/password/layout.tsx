import type { Metadata } from "next";

export const metadata: Metadata = { title: "Change password" };

export default function PasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
