export const Image: React.FC<{
  src: string,
  alt: string,
  display?: boolean
}>  = ({src, alt, display}) => {

  return (
    <img src={`/api/media/images/${src}`} style={display===false?{display:"none"}:{}} alt={alt} width="100%" />
  )
}
