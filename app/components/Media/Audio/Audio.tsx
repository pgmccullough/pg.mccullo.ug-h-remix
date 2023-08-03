const MEDIA_SERVER_URI = 'https://pg.mccullo.ug/api/media/';

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