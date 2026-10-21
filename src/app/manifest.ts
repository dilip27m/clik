import type { MetadataRoute } from "next";

// Makes Bill Book installable on the phone's home screen, opening full screen.
// share_target lets a bill photo be shared straight from WhatsApp or Gallery.
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Bill Book — Sri Lalithha Pulverisers",
    short_name: "Bill Book",
    description: "Scan bills, check them, and keep the Google Sheet up to date.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f8f1e6",
    theme_color: "#f8f1e6",
    categories: ["business", "productivity"],
    icons: [
      { src: "/icon-any-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-any-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-192.png?v=2", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Scan a bill", short_name: "Scan", url: "/scan", icons: [{ src: "/icon-any-192.png?v=2", sizes: "192x192" }] },
      { name: "Bills", url: "/bills", icons: [{ src: "/icon-any-192.png?v=2", sizes: "192x192" }] },
    ],
    share_target: {
      action: "/share-target",
      method: "POST",
      enctype: "multipart/form-data",
      params: { title: "title", text: "text", files: [{ name: "photos", accept: ["image/*"] }] },
    },
  };
}
