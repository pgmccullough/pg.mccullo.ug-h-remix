export const Image: React.FC<{
  src: string,
  alt: string,
  display?: boolean
}>  = ({src, alt, display}) => {

  return (
    <img
      src={`/api/media/images/${src}`}
      style={display===false?{display:"none"}:{}}
      alt={alt}
      width="100%"
      // Native lazy loading — browsers defer offscreen images
      // until they scroll near the viewport. Free perf + CWV win.
      loading="lazy"
      // Hint low priority to help the browser schedule critical
      // resources ahead of feed thumbnails.
      decoding="async"
    />
  )
}
