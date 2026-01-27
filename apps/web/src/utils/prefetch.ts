export function prefetchImage(src: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = src;
}
