import { useEffect, useState } from "react";
import { getBlob, type BlobVariant } from "@/db";
import type { ID } from "@/types/project";

/**
 * Object URLs for small blobs (thumbnails, originals for media elements).
 * Thumbnails stay cached for the session; they are tiny.
 */
const urls = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

export function getBlobUrl(id: ID, variant: BlobVariant): Promise<string | null> {
  const key = `${id}:${variant}`;
  const hit = urls.get(key);
  if (hit) return Promise.resolve(hit);
  let p = pending.get(key);
  if (!p) {
    p = getBlob(id, variant).then((b) => {
      pending.delete(key);
      if (!b) return null;
      const u = URL.createObjectURL(b);
      urls.set(key, u);
      return u;
    });
    pending.set(key, p);
  }
  return p;
}

export function peekBlobUrl(id: ID, variant: BlobVariant): string | undefined {
  return urls.get(`${id}:${variant}`);
}

export function releaseBlobUrl(id: ID, variant: BlobVariant) {
  const key = `${id}:${variant}`;
  const u = urls.get(key);
  if (u) {
    URL.revokeObjectURL(u);
    urls.delete(key);
  }
}

export function useThumb(id: ID | null | undefined, variant: BlobVariant = "thumb"): string | undefined {
  const [url, setUrl] = useState<string | undefined>(() => (id ? peekBlobUrl(id, variant) : undefined));
  useEffect(() => {
    if (!id) {
      setUrl(undefined);
      return;
    }
    const cached = peekBlobUrl(id, variant);
    if (cached) {
      setUrl(cached);
      return;
    }
    let alive = true;
    void getBlobUrl(id, variant).then((u) => {
      if (alive && u) setUrl(u);
    });
    return () => {
      alive = false;
    };
  }, [id, variant]);
  return url;
}
