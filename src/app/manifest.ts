import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Workout",
    short_name: "Workout",
    description: "Track workouts in the browser.",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#252525",
    theme_color: "#252525",
    categories: ["health", "fitness", "productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [
      {
        src: "/splash/apple-splash-1170x2532.png",
        sizes: "1170x2532",
        type: "image/png",
        form_factor: "narrow",
        label: "Workout splash screen",
      },
    ],
  };
}
