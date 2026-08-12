import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/providers/AuthProvider";
import { RealtimeAuthBridge } from "@/providers/RealtimeProvider";
import { ThemeProvider } from "@/providers/ThemeProvider";
import { SWRProvider } from "@/providers/SWRProvider";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-plus-jakarta",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "MAAS",
    template: "%s | MAAS",
  },
  description: "MAAS Dashboard Pro — Monitoring as a Service by ZTC",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={`${plusJakarta.variable} font-sans antialiased`}>
        <ThemeProvider>
          <SWRProvider>
            <AuthProvider>
              <RealtimeAuthBridge>{children}</RealtimeAuthBridge>
            </AuthProvider>
          </SWRProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
