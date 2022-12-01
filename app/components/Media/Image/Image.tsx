const SERVER_URI = process.env.REACT_APP_SERVER_URI

export const Image: React.FC<{src:string,alt:string}>  = ({src,alt}) => {
  return (
    <img src={`${SERVER_URI}media/images/${src}/size/598`} alt={alt} width="100%" />
  )
}
