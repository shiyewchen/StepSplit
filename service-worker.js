const CACHE_NAME = "stepsplit-v27";
const OCR_CACHE_NAME = "stepsplit-ocr-v1";
const APP_FILES = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./vendor/tesseract/tesseract.min.js",
  "./vendor/tesseract/worker.min.js",
  "./vendor/pdfjs/pdf.min.mjs",
  "./vendor/pdfjs/pdf.worker.min.mjs",
  "./vendor/pdfjs/LICENSE",
];
const OCR_FILES = [
  "./vendor/tesseract/core/tesseract-core-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-lstm.wasm",
  "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm.js",
  "./vendor/tesseract/core/tesseract-core-simd-lstm.wasm",
  "./vendor/tesseract/lang/eng.traineddata.gz",
];

const cacheOcrFiles = async () => {
  const cache = await caches.open(OCR_CACHE_NAME);
  const missingFiles = [];
  for (const file of OCR_FILES) {
    if (!(await cache.match(file))) missingFiles.push(file);
  }
  if (missingFiles.length) await cache.addAll(missingFiles);
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_FILES))
      .then(() => cacheOcrFiles().catch((error) => {
        console.error("Could not precache local OCR files:", error);
      })),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name !== CACHE_NAME && name !== OCR_CACHE_NAME)
        .map((name) => caches.delete(name)),
    )),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => cached || fetch(request).then((response) => {
      if (response.ok) {
        event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())));
      }
      return response;
    })),
  );
});
