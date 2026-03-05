import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import styles from "./DevMemesView.module.css";

type DevMemeItem = {
  position: number;
  pageNumber: number;
  rowId: string;
  title: string;
  fileName: string;
  imageUrl: string;
  searchPage: number;
  pageItemIndex: number;
};

type DevMemesManifest = {
  pageSize: number;
  pageCount: number;
  totalItems: number;
  items: DevMemeItem[];
};

function formatRangeLabel(pageNumber: number, pageSize: number, totalItems: number) {
  const start = (pageNumber - 1) * pageSize + 1;
  const end = Math.min(pageNumber * pageSize, totalItems);
  return `${start}-${end}`;
}

export default function DevMemesView() {
  const params = useParams<{ pageNumber?: string }>();
  const currentPage = params.pageNumber ? Number.parseInt(params.pageNumber, 10) : 1;
  const [manifest, setManifest] = useState<DevMemesManifest | null>(null);
  const [error, setError] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    fetch("/dev-memes-gallery.json")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Manifest request failed: ${response.status}`);
        }
        return response.json();
      })
      .then((payload: DevMemesManifest) => {
        if (!cancelled) {
          setManifest(payload);
        }
      })
      .catch((fetchError: unknown) => {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Unknown manifest error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Number.isFinite(currentPage) || currentPage < 1) {
    return <Navigate to="/dev/memes" replace />;
  }

  if (!manifest && !error) {
    return (
      <main className={styles.page}>
        <div className={styles.hero}>
          <p className={styles.kicker}>Dev Gallery</p>
          <h1 className={styles.title}>PNGEgg Meme Originals</h1>
          <p className={styles.subtitle}>Loading gallery manifest...</p>
        </div>
      </main>
    );
  }

  if (!manifest) {
    return (
      <main className={styles.page}>
        <div className={styles.hero}>
          <p className={styles.kicker}>Dev Gallery</p>
          <h1 className={styles.title}>PNGEgg Meme Originals</h1>
          <p className={styles.subtitle}>Manifest load failed: {error}</p>
        </div>
      </main>
    );
  }

  if (currentPage > manifest.pageCount) {
    return <Navigate to={`/dev/memes/${manifest.pageCount}`} replace />;
  }

  const startIndex = (currentPage - 1) * manifest.pageSize;
  const pageItems = manifest.items.slice(startIndex, startIndex + manifest.pageSize);
  const hasNextPage = currentPage < manifest.pageCount;
  const nextPageHref = currentPage === 1 ? "/dev/memes/2" : `/dev/memes/${currentPage + 1}`;
  const pageHref = (pageNumber: number) => (pageNumber === 1 ? "/dev/memes" : `/dev/memes/${pageNumber}`);

  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <p className={styles.kicker}>Dev Gallery</p>
        <h1 className={styles.title}>PNGEgg Meme Originals</h1>
        <p className={styles.subtitle}>
          Page {currentPage} of {manifest.pageCount}. Showing {formatRangeLabel(currentPage, manifest.pageSize, manifest.totalItems)} of{" "}
          {manifest.totalItems} transparent originals in CSV order.
        </p>
      </div>

      <section className={styles.galleryShell} aria-label={`Meme originals page ${currentPage}`}>
        <div className={styles.grid}>
          {pageItems.map((item) => (
            <figure className={styles.card} key={item.rowId}>
              <span className={styles.badge}>{item.position}</span>
              <img className={styles.image} src={item.imageUrl} alt={item.title} loading="lazy" decoding="async" />
            </figure>
          ))}
        </div>
      </section>

      <footer className={styles.footer}>
        <p className={styles.footerMeta}>
          10 images per row, 4 rows per page. Source rows remain aligned to the order in <code>master_memes.csv</code>.
        </p>
        <div className={styles.navigation}>
          {currentPage > 1 ? (
            <Link className={styles.secondaryLink} to={pageHref(currentPage - 1)}>
              Previous page
            </Link>
          ) : (
            <span className={styles.secondaryGhost}>Page 1</span>
          )}
          {hasNextPage ? (
            <Link className={styles.primaryLink} to={nextPageHref}>
              Next page: {currentPage + 1}
            </Link>
          ) : (
            <span className={styles.primaryGhost}>Last page reached</span>
          )}
        </div>
      </footer>
    </main>
  );
}
