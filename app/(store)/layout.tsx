import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { QuoteDrawer } from "@/components/quote-drawer";
import { StoreProvider } from "@/components/store-provider";

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreProvider
      siteUrl={process.env.SITE_URL || "https://karahanligida.com"}
      whatsappNumber={process.env.WHATSAPP_NUMBER || ""}
    >
      <Suspense fallback={<div className="header-placeholder" />}>
        <SiteHeader />
      </Suspense>
      {children}
      <SiteFooter />
      <QuoteDrawer />
    </StoreProvider>
  );
}
