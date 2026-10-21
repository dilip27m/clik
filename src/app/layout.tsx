import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", display: "swap", weight: ["500", "600", "700"] });

export const metadata: Metadata = {
  title: "Bill Book · Sri Lalithha Pulverisers",
  description: "Scan bills, check them, and keep the Google Sheet up to date.",
  applicationName: "Bill Book",
  icons: {
    icon: [{ url: "/favicon.svg?v=2", type: "image/svg+xml" }, { url: "/icon-any-192.png?v=2", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png?v=2", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Bill Book" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: "#f8f1e6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

// Registers the service worker (offline page, fast start, "share to Bill Book")
// and keeps the browser's "install app" offer for the Install button on Home.
const PWA_BOOT = `
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  addEventListener('load', function () { navigator.serviceWorker.register('/sw.js').catch(function () {}); });
}
addEventListener('beforeinstallprompt', function (e) {
  e.preventDefault();
  window.__installPrompt = e;
  dispatchEvent(new Event('billbook:installable'));
});
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="min-h-full">
        {children}
        <script dangerouslySetInnerHTML={{ __html: PWA_BOOT }} />
      </body>
    </html>
  );
}
