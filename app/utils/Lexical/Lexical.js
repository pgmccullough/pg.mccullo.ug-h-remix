import PGMTheme from "./themes/PGMTheme";
import {
  $getRoot,
  BLUR_COMMAND,
  DROP_COMMAND,
  FOCUS_COMMAND,
  COMMAND_PRIORITY_LOW
} from 'lexical';
import { mergeRegister } from "@lexical/utils";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { ListItemNode, ListNode } from "@lexical/list";
import { CodeHighlightNode, CodeNode } from "@lexical/code";
import { AutoLinkNode, LinkNode } from "@lexical/link";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
//dropped useLayoutEffect to make remix happy
import { useEffect } from "react";

const editorConfig = {
  theme: PGMTheme,
  onError(error) {
    throw error;
  },
  nodes: [
    HeadingNode,
    ListNode,
    ListItemNode,
    QuoteNode,
    CodeNode,
    CodeHighlightNode,
    TableNode,
    TableCellNode,
    TableRowNode,
    AutoLinkNode,
    LinkNode
  ]
};

const onChange = (editorState, setTextContent) => {
  editorState.read(() => {
    const root = $getRoot();
    //setTextContent(Array.from(editorState._nodeMap)[0][1].__cachedText);
    setTextContent(root.__cachedText);
  });
}

const DetectFocusBlurPlugin = ({ dropHandler, toggleLexicalFocus, clearContentOnPost, setClearContentOnPost }) => {
  const [editor] = useLexicalComposerContext();
  if(clearContentOnPost) {
    setClearContentOnPost(false);
    editor.update(() => {
      var lexical = require('lexical');
      const root = lexical.$getRoot();
      const selection = lexical.$getSelection();
      const paragraph = lexical.$createParagraphNode();
      root.clear();
      root.append(paragraph);
    });
  }
  useEffect(() => {
    return mergeRegister(
      editor.registerCommand(
        BLUR_COMMAND, (e) => toggleLexicalFocus(e, false),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        FOCUS_COMMAND, (e) => toggleLexicalFocus(e, true),
        COMMAND_PRIORITY_LOW
      ),
      editor.registerCommand(
        DROP_COMMAND, (e) => dropHandler(e),
        COMMAND_PRIORITY_LOW
      ),
    )
  }, [editor]);
  return null;
}

const Placeholder = () =>
  <div className="lexical__placeholder">Go ahead...</div>;

const Lexical = ({ toggleLexicalFocus, dragState, dropHandler, clearContentOnPost, setClearContentOnPost, setTextContent }) => {
  return (
    <LexicalComposer initialConfig={editorConfig}>
          <RichTextPlugin
            contentEditable={
              <ContentEditable
                className={`upload__editable${dragState?" upload__editable--drag":""}`}
              />
            }
            placeholder={<Placeholder />}
          />
      <OnChangePlugin onChange={(e) => onChange(e, setTextContent)} />
      <DetectFocusBlurPlugin
        clearContentOnPost={clearContentOnPost}
        setClearContentOnPost={setClearContentOnPost}
        toggleLexicalFocus={(e, toggle) => toggleLexicalFocus(e, toggle)}
        dropHandler={dropHandler}
      />
    </LexicalComposer>
  );
}

export default Lexical;