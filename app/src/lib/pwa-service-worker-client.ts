import { toast } from "sonner";

const SW_URL = "/sw.js";
const UPDATE_CHECK_MS = 60 * 60 * 1000;

let updateToastShown = false;
let reloadPending = false;

function isProductionBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    process.env.NODE_ENV === "production" &&
    "serviceWorker" in navigator
  );
}

function promptReload(registration: ServiceWorkerRegistration): void {
  if (updateToastShown) return;
  const waiting = registration.waiting;
  if (!waiting) return;
  updateToastShown = true;

  toast("Versi baru tersedia", {
    description: "Muat ulang untuk memakai build terbaru.",
    duration: Number.POSITIVE_INFINITY,
    action: {
      label: "Muat ulang",
      onClick: () => {
        reloadPending = true;
        waiting.postMessage({ type: "SKIP_WAITING" });
      },
    },
  });
}

function watchInstallingWorker(
  worker: ServiceWorker,
  registration: ServiceWorkerRegistration
): void {
  worker.addEventListener("statechange", () => {
    if (worker.state === "installed" && navigator.serviceWorker.controller) {
      promptReload(registration);
    }
  });
}

async function checkForServiceWorkerUpdate(
  registration: ServiceWorkerRegistration
): Promise<void> {
  try {
    await registration.update();
  } catch {
    /* offline / blocked */
  }
  if (registration.waiting && navigator.serviceWorker.controller) {
    promptReload(registration);
  }
}

export async function registerPwaServiceWorker(): Promise<void> {
  if (!isProductionBrowser()) return;

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!reloadPending) return;
    window.location.reload();
  });

  try {
    const registration = await navigator.serviceWorker.register(SW_URL, {
      scope: "/",
    });

    if (registration.installing) {
      watchInstallingWorker(registration.installing, registration);
    }

    registration.addEventListener("updatefound", () => {
      const installing = registration.installing;
      if (installing) watchInstallingWorker(installing, registration);
    });

    if (registration.waiting && navigator.serviceWorker.controller) {
      promptReload(registration);
    }

    void checkForServiceWorkerUpdate(registration);

    window.setInterval(() => {
      void checkForServiceWorkerUpdate(registration);
    }, UPDATE_CHECK_MS);

    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        void checkForServiceWorkerUpdate(registration);
      }
    });
  } catch {
    /* registration blocked or unsupported context */
  }
}
