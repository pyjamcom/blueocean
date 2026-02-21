import memesManifest from "../../../../data/memes_manifest.json";

const assetGlob = import.meta.glob("../../../../assets/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
});

const assetById = Object.entries(assetGlob).reduce<Record<string, string>>((acc, [path, url]) => {
  const filename = path.split("/").pop();
  if (!filename) return acc;
  const id = filename.replace(".svg", "");
  acc[id] = url as string;
  return acc;
}, {});

export const assetIds = Object.keys(assetById);

const memeById = Array.isArray(memesManifest?.items)
  ? (memesManifest.items as Array<{ id: string; public_path?: string }>).reduce<Record<string, string>>(
      (acc, item) => {
        if (item.id && item.public_path) {
          acc[item.id] = item.public_path;
        }
        return acc;
      },
      {},
    )
  : {};

export function getAssetUrl(id?: string, fallback = "/icons/icon-192.svg") {
  if (!id) return fallback;
  return assetById[id] ?? fallback;
}

export function resolveAssetRef(ref?: string, fallback = "/icons/icon-192.svg") {
  if (!ref) return fallback;
  if (ref.startsWith("http://") || ref.startsWith("https://")) {
    return ref;
  }
  if (memeById[ref]) {
    return memeById[ref];
  }
  return getAssetUrl(ref, fallback);
}
