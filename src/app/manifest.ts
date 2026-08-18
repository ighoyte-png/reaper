import type { MetadataRoute } from "next";

function pwaOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (raw) {
    try {
      return new URL(raw).origin;
    } catch {
      /* fall through */
    }
  }
  return "https://app.reaperpm.com";
}

export default function manifest(): MetadataRoute.Manifest {
  const origin = pwaOrigin();

  return {
    id: "/",
    name: "Reaper",
    short_name: "Reaper",
    description: "Project Management That Doesn't Get in Your Way.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#111111",
    theme_color: "#111111",
    launch_handler: {
      client_mode: ["navigate-new", "auto"],
    },
    capture_links: "new-client",
    url_handlers: [{ origin }],
    icons: [
      {
        src: "/pwa-icons/192",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icons/512",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/pwa-icons/192?maskable=1",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  } as MetadataRoute.Manifest;
}
