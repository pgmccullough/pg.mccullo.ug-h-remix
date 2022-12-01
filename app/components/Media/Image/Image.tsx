const SERVER_URI = 'https://api.mccullo.ug/'

export const Image: React.FC<{src:string,alt:string}>  = ({src,alt}) => {
  return (
    <img src={`${SERVER_URI}media/images/${src}/size/598`} alt={alt} width="100%" />
  )
}
