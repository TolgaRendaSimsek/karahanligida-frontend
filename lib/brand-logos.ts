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
  "Coffe Hill": {
    src: "/brands/coffe-hill-official.webp",
    sourceUrl: "https://www.kahvealemi.com.tr/tr/markalar",
  },
  "De Lucca": {
    src: "/brands/delucca-official.webp",
    sourceUrl: "https://www.delucca.com.tr/",
  },
  "Favori Fresh": {
    src: "/brands/favori-fresh-official.webp",
    sourceUrl: "https://favorifresh.com/",
  },
  FO: {
    src: "/brands/fo-official.webp",
    sourceUrl: "https://www.ozmer.com/",
  },
  "Güzel Çay": {
    src: "/brands/guzel-cay-official.webp",
    sourceUrl: "https://www.guzelcay.com.tr/",
  },
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
  "Monte Cristo": {
    src: "/brands/monte-cristo-official.webp",
    sourceUrl: "https://montecristoflavour.com/",
  },
  Morning: {
    src: "/brands/morning-official.webp",
    sourceUrl: "https://www.kahvealemi.com.tr/tr/markalar",
  },
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
