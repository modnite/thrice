import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "THRICE Admin", template: "%s | THRICE Admin" },
  description: "Self-hosted rental commerce backend",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
