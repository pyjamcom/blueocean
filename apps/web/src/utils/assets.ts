const assetGlob = import.meta.glob("../../../../assets/*.svg", { eager: true, as: "url" });

const assetById = Object.entries(assetGlob).reduce<Record<string, string>>((acc, [path, url]) => {
  const filename = path.split("/").pop();
  if (!filename) return acc;
  const id = filename.replace(".svg", "");
  acc[id] = url as string;
  return acc;
}, {});

export const assetIds = Object.keys(assetById);

export function getAssetUrl(id?: string, fallback = "/icons/icon-192.svg") {
  if (!id) return fallback;
  return assetById[id] ?? fallback;
}

export function resolveAssetRef(ref?: string, fallback = "/icons/icon-192.svg") {
  if (!ref) return fallback;
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    return ref;
  }
  return getAssetUrl(ref, fallback);
}
