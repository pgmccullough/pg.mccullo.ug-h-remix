const MEDIA_SERVER_URI = 'https://pg.mccullo.ug/api/media/';

export const Audio: React.FC<{src:string,alt:string}>  = ({src}) => {
    // Legacy Instagram-backup imports live under S3 `images/...` even
    // for audio files. Detect nested-path src and route accordingly.
    // New uploads use bare basenames under `audio/`.
    const isLegacyImport = src.includes("/");
    const mediaUrl = isLegacyImport
        ? `${MEDIA_SERVER_URI}images/${src}`
        : `${MEDIA_SERVER_URI}audio/${src}`;
    return (
        <div className="postcard__content_media_audio">
            <audio controls>
                <source src={mediaUrl} type="audio/mpeg" />
                Your browser does not support streaming videos.
            </audio>
        </div>
    )
}