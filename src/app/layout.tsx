import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Cici — Your AI knowledge vault",
  description:
    "Save it. Understand it. Build on it. Cici is your personal AI-powered knowledge vault — save articles, PDFs, and notes, then chat with everything you've saved.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  );
}
