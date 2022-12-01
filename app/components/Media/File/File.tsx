export const File: React.FC<{src:string,alt:string}>  = ({src}) => {
    return (
        <div className="postcard__content_media_file">
            {src}
        </div>
    )
}