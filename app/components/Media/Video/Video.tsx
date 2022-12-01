const MEDIA_SERVER_URI = process.env.REACT_APP_MEDIA_SERVER_URI;

export const Video: React.FC<{src:string,alt:string}>  = ({src,alt}) => {
    return (
        <div className="postcard__content_media_video">
            <video width="100%" controls>
                <source src={`${MEDIA_SERVER_URI}images/${src}`} type="video/mp4" />
                Your browser does not support streaming videos.
            </video>  
        </div>
    )
}