import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  trailingSlash: false,
  images: {
    unoptimized: true,
  },
  async redirects() {
    return [
      { source: "/index.html", destination: "/", permanent: true },
      { source: "/products.html", destination: "/urunler", permanent: true },
      { source: "/favorites.html", destination: "/favoriler", permanent: true },
      { source: "/account.html", destination: "/iletisim", permanent: true },
      { source: "/register.html", destination: "/iletisim", permanent: true },
      { source: "/admin.html", destination: "/admin", permanent: true },
      {
        source: "/urunler/:slug.html",
        destination: "/urunler/:slug",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
