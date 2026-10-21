"use client";

// Photos shared into Bill Book (WhatsApp / Gallery → Share → Bill Book) are
// parked by the service worker in this cache. Take them out once.
const SHARE_CACHE = "bill-book-share";

export async function takeSharedPhotos(): Promise<File[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(SHARE_CACHE);
  const keys = await cache.keys();
  const files: File[] = [];
  for (const key of keys) {
    const res = await cache.match(key);
    if (res) {
      const blob = await res.blob();
      const name = decodeURIComponent(res.headers.get("X-File-Name") || "bill.jpg");
      files.push(new File([blob], name, { type: blob.type || "image/jpeg" }));
    }
    await cache.delete(key);
  }
  return files;
}
