import "./globals.css";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";

export const metadata = {
  title: "The Hive Trophy Race",
  description: "Monthly trophy gain leaderboard for The Hive Brawl Stars club.",
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/brawl-stars-icon.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/brawl-stars-icon.png", sizes: "192x192", type: "image/png" }]
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
