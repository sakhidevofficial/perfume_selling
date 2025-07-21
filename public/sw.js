const STATIC_CACHE = "static-v1";
const DYNAMIC_CACHE = "dynamic-v1";

// Files to cache for offline functionality
const STATIC_FILES = [
  "/",
  "/manifest.json",
  "/offline.html",
  "/api/products",
  "/api/orders",
  "/admin/dashboard",
  "/admin/products",
  "/admin/orders",
  "/admin/users",
  "/products",
  "/orders",
];

// Install event - cache static files
self.addEventListener("install", (event) => {
  console.log("Service Worker: Installing...");

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("Service Worker: Caching static files");
        return cache.addAll(STATIC_FILES);
      })
      .then(() => {
        console.log("Service Worker: Static files cached");
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("Service Worker: Cache failed", error);
      }),
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("Service Worker: Activating...");

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => {
            if (cacheName !== STATIC_CACHE && cacheName !== DYNAMIC_CACHE) {
              console.log("Service Worker: Deleting old cache", cacheName);
              return caches.delete(cacheName);
            }
          }),
        );
      })
      .then(() => {
        console.log("Service Worker: Activated");
        return self.clients.claim();
      }),
  );
});

// Fetch event - handle requests
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // Handle API requests
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(handleApiRequest(request));
    return;
  }

  // Handle static files
  if (request.destination === "document") {
    event.respondWith(handlePageRequest(request));
    return;
  }

  // Handle other static assets
  event.respondWith(handleStaticRequest(request));
});

// Handle API requests with network-first strategy
async function handleApiRequest(request) {
  try {
    // Try network first
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      // Cache successful responses
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch {
    console.log("Service Worker: Network failed for API request", request.url);
  }

  // Fallback to cache
  const cachedResponse = await caches.match(request);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Return offline response for API requests
  return new Response(
    JSON.stringify({
      error: "Offline mode - data not available",
      offline: true,
    }),
    {
      status: 503,
      headers: { "Content-Type": "application/json" },
    },
  );
}

// Handle page requests with cache-first strategy
async function handlePageRequest(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch {
    console.log("Service Worker: Network failed for page request", request.url);
  }

  // Return offline page
  return caches.match("/offline.html");
}

// Handle static asset requests with cache-first strategy
async function handleStaticRequest(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    if (networkResponse.ok) {
      const cache = await caches.open(DYNAMIC_CACHE);
      cache.put(request, networkResponse.clone());
      return networkResponse;
    }
  } catch {
    console.log("Service Worker: Network failed for static request", request.url);
  }

  // Return a default response for failed static requests
  return new Response("Offline", { status: 503 });
}

// Background sync for offline actions
self.addEventListener("sync", (event) => {
  console.log("Service Worker: Background sync triggered", event.tag);

  if (event.tag === "background-sync") {
    event.waitUntil(performBackgroundSync());
  }
});

// Perform background sync
async function performBackgroundSync() {
  try {
    // Get stored offline actions
    const offlineActions = await getOfflineActions();

    for (const action of offlineActions) {
      try {
        const response = await fetch(action.url, {
          method: action.method,
          headers: action.headers,
          body: action.body,
        });

        if (response.ok) {
          // Remove successful action from storage
          await removeOfflineAction(action.id);
          console.log("Service Worker: Background sync successful for", action.url);
        }
      } catch (error) {
        console.error("Service Worker: Background sync failed for", action.url, error);
      }
    }
  } catch (error) {
    console.error("Service Worker: Background sync error", error);
  }
}

// Store offline action for background sync
async function storeOfflineAction(action) {
  const actions = await getOfflineActions();
  actions.push({
    id: Date.now().toString(),
    ...action,
    timestamp: Date.now(),
  });

  localStorage.setItem("offline-actions", JSON.stringify(actions));
}

// Get stored offline actions
async function getOfflineActions() {
  try {
    const stored = localStorage.getItem("offline-actions");
    return stored ? JSON.parse(stored) : [];
  } catch (error) {
    console.error("Service Worker: Error getting offline actions", error);
    return [];
  }
}

// Remove offline action
async function removeOfflineAction(actionId) {
  const actions = await getOfflineActions();
  const filtered = actions.filter((action) => action.id !== actionId);
  localStorage.setItem("offline-actions", JSON.stringify(filtered));
}

// Push notification handling
self.addEventListener("push", (event) => {
  console.log("Service Worker: Push notification received");

  const options = {
    body: event.data ? event.data.text() : "Nieuwe melding van Project X",
    icon: "/icons/icon-192x192.png",
    badge: "/icons/icon-72x72.png",
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1,
    },
    actions: [
      {
        action: "explore",
        title: "Bekijk",
        icon: "/icons/icon-72x72.png",
      },
      {
        action: "close",
        title: "Sluiten",
        icon: "/icons/icon-72x72.png",
      },
    ],
  };

  event.waitUntil(self.registration.showNotification("Project X", options));
});

// Notification click handling
self.addEventListener("notificationclick", (event) => {
  console.log("Service Worker: Notification clicked");

  event.notification.close();

  if (event.action === "explore") {
    event.waitUntil(clients.openWindow("/"));
  }
});

// Message handling for communication with main thread
self.addEventListener("message", (event) => {
  console.log("Service Worker: Message received", event.data);

  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }

  if (event.data && event.data.type === "STORE_OFFLINE_ACTION") {
    storeOfflineAction(event.data.action);
  }
});
