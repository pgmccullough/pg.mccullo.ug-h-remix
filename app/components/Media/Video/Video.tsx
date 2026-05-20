/**
 * Renders a single video attached to a post.
 *
 * `src` is just the basename stored on `post.media.videos[i]` (e.g.
 * `<uuid>.mp4`). We resolve it against the per-kind S3 folder via the
 * site's own media proxy, which now honors HTTP Range so scrubbing works.
 *
 * Type hint on <source> intentionally omitted — letting the browser
 * sniff from the response Content-Type covers .mp4 / .mov / .webm
 * without us having to map extensions.
 */
export const Video: React.FC<{src: string, alt?: string}> = ({src}) => {
  return (
    <div className="postcard__content_media_video">
      <video width="100%" controls preload="metadata" playsInline>
        <source src={`/api/media/videos/${src}`} />
        Your browser does not support streaming videos.
      </video>
    </div>
  )
}
