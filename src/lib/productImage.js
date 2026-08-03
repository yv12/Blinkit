/**
 * Local product photos. Full JPG/WebP is the reliable default.
 */
import localPhotos from "../../data/local_photos.json";
import cardThumbs from "../../data/card_thumbs.json";

function productId(productOrId) {
  return typeof productOrId === "string"
    ? productOrId
    : productOrId?.product_id || productOrId?.id;
}

/** True when we have a real photo (not a placeholder SVG). */
export function hasRealLocalPhoto(productOrId) {
  const id = productId(productOrId);
  if (!id) return false;
  const url = localPhotos[id];
  if (!url) return false;
  return !String(url).toLowerCase().includes(".svg");
}

/** Full-size photo path (preferred for reliability). */
export function productImageUrl(productOrId, fallbackUrl) {
  const id = productId(productOrId);
  if (id && localPhotos[id] && !String(localPhotos[id]).toLowerCase().includes(".svg")) {
    return localPhotos[id];
  }
  const url =
    fallbackUrl ||
    (typeof productOrId === "object" && (productOrId?.image_url || productOrId?.image)) ||
    null;
  if (
    url &&
    !String(url).includes("/thumbs/") &&
    !String(url).toLowerCase().includes(".svg")
  ) {
    return url;
  }
  if (id && localPhotos[id]) return localPhotos[id];
  if (id) return `/images/${id}.jpg`;
  return "";
}

/** Optional small thumb; falls back to full photo. */
export function cardImageUrl(productOrId, fallbackUrl) {
  const id = productId(productOrId);
  if (id && cardThumbs[id]) return cardThumbs[id];
  return productImageUrl(productOrId, fallbackUrl);
}

export function withLocalPhoto(item) {
  if (!item) return item;
  const id = item.product_id || item.id;
  const image_url = productImageUrl(id, item.image_url || item.image);
  return { ...item, image_url };
}
