import { useCallback, useEffect, useState, SetStateAction } from "react";
import {
  $getNodeByKey,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  $createParagraphNode,
  $createTextNode,
  BLUR_COMMAND,
  COMMAND_PRIORITY_LOW,
  FOCUS_COMMAND,
  FORMAT_TEXT_COMMAND,
  LexicalNode
} from 'lexical';
import LexicalErrorBoundary from '@lexical/react/LexicalErrorBoundary';
import { $generateHtmlFromNodes, $generateNodesFromDOM } from '@lexical/html';
import { LexicalComposer } from '@lexical/react/LexicalComposer';
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';

import { RichTextPlugin } from '@lexical/react/LexicalRichTextPlugin';
import { ContentEditable } from '@lexical/react/LexicalContentEditable';
import { NodeEventPlugin } from '@lexical/react/LexicalNodeEventPlugin';
import { OnChangePlugin } from '@lexical/react/LexicalOnChangePlugin';
import { HistoryPlugin } from '@lexical/react/LexicalHistoryPlugin';
import { mergeRegister } from '@lexical/utils';
// import { TableCellNode, TableNode, TableRowNode } from "@lexical/table";
import { HorizontalRuleNode } from "@lexical/react/LexicalHorizontalRuleNode";
import { $createLinkNode, $isLinkNode, LinkNode, toggleLink } from '@lexical/link';
import type { EditorState, LexicalEditor } from "lexical";

export const TextEditor: React.FC<{
  appendComplexHTML?: string, 
  attachmentAction?: any,
  clearContent?: boolean,
  contentStateSetter?: SetStateAction<any>, 
  htmlString?: string, 
  placeholderText?: string,
  setIsFocused?: SetStateAction<any>,
  styleClass?: string,
  tbProps?: {hidden: boolean, sticky: boolean}
}> = ({
  appendComplexHTML, 
  attachmentAction,
  clearContent,
  contentStateSetter, 
  htmlString, 
  placeholderText,
  setIsFocused,
  styleClass,
  tbProps
}) => {

  const [ linkBox, setLinkBox ] = useState<{
    editor: any, editRemove: boolean, isOpen: boolean, linkNode: any, posX: number, posY: number, url: string, text: string
  }>({editor: null, editRemove: false, isOpen: false, linkNode: null, posX: 0, posY: 0, url: "", text: ""})

  const Placeholder = ({placeholderText}:{placeholderText?:string}) => {
    return (
      <div className="textEditor__placeholder">
        {placeholderText||"Write something..."}
      </div>
    )
  }

  const linkClicked = (event: any, editor: LexicalEditor) => {
    event.preventDefault();
    const { layerY, layerX } = event;
    const { href, innerText } = event.target.parentNode;
    setLinkBox({ ...linkBox, editor, linkNode: event.target, editRemove: true, posX: layerX, posY: layerY, url: href, text: innerText });
  }

  const traverseNodes = (node: LexicalNode, updatedLinkNode: LexicalNode) => {
    if(!node.__children) return;
    if($isLinkNode(node)&&
      node.__children.includes(linkBox.linkNode[Object.keys(linkBox.linkNode)[0]])
    ) {
      node.replace(updatedLinkNode);
    }
    const children = node.getChildren();
    if(children.length) {
      children.forEach((child: LexicalNode) => {
        traverseNodes(child, updatedLinkNode);
      })
    }
  }

  const removeLink = () => {
    linkBox.editor.update(() => {
      const strippedLink = $createTextNode(linkBox.linkNode.innerHTML);
      let children = $getRoot().getChildren();
      children.length&&children.forEach((node:LexicalNode) => {
        traverseNodes(node, strippedLink)
      })
      setLinkBox({ ...linkBox, editRemove: false });
    })
  }

  const updateLink = () => {
    linkBox.editor.update(() => {
      const updatedLinkNode = $createLinkNode(linkBox.url, {
        rel: linkBox.linkNode.parentElement.getAttribute('rel'),
        target: linkBox.linkNode.parentElement.getAttribute('target')
      })
      const parser = new DOMParser();
      const linkText = parser.parseFromString(linkBox.text||linkBox.url, 'text/html');
      const nodes = $generateNodesFromDOM(linkBox.editor, linkText);
      nodes.forEach((n)=> updatedLinkNode.append(n))
      let children = $getRoot().getChildren();
      children.length&&children.forEach((node:LexicalNode) => {
        traverseNodes(node, updatedLinkNode)
      })
    })
    setLinkBox({ ...linkBox, isOpen: false });
  }

  const DetectFocusPlugin = () => {
    if(setIsFocused) {
      const [ editor ] = useLexicalComposerContext();
      editor.update(() => {
        editor.registerCommand(
          FOCUS_COMMAND,
          () => {
            setIsFocused(true)
            return false
          },
          COMMAND_PRIORITY_LOW
        )
        editor.registerCommand(
          BLUR_COMMAND,
          () => {
            setIsFocused(false)
            return false
          },
          COMMAND_PRIORITY_LOW
        )
      })
    }
    return <></>
  }

  const onChange = (_editorState: EditorState, editor: LexicalEditor) => {
    editor.update(() => {
      const html = $generateHtmlFromNodes(editor, null);
      contentStateSetter
        ?contentStateSetter(html)
        :console.error("State setter must be passed to access content");
    })
  }


  
  return (
    <div className={`textEditor ${styleClass||""}`}>
      {linkBox.editRemove
        ?<div 
          className="textEditor__link-box"
          style={{left: linkBox.posX+"px", top: linkBox.posY+"px"}}
        >
          <button onClick={removeLink}>REMOVE</button>
          <button onClick={() => setLinkBox({ ...linkBox, editRemove: false, isOpen: true })}>EDIT</button>
          <button onClick={() => setLinkBox({ ...linkBox, editRemove: false })}>CANCEL</button>
        </div>
        :""
      }
      {linkBox.isOpen
        ?<div 
          className="textEditor__link-box"
          style={{left: linkBox.posX+"px", top: linkBox.posY+"px"}}
        >
          <input type="text" value={linkBox.text} onChange={(e) => setLinkBox({...linkBox, text: e.target.value})} />
          <input type="text" value={linkBox.url} onChange={(e) => setLinkBox({...linkBox, url: e.target.value})} />
          <button onClick={() => setLinkBox({ ...linkBox, isOpen: false })}>CANCEL</button>
          <button onClick={updateLink}>UPDATE</button>
        </div>
        :""
      }
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
          nodes: [HorizontalRuleNode, LinkNode],
          onError(error) {
            throw error;
          },
        }}
      >
        <Toolbar attachmentAction={attachmentAction} tbProps={tbProps} />
        <RichTextPlugin
          contentEditable={
            <ContentEditable/>
          }
          ErrorBoundary={LexicalErrorBoundary}
          placeholder={<Placeholder placeholderText={placeholderText} />}
        />
        {htmlString?<InitialText htmlString={htmlString} />:""}
        <NodeEventPlugin nodeType={LinkNode} eventType={'contextmenu'} eventListener={linkClicked} />
        
        {setIsFocused?<DetectFocusPlugin />:""}
        <OnChangePlugin onChange={onChange} ignoreSelectionChange />
        <HistoryPlugin />
        <ClearCommand clearContent={clearContent} />
      </LexicalComposer>
      {appendComplexHTML
        ?<div dangerouslySetInnerHTML={{__html: appendComplexHTML}} />
        :""
      }
    </div>
  )
}

const ClearCommand = ({clearContent}:any) => {
  const [ editor ] = useLexicalComposerContext();
  useEffect(() => {
    if(clearContent) {
      editor.update(() => {
        const root = $getRoot();
        const paragraph = $createParagraphNode();
        root.clear();
        root.append(paragraph);
      });
    }
  },[clearContent])

  return (<></>)
}

const InitialText = ({htmlString}:any) => {
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

const Toolbar = ({attachmentAction, tbProps}:{attachmentAction?:any, tbProps?:{hidden: boolean, sticky: boolean}}) => {
  const [ editor ] = useLexicalComposerContext();
  const [ isBold, setIsBold ] = useState(false);
  const [ isCode, setIsCode ] = useState(false);
  const [ isItalic, setIsItalic ] = useState(false);
  const [ isStrikethrough, setIsStrikethrough ] = useState(false);
  const [ isUnderline, setIsUnderline ] = useState(false);
  
  const createLink = (editor: LexicalEditor) => {
    editor.update(() => {
      toggleLink("");
    });
  }

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
    tbProps?.hidden
      ?<></>
      :<div className={`email__formatter${tbProps?.sticky?" email__formatter--sticky":""}`}>
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
      <button 
        className={`email__format-button`}
        onClick={() => createLink(editor)}
      >{`LINK`}</button>
      {attachmentAction
        ?<button className={`email__format-button email__format-button--attachment`} onClick={attachmentAction}>ATT</button>
        :""
      }
    </div>
  );
};