/**
 * Brand marks used by the public “Markalarımız” section.
 *
 * A logo asset is only included when it came from the brand or an authorised
 * brand page.  For brands without a trustworthy digital logo, the UI falls
 * back to a typographic wordmark rather than showing an unrelated favicon.
 */
export type BrandLogo = {
  src?: string;
  sourceUrl?: string;
  darkFrame?: boolean;
  wordmark?: string;
};

export const brandLogos: Record<string, BrandLogo> = {
  "Cafe Hill": { wordmark: "CAFE HILL" },
  "Coffe Hill": { wordmark: "COFFE HILL" },
  "De Lucca": { wordmark: "DE LUCCA" },
  "Favori Fresh": {
    src: "/brands/favori-fresh-official.webp",
    sourceUrl: "https://favorifresh.com/",
  },
  FO: { wordmark: "FO" },
  "Güzel Çay": { wordmark: "GÜZEL ÇAY" },
  Kimbo: {
    src: "/brands/kimbo-official.svg",
    sourceUrl: "https://kimbo.it/",
  },
  Kroom: {
    src: "/brands/kroom-official.png",
    sourceUrl: "https://www.krommutfak.com.tr/",
  },
  Lugano: { wordmark: "LUGANO", sourceUrl: "https://www.luganocaffe.it/en/" },
  Miskin: { wordmark: "MİSKİN" },
  "Monte Cristo": { wordmark: "MONTE CRISTO" },
  Morning: { wordmark: "MORNING" },
  Repo: { wordmark: "REPO" },
  Toschi: {
    src: "/brands/toschi-official.svg",
    sourceUrl: "https://www.toschi.it/",
  },
  YOOK: {
    src: "/brands/yook-official.png",
    sourceUrl: "https://yook.eu/",
  },
};

export function getBrandLogo(brand: string): BrandLogo {
  return brandLogos[brand] ?? { wordmark: brand.toUpperCase() };
}
