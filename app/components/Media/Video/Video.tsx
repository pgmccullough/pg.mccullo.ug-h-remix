/**
 * Renders a single video attached to a post.
 *
 * `src` is normally just the basename stored on
 * `post.media.videos[i]` (e.g. `<uuid>.mp4`) — we resolve it
 * against the S3 `videos/` folder via the site's own media proxy,
 * which honors HTTP Range so scrubbing works.
 *
 * Legacy Instagram-backup imports are the exception: those files
 * were stored in S3 under `images/temp-social-backups/...` (even
 * videos got put in the images prefix by the import script), and
 * the src field holds the full nested path. Detect that shape and
 * route through `images/` instead of `videos/` so those old posts
 * play again.
 *
 * Type hint on <source> intentionally omitted — letting the browser
 * sniff from the response Content-Type covers .mp4 / .mov / .webm
 * without us having to map extensions.
 */
export const Video: React.FC<{src: string, alt?: string}> = ({src}) => {
  const isLegacyImport = src.includes("/");
  const mediaUrl = isLegacyImport
    ? `/api/media/images/${src}`
    : `/api/media/videos/${src}`;
  return (
    <div className="postcard__content_media_video">
      <video width="100%" controls preload="metadata" playsInline>
        <source src={mediaUrl} />
        Your browser does not support streaming videos.
      </video>
    </div>
  )
}
