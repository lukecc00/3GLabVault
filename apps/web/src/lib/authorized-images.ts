"use client";

import { fetchApiBlob } from "@/lib/api";
import { isKnowledgeAssetImageUrl } from "@/lib/markdown";

const TRANSPARENT_IMAGE_DATA_URL =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==";

const AUTH_IMAGE_SELECTOR = "img";
const AUTH_IMAGE_LOADED_ATTR = "data-auth-loaded-src";
const AUTH_IMAGE_LOADING_ATTR = "data-auth-loading";

function markImageLoadFailure(image: HTMLImageElement) {
  const currentAlt = image.getAttribute("alt") || "图片";

  if (!currentAlt.endsWith("（加载失败）")) {
    image.setAttribute("alt", `${currentAlt}（加载失败）`);
  }
}

function clearImageLoadFailure(image: HTMLImageElement) {
  const currentAlt = image.getAttribute("alt") || "";

  if (currentAlt.endsWith("（加载失败）")) {
    image.setAttribute("alt", currentAlt.slice(0, -"（加载失败）".length));
  }
}

export function hydrateAuthorizedImages(container: HTMLElement) {
  let disposed = false;
  const controllers = new Map<HTMLImageElement, AbortController>();
  const objectUrls = new Map<HTMLImageElement, string>();

  function revokeObjectUrl(image: HTMLImageElement) {
    const currentObjectUrl = objectUrls.get(image);

    if (currentObjectUrl) {
      URL.revokeObjectURL(currentObjectUrl);
      objectUrls.delete(image);
    }
  }

  function loadImage(image: HTMLImageElement) {
    const attributeSrc = image.getAttribute("src")?.trim() ?? "";
    const authSrc = image.dataset.authSrc?.trim()
      || (isKnowledgeAssetImageUrl(attributeSrc) ? attributeSrc : "");

    if (!authSrc || image.dataset.authLoading === "true") {
      return;
    }

    if (image.getAttribute(AUTH_IMAGE_LOADED_ATTR) === authSrc && image.src) {
      return;
    }

    image.setAttribute(AUTH_IMAGE_LOADING_ATTR, "true");
    image.src = TRANSPARENT_IMAGE_DATA_URL;
    clearImageLoadFailure(image);
    revokeObjectUrl(image);
    controllers.get(image)?.abort();

    const controller = new AbortController();
    controllers.set(image, controller);

    void (async () => {
      try {
        const blob = await fetchApiBlob(authSrc, { signal: controller.signal });

        if (disposed || !image.isConnected || controller.signal.aborted) {
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        revokeObjectUrl(image);
        objectUrls.set(image, objectUrl);
        image.src = objectUrl;
        image.setAttribute(AUTH_IMAGE_LOADED_ATTR, authSrc);
      } catch {
        if (disposed || !image.isConnected || controller.signal.aborted) {
          return;
        }

        markImageLoadFailure(image);
      } finally {
        if (!disposed && image.isConnected) {
          image.removeAttribute(AUTH_IMAGE_LOADING_ATTR);
        }
      }
    })();
  }

  const images = Array.from(container.querySelectorAll<HTMLImageElement>(AUTH_IMAGE_SELECTOR));

  for (const image of images) {
    loadImage(image);
  }

  return () => {
    disposed = true;

    for (const controller of controllers.values()) {
      controller.abort();
    }

    for (const objectUrl of objectUrls.values()) {
      URL.revokeObjectURL(objectUrl);
    }
  };
}
