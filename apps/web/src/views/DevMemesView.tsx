import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { getApiBaseUrl } from "../utils/api";
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

type DevMemeModerationEntry = {
  favorite?: boolean;
  avatar?: boolean;
  deleted?: boolean;
  updatedAt?: number;
  favoritedAt?: number;
  avatarAt?: number;
  deletedAt?: number;
};

type DevMemesModerationResponse = {
  ok: boolean;
  writeEnabled?: boolean;
  items?: Record<string, DevMemeModerationEntry>;
  error?: string;
};

type DevMemeActionResponse = {
  ok: boolean;
  rowId?: string;
  entry?: DevMemeModerationEntry;
  error?: string;
};

const ADMIN_TOKEN_STORAGE_KEY = "escapers.devMemesAdminToken";
type DevMemeModerationAction = "favorite" | "avatar" | "delete";

function formatRangeLabel(pageNumber: number, pageSize: number, totalItems: number) {
  if (totalItems === 0) {
    return "0";
  }
  const start = (pageNumber - 1) * pageSize + 1;
  const end = Math.min(pageNumber * pageSize, totalItems);
  return `${start}-${end}`;
}

export default function DevMemesView() {
  const params = useParams<{ pageNumber?: string }>();
  const apiBase = getApiBaseUrl();
  const currentPage = params.pageNumber ? Number.parseInt(params.pageNumber, 10) : 1;
  const [manifest, setManifest] = useState<DevMemesManifest | null>(null);
  const [moderation, setModeration] = useState<Record<string, DevMemeModerationEntry>>({});
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [error, setError] = useState<string>("");
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [pendingRowId, setPendingRowId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<DevMemeModerationAction | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadGallery() {
      try {
        const manifestResponse = await fetch("/dev-memes-gallery.json");
        if (!manifestResponse.ok) {
          throw new Error(`Manifest request failed: ${manifestResponse.status}`);
        }
        const manifestPayload = (await manifestResponse.json()) as DevMemesManifest;

        let moderationPayload: DevMemesModerationResponse | null = null;
        let nextStatusMessage = "Gallery is live, but write actions are disabled until the server has an admin token configured.";
        try {
          const moderationResponse = await fetch(`${apiBase}/dev-memes/moderation`);
          if (!moderationResponse.ok) {
            throw new Error(`Moderation request failed: ${moderationResponse.status}`);
          }
          moderationPayload = (await moderationResponse.json()) as DevMemesModerationResponse;
          if (moderationPayload.writeEnabled === true) {
            nextStatusMessage = "Use ★ to mark favorite, 👤 to mark avatar, and ✕ to mark delete and remove a meme from the published grid.";
          }
        } catch (moderationError: unknown) {
          nextStatusMessage =
            moderationError instanceof Error
              ? `Moderation status unavailable: ${moderationError.message}`
              : "Moderation status unavailable.";
        }

        if (cancelled) {
          return;
        }
        setManifest(manifestPayload);
        setModeration(moderationPayload?.items ?? {});
        setWriteEnabled(moderationPayload?.writeEnabled === true);
        setStatusMessage(nextStatusMessage);
      } catch (fetchError: unknown) {
        if (!cancelled) {
          setError(fetchError instanceof Error ? fetchError.message : "Unknown manifest error");
        }
      }
    }
    void loadGallery();
    return () => {
      cancelled = true;
    };
  }, [apiBase]);

  function readStoredAdminToken() {
    if (typeof window === "undefined") {
      return "";
    }
    return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY) ?? "";
  }

  function storeAdminToken(token: string) {
    if (typeof window === "undefined") {
      return;
    }
    if (token) {
      window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
      return;
    }
    window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  }

  async function handleModerationAction(rowId: string, action: DevMemeModerationAction) {
    if (pendingRowId) {
      return;
    }
    if (!writeEnabled) {
      setStatusMessage("Write actions are disabled on the server.");
      return;
    }

    let adminToken = readStoredAdminToken().trim();
    if (!adminToken && typeof window !== "undefined") {
      adminToken = window.prompt("Enter the dev memes admin token")?.trim() ?? "";
      if (!adminToken) {
        setStatusMessage("Admin token is required for moderation actions.");
        return;
      }
      storeAdminToken(adminToken);
    }

    setPendingRowId(rowId);
    setPendingAction(action);
    try {
      const response = await fetch(`${apiBase}/dev-memes/${action}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken}`,
        },
        body: JSON.stringify({ rowId }),
      });
      const payload = (await response.json().catch(() => null)) as DevMemeActionResponse | null;
      if (response.status === 401) {
        storeAdminToken("");
        setStatusMessage("Admin token rejected. Enter it again on the next action.");
        return;
      }
      if (!response.ok) {
        throw new Error(payload?.error ?? `Moderation request failed: ${response.status}`);
      }
      const entry = payload?.entry ?? {
        favorite: action === "favorite" ? true : moderation[rowId]?.favorite,
        avatar: action === "avatar" ? true : moderation[rowId]?.avatar,
        deleted: action === "delete" ? true : moderation[rowId]?.deleted,
        updatedAt: Date.now(),
      };
      setModeration((current) => ({
        ...current,
        [rowId]: entry,
      }));
      setStatusMessage(
        action === "favorite"
          ? "Favorite saved for this meme."
          : action === "avatar"
            ? "Avatar saved for this meme."
            : "Meme marked delete and removed from the published gallery.",
      );
    } catch (actionError: unknown) {
      setStatusMessage(actionError instanceof Error ? actionError.message : "Unknown moderation error.");
    } finally {
      setPendingRowId(null);
      setPendingAction(null);
    }
  }

  if (!Number.isFinite(currentPage) || currentPage < 1) {
    return <Navigate to="/dev/memes" replace />;
  }

  if (!manifest && !error) {
    return (
      <main className={styles.page}>
        <div className={styles.hero}>
          <p className={styles.kicker}>Dev Gallery</p>
          <h1 className={styles.title}>Meme Originals</h1>
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
          <h1 className={styles.title}>Meme Originals</h1>
          <p className={styles.subtitle}>Manifest load failed: {error}</p>
        </div>
      </main>
    );
  }

  const visibleItems = manifest.items.filter((item) => moderation[item.rowId]?.deleted !== true);
  const pageCount = Math.max(1, Math.ceil(visibleItems.length / manifest.pageSize));
  if (currentPage > pageCount) {
    return <Navigate to={pageCount === 1 ? "/dev/memes" : `/dev/memes/${pageCount}`} replace />;
  }

  const startIndex = (currentPage - 1) * manifest.pageSize;
  const pageItems = visibleItems.slice(startIndex, startIndex + manifest.pageSize);
  const hasNextPage = currentPage < pageCount;
  const nextPageHref = currentPage === 1 ? "/dev/memes/2" : `/dev/memes/${currentPage + 1}`;
  const pageHref = (pageNumber: number) => (pageNumber === 1 ? "/dev/memes" : `/dev/memes/${pageNumber}`);

  return (
    <main className={styles.page}>
      <div className={styles.hero}>
        <p className={styles.kicker}>Dev Gallery</p>
        <h1 className={styles.title}>Meme Originals</h1>
        <p className={styles.subtitle}>
          Page {currentPage} of {pageCount}. Showing {formatRangeLabel(currentPage, manifest.pageSize, visibleItems.length)} of{" "}
          {visibleItems.length} transparent originals.
        </p>
        <p className={styles.statusBanner}>{statusMessage}</p>
      </div>

      <section className={styles.galleryShell} aria-label={`Meme originals page ${currentPage}`}>
        {pageItems.length > 0 ? (
          <div className={styles.grid}>
            {pageItems.map((item, index) => {
              const isFavorite = moderation[item.rowId]?.favorite === true;
              const isAvatar = moderation[item.rowId]?.avatar === true;
              const isPending = pendingRowId === item.rowId;
              return (
                <figure className={`${styles.card} ${isFavorite ? styles.cardFavorite : ""}`.trim()} key={item.rowId}>
                  <div className={styles.imageShell}>
                    <span className={styles.badge}>{startIndex + index + 1}</span>
                    <img className={styles.image} src={item.imageUrl} alt={item.title} loading="lazy" decoding="async" />
                  </div>
                  <div className={styles.actionBar}>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.favoriteButton} ${isFavorite ? styles.selectedAction : ""}`.trim()}
                      onClick={() => void handleModerationAction(item.rowId, "favorite")}
                      disabled={isPending}
                      aria-label={isFavorite ? "Favorite saved" : "Mark as favorite"}
                      aria-pressed={isFavorite}
                      title={isFavorite ? "Favorite saved" : "Mark as favorite"}
                    >
                      ★
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.avatarButton} ${isAvatar ? styles.selectedAction : ""}`.trim()}
                      onClick={() => void handleModerationAction(item.rowId, "avatar")}
                      disabled={isPending}
                      aria-label={isAvatar ? "Avatar saved" : "Mark as avatar"}
                      aria-pressed={isAvatar}
                      title={isAvatar ? "Avatar saved" : "Mark as avatar"}
                    >
                      👤
                    </button>
                    <button
                      type="button"
                      className={`${styles.iconButton} ${styles.deleteButton}`.trim()}
                      onClick={() => void handleModerationAction(item.rowId, "delete")}
                      disabled={isPending}
                      aria-label="Mark delete and remove from published gallery"
                      title="Mark delete and remove from published gallery"
                    >
                      ✕
                    </button>
                    {isPending ? (
                      <span className={styles.pendingLabel}>
                        {pendingAction === "delete" ? "Deleting..." : pendingAction === "avatar" ? "Avatar..." : "Saving..."}
                      </span>
                    ) : null}
                  </div>
                </figure>
              );
            })}
          </div>
        ) : (
          <div className={styles.emptyState}>No published memes remain on this page.</div>
        )}
      </section>

      <footer className={styles.footer}>
        <p className={styles.footerMeta}>
          10 images per row, 4 rows per page. Source rows remain aligned to the order in <code>master_memes.csv</code>, with deleted rows filtered out before pagination.
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
