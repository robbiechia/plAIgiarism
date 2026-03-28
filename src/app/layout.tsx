import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PlagiarAI — Intelligent Plagiarism Detection",
  description:
    "Detect plagiarism across blogs, research, songs, videos, and more using AI-powered web search.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased min-h-screen" style={{ background: "var(--bg)" }}>
        {children}
      </body>
    </html>
  );
}
