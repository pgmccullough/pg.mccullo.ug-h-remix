import { useCallback, useEffect, useState } from "react"
import {
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  FORMAT_TEXT_COMMAND,
} from 'lexical';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { mergeRegister } from '@lexical/utils';
import type { EditorState, LexicalEditor } from "lexical";

export const TextEditor: React.FC<{contentStateSetter?: any, htmlString?: string, placeholderText?: string}> = ({ contentStateSetter, htmlString, placeholderText }) => {

  const Placeholder = ({placeholderText}:{placeholderText?:string}) => {
    return (
      <div className="textEditor__placeholder">
        {placeholderText||"Write something..."}
      </div>
    )
  }

  const onChange = (editorState: EditorState, editor: LexicalEditor) => {
    editor.update(() => {
      const html = $generateHtmlFromNodes(editor, null);
      contentStateSetter?contentStateSetter(html):console.error("State setter must be passed to access content");
    })
  }
  
  return (
    <div className="textEditor">
      <LexicalComposer
      initialConfig={{
        namespace: "textEditor",
        theme: {
          text: {
            bold: 'font-bold',
            code: 'code',
            italic: 'italic',
            underline: 'underline',
            strikethrough: 'line-through',
          },
        },
        onError(error) {
          throw error;
        },
      }}
      >
        <Toolbar />
        <RichTextPlugin
          contentEditable={
            <ContentEditable/>
          }
          ErrorBoundary={LexicalErrorBoundary}
          placeholder={<Placeholder placeholderText={placeholderText} />}
        />
        {htmlString?<InitialText htmlString={htmlString} />:""}
        <OnChangePlugin onChange={onChange} ignoreSelectionChange />
        <HistoryPlugin />
      </LexicalComposer>
    </div>
  )
}

const InitialText = ({htmlString}:any) => {
  console.log(htmlString);
  const [ editor ] = useLexicalComposerContext();
  useEffect(() => {
    editor.update(() => {
      if($getRoot().__children.length <= 1) {
        const parser = new DOMParser();
        const dom = parser.parseFromString(htmlString||"", 'text/html');
        const nodes = $generateNodesFromDOM(editor, dom);
        const paragraphNode = $createParagraphNode();
        nodes.forEach((n)=> paragraphNode.append(n))
        $getRoot().append(paragraphNode);
      }
    });
  },[])

  return (<></>)
}

const Toolbar = () => {
  const [ editor ] = useLexicalComposerContext();
  const [ isBold, setIsBold ] = useState(false);
  const [ isCode, setIsCode ] = useState(false);
  const [ isItalic, setIsItalic ] = useState(false);
  const [ isStrikethrough, setIsStrikethrough ] = useState(false);
  const [ isUnderline, setIsUnderline ] = useState(false);

  const updateToolbar = useCallback(() => {
    const selection = $getSelection();
    if ($isRangeSelection(selection)) {
      setIsBold(selection.hasFormat('bold'));
      setIsCode(selection.hasFormat('code'));
      setIsItalic(selection.hasFormat('italic'));
      setIsStrikethrough(selection.hasFormat('strikethrough'));
      setIsUnderline(selection.hasFormat('underline'));
    }
  }, [editor]);

  useEffect(() => {
    return mergeRegister(
      editor.registerUpdateListener(({ editorState }) => {
        editorState.read(() => {
          updateToolbar();
        });
      })
    );
  }, [updateToolbar, editor]);

  return (
    <div className="email__formatter">
      <button 
        className={`email__format-button ${isBold?"email__format-button--active":""} email__format-button--bold`}
        onClick={() => {editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'bold')}}
      >B</button>
      <button 
        className={`email__format-button ${isItalic?"email__format-button--active":""} email__format-button--italic`}
        onClick={() => {editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'italic');}}
      >I</button>
      <button 
        className={`email__format-button ${isUnderline?"email__format-button--active":""} email__format-button--underline`}
        onClick={() => {editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'underline');}}
      >U</button>
      <button 
        className={`email__format-button ${isStrikethrough?"email__format-button--active":""} email__format-button--strikethrough`}
        onClick={() => {editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'strikethrough');}}
      >S</button>
      <button 
        className={`email__format-button ${isCode?"email__format-button--active":""} email__format-button--code`}
        onClick={() => {editor.dispatchCommand(FORMAT_TEXT_COMMAND, 'code');}}
      >{`</>`}</button>
      <button className={`email__format-button email__format-button--attachment`}>ATT</button>
    </div>
  );
};