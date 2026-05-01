import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "League OS",
    short_name: "LeagueOS",
    description: "White-label football league platform with live scores, admin panel, Telegram bot and Mini App.",
    start_url: "/",
    display: "standalone",
    background_color: "#07110d",
    theme_color: "#07110d",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
