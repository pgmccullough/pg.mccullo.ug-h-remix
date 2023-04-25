import { useState } from "react"
import { TextEditor } from "../TextEditor/TextEditor"

export const PostCreator: React.FC = () => {

  const [ , setIsFocused ] = useState<boolean>(false);
  const [ , setPostText ] = useState<string>("");

  return (
    <div className="upload">
      <TextEditor 
        // attachmentAction={() => attInput.current?.click()}
        contentStateSetter={setPostText}
        // htmlString={cleanEmail}
        placeholderText={`Go ahead...`}
        setIsFocused={setIsFocused}
        styleClass="upload__editable"
        tbProps={{hidden:true, sticky:false}}
      />
    </div>
  )

}