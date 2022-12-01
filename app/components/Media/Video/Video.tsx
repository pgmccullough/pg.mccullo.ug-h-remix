const MEDIA_SERVER_URI = 'https://dbt6gfxf4rv9p.cloudfront.net/';

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