import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "1triple9 Club — Because ₹2,000 apparently changed everything",
  description:
    "Make UPI QR codes for a collection, split into payments of ₹1,999 or less. Generated in your browser.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
