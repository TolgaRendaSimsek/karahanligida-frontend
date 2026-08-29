import type { Metadata } from "next";
import "./globals.css";

const siteUrl = process.env.SITE_URL || "https://karahanligida.com";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Karahanlı Gıda | Profesyonel HORECA Dağıtım",
    template: "%s | Karahanlı Gıda",
  },
  description:
    "Kahve, çay, içecek ürünleri ve profesyonel mutfak ekipmanları için Karahanlı Gıda ürün kataloğu.",
  applicationName: "Karahanlı Gıda",
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png",
  },
  openGraph: {
    type: "website",
    locale: "tr_TR",
    siteName: "Karahanlı Gıda",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>
        {children}
      </body>
    </html>
  );
}
