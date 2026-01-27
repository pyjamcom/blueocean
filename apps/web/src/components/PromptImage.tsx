import { useEffect, useMemo, useRef, useState } from "react";
import styles from "./PromptImage.module.css";

export interface PromptImageProps {
  src: string;
  fallbackSrc?: string;
  fit?: "cover" | "contain";
  ariaLabel?: string;
}

export default function PromptImage({
  src,
  fallbackSrc,
  fit = "contain",
  ariaLabel,
}: PromptImageProps) {
  const [currentSrc, setCurrentSrc] = useState(src);
  const [hasError, setHasError] = useState(false);
  const retryRef = useRef(0);

  useEffect(() => {
    setCurrentSrc(src);
    setHasError(false);
    retryRef.current = 0;
  }, [src]);

  const handleLoad = () => {
    setHasError(false);
  };

  const handleError = () => {
    if (fallbackSrc && !hasError) {
      setCurrentSrc(fallbackSrc);
      setHasError(true);
      return;
    }
    if (retryRef.current < 1) {
      retryRef.current += 1;
      window.setTimeout(() => {
        setCurrentSrc(`${src}?retry=${Date.now()}`);
      }, 300);
    }
  };

  const className = useMemo(() => {
    const fitClass = fit === "cover" ? styles.promptImageCover : styles.promptImageContain;
    const fitToken = fit === "cover" ? "prompt-image--cover" : "prompt-image--contain";
    return [
      "prompt-image",
      fitToken,
      styles.promptImage,
      fitClass,
      hasError ? styles.promptImageFallback : "",
    ]
      .filter(Boolean)
      .join(" ");
  }, [fit, hasError]);

  const renderImage = () => (
    <img
      className={className}
      src={currentSrc}
      alt={ariaLabel ?? ""}
      onLoad={handleLoad}
      onError={handleError}
    />
  );

  return <div className={styles.promptImageWrapper}>{renderImage()}</div>;
}
