const MEDIA_SERVER_URI = 'https://dbt6gfxf4rv9p.cloudfront.net/';

export const Audio: React.FC<{src:string,alt:string}>  = ({src}) => {
    return (
        <div className="postcard__content_media_audio">
            <audio controls>
                <source src={`${MEDIA_SERVER_URI}audio/${src}`} type="audio/mpeg" />
                Your browser does not support streaming videos.
            </audio> 
        </div>
    )
}