export const Image: React.FC<{src:string,alt:string}>  = ({src,alt}) => {

  return (
    <img src={`/api/media/images/${src}`} alt={alt} width="100%" />
  )
}
