import { Weblink } from '~/components/Media/Weblink/Weblink';
import axios from 'axios';
import React, { useEffect, useState, useRef } from "react";
import uuid from 'react-uuid';
import Lexical from '~/utils/Lexical/Lexical';

const extCheck = [
    {
    images: 
    ["apng","avif","gif","jpg","jpeg","jfif","pjpeg","pjp","png","svg","webp","bmp","ico","cur","tif","tiff"]
    },
    {
    audio: 
    ["pcm","wav","aiff","mp3","aac","wma","flac","alac"]
    },
    {
    videos: 
    ["mp4","mov","wmv","flv","avi","avchd","webm","mkv"]
    }
];

export const UploadBox = () => {
  const SERVER_URI = 'https://api.mccullo.ug/';
  const [clearContentOnPost, setClearContentOnPost] = useState(false);
  const [lexicalFocus, setLexicalFocus] = useState(false);
  const [uploadBlocks, addUploadBlock] = useState([]);
  const [uploadBlocksPreview, setUploadBlocksPreview] = useState([]);
  const [prevBlocks, setPrevBlocks] = useState([]);
  const [uploadHeight, updateUploadHeight] = useState("60px");
  const [contentHeight, getContentHeight] = useState(44);
  const [isUploading, uploadingStatus] = useState(false);
  const [postSettings, updatePostSettings] = useState([false,false,false,"Public","images/"])
  const [fileDir, setFileDir] = useState("images");
  const [fileDirs, getFileDirs] = useState([]);
  const [fileDirActive, toggleFileDir] = useState(false);
  const [dragState, setDrag] = useState(0);
  const [addFileStyle, setAddFileStyle] = useState({display: "none",opacity:"0"});
  const [urls, setUrls] = useState([]);
  const [textContent,setTextContent] = useState("");

  const upPrevRef = useRef([]);
  const upProgMsgRef = useRef([]);
  const upProgPercRef = useRef([]);

  const inactiveHeight = 16;
  const activeHeight = 84;
  const activeHeightPreview = 95; 

  const uploadFiles = (postText) => {
      uploadingStatus(true);
      let promises = [];
      let responses = {images:[],audio:[],videos:[],files:[]};
      for (let i = 0; i < uploadBlocks.length; i++) {
          const formData = new FormData();
          formData.append('media_directory',postSettings[4]);
          formData.append('files',uploadBlocks[i]);
          promises.push(
              axios.post(`${SERVER_URI}post/upload`, formData, {
                  onUploadProgress: (progressEvent) => {
                      let upPerc = Math.round(progressEvent.loaded/progressEvent.total*100)+"%";
                      upProgMsgRef.current[i].innerText = upPerc;
                      upProgPercRef.current[i].style.width = upPerc;
                  }
              }).then((response) => {
                  let cleanName = response.data[0].key.replace("images/","");
                  let ext = cleanName.split('.').pop();
                  if(extCheck[0].images.includes(ext.toLowerCase())) {
                      responses.images.push(cleanName);
                  } else if(extCheck[1].audio.includes(ext.toLowerCase())) {
                      responses.audio.push(cleanName);
                  } else if(extCheck[2].videos.includes(ext.toLowerCase())) {
                      responses.videos.push(cleanName);
                  } else {
                      responses.files.push(cleanName);
                  }
              })
          )
      }
      Promise.all(promises).then(() => {
          axios.post(`${SERVER_URI}post`, {
              content: postText,
              privacy: postSettings[3],
              media_directory: postSettings[4],
              links: prevBlocks,
              videos: responses.videos,
              images: responses.images,
              audio: responses.audio,
              files: responses.files,
              likesOn: postSettings[0],
              likes: 0,
              commentsOn: postSettings[1],
              comments: 0,
              sharesOn: postSettings[2],
              shares: 0
          }).then((response) => {
              setPrevBlocks([]);
              setUrls([]);
              addUploadBlock([]);
              uploadingStatus(false);
              updateUploadHeight("60px");
              getContentHeight(44);
              setClearContentOnPost(true);
          }).catch((_response) => {
              console.error("POST https://pg.mccullo.ug/h/ failed.");
          })
      });
  };

  const submitPost = () => {
      if(uploadBlocks.length === 0) {
          axios.post(`${SERVER_URI}post`, {
              content: document.querySelector(".upload__editable").innerHTML,
              privacy: postSettings[3],
              media_directory: postSettings[4],
              links: prevBlocks,
              likesOn: postSettings[0],
              likes: 0,
              commentsOn: postSettings[1],
              comments: 0,
              sharesOn: postSettings[2],
              shares: 0
          }).then((_response) => {
              setPrevBlocks([]);
              setUrls([]);
              setClearContentOnPost(true);
          }).catch(_error => {
              console.error("POST https://pg.mccullo.ug/h/ failed.");
          });
      } else {
          uploadFiles(document.querySelector(".upload__editable").innerHTML);
      }
  }

  useEffect(() => {
      urlsInStr(textContent);
  },[textContent])

  useEffect(() => {
      let arr = [];
      uploadBlocks.forEach((uploadBlock,i) => {
          let ext = uploadBlock.name.split('.').pop();
          if(extCheck[0].images.includes(ext.toLowerCase())) {
              const reader = new FileReader();
              reader.readAsDataURL(uploadBlock);
              reader.onload = function(e) {
                  arr[i] = e.target.result;
                  upPrevRef.current[i].style.backgroundImage = `url(${e.target.result})`;
              }
          }
      })
      setUploadBlocksPreview(arr);
  },[uploadBlocks]);

  useEffect(() => {
      let listenEl = document.querySelector(".upload__editable");
      if(!listenEl) return;
      getContentHeight(listenEl.clientHeight);
      if(!lexicalFocus&&uploadBlocks.length === 0) {
          updateUploadHeight(inactiveHeight+contentHeight+(activeHeightPreview*Math.ceil((prevBlocks.length)/5)));
      } else if(uploadBlocks.length === 0) {
          updateUploadHeight(activeHeight+contentHeight+(activeHeightPreview*Math.ceil((prevBlocks.length)/5)));
      } else {
          updateUploadHeight(activeHeightPreview+contentHeight+(activeHeightPreview*Math.ceil((uploadBlocks.length)/5))+(activeHeightPreview*Math.ceil((prevBlocks.length)/5)));
      }
  },[textContent,lexicalFocus,prevBlocks,uploadBlocks,contentHeight,urls]);

  useEffect(() => {
      lexicalFocus?
          setAddFileStyle({display: "block",opacity:"1"}):
          setAddFileStyle({display: "none",opacity:"0"});
  },[lexicalFocus])

  const disablePreview = (origWeblinkSrc) => {
      let tempUrls = []
      let prevBlocksTemp = prevBlocks;
      urls.forEach(url => {
          if(url[Object.keys(url)[0]].withPre===origWeblinkSrc) {
              tempUrls.push({[Object.keys(url)[0]]: {...url[Object.keys(url)[0]],prev:0}});
              let toRemove = prevBlocks.indexOf(url[Object.keys(url)[0]].withPre);
              prevBlocksTemp.splice(toRemove,1);
              setPrevBlocks(prevBlocksTemp);
          } else {
              tempUrls.push({[Object.keys(url)[0]]: {...url[Object.keys(url)[0]]}});
          }
      });
      setUrls(tempUrls);
  }

  const urlsInStr = (str) => {
      let urlArr = [];
      str = str.split(/\s/);
      str.pop();
      str.forEach(str => {
          let dotPos = str.indexOf(".");
          let noEllips = str.indexOf("..");
          if(dotPos>0&&dotPos<str.length-2&&noEllips<1) {
              let endSpecChar = /[^A-Za-z]$/;
              let cleanStr = str.replace(endSpecChar, '');
              let origStr = str;
              let root = str.split(".")[0];
              if(root==="www") root = str.split(".")[1];
              if((str.substring(0,7)!=="http://")&&(str.substring(0,8)!=="https://")) str = "https://"+str;
              let isNew = 1;
              if(urls.length>0) {
                  urls.forEach(url => {
                      if(Object.keys(url)[0]===root) isNew = 0;
                  })
              }
              if(isNew) {
                  urlArr = {[root]:{inStr: origStr, withPre: str, cleanStr, prev:1, urlify:1}};
                  setUrls([...urls, urlArr]);
                  setPrevBlocks([...prevBlocks,str]);
              }
          }
      })
  }

  const dragHandler = (toggle) => {
      if(toggle===0&&dragState===1) {
          setDrag(0);
      } else {
          setDrag(1);
      }   
  }

  useEffect(() => {
      // don't shrink post input section if there is content
      let urlPreviewCount = urls?.filter(url=>url[Object.keys(url)[0]].prev!==0).length;
      if(urlPreviewCount > 0) setLexicalFocus(true);
  },[lexicalFocus, urls]);

  const toggleLexicalFocus = (e, toggle) => {
      setLexicalFocus(toggle);
      let safeTargets = ['upload__feedback__privacy','upload__addfile','upload__feedback__checkbox__input','upload__feedback__target-directory','upload__feedback__submit'];
      if((toggle===false)&&(safeTargets.includes(e.relatedTarget?.className))) {
          setLexicalFocus(true);
      }
  }
  
  const dropHandler = e => {
      e.preventDefault();
      let files;
      e.dataTransfer ? files = e.dataTransfer.files : files = e.target.files;
      setDrag(0);
      Object.entries(files).forEach(file => {
          const [,value] = file;
          addUploadBlock(prevState => [...prevState, value]);
      })
  }

  const autoFillDirectories = () => {
      toggleFileDir(true);
      let cutTrailSlash = fileDir.endsWith('/') ? fileDir.slice(0, -1) : fileDir;
      axios(`${SERVER_URI}media/directories/${cutTrailSlash}/`)
      .then(response => {
          getFileDirs(response.data);
      })
  }

  const hideAutoFillDirectories = e => {
      setTimeout(function() {toggleFileDir(false)},500); //hacky way to keep directory list from disappearing before registering onclick
  }

  const liClickHandle = (text) => {
      setTimeout(function(){toggleFileDir(true)},500);
      let cutTrailSlash = text.endsWith('/') ? text.slice(0, -1) : text;
      setFileDir(cutTrailSlash);
      updatePostSettings(Object.assign([],postSettings,{4: cutTrailSlash}));
  }

  const updateDir = ((e) => {
      setFileDir(e.target.value);
      updatePostSettings(Object.assign([],postSettings,{4: e.target.value}));
      autoFillDirectories();
  });

  const postSettingHandler = (e,el) => {
      const newVal = (typeof e.target.checked === "undefined" ? e.target.value : e.target.checked);
      updatePostSettings(Object.assign([],postSettings,{[el]: newVal}));
  }

  const removePreview = ((i) => {
      let toRemove = i;
      let newUBState = [];
      upPrevRef.current = upPrevRef.current.filter((_indRef,i) => i !== toRemove);
      upProgMsgRef.current = upProgMsgRef.current.filter((_indRef,i) => i !== toRemove);
      upProgPercRef.current = upProgPercRef.current.filter((_indRef,i) => i !== toRemove);
      uploadBlocks.forEach((indy,i) => {
          if(i!==toRemove) newUBState.push(indy);
      })
      addUploadBlock(newUBState)
  })
    
  return (
      <>
          <div 
          className={`upload__feedback__target-directory--dropdown${fileDirActive?"":"--hidden"}`}
          >
              {fileDirs.map(fileDirLI => (
                  <li key={fileDirLI} onClick={(()=>liClickHandle(fileDirLI))} className="upload__feedback__target-directory--dropdown--li">{fileDirLI}</li>
              ))}
              <li onClick={(()=>liClickHandle(fileDir))} className='upload__feedback__target-directory--dropdown--li'><b>Create New:</b> {fileDir}</li>
          </div>
          <div className="upload"
              style={{height: `${uploadHeight}px`}}
              onDragEnter={() => dragHandler(0)}
              onDragLeave={() => dragHandler(0)}
              onDragOver={() => dragHandler(1)}
          >
              <div className="upload__url__preview">
                  {urls.length>0
                  ?<>
                      {urls.map(url=> 
                          <>
                          {url[Object.keys(url)[0]].prev
                          ?<div className="upload__url__preview--ind">
                              <Weblink 
                                  key={url[Object.keys(url)[0]].withPre} 
                                  weblinkSrc={url[Object.keys(url)[0]].withPre} 
                                  preview={1} 
                                  urls={urls} 
                                  setUrls={setUrls}
                                  disablePreview={disablePreview}
                                  className="postcard__content__media__img" />
                          </div>
                          :""}
                          </>
                      )}
                  </>:""
                  }
              </div>
              <Lexical 
                  dragState={dragState}
                  toggleLexicalFocus={toggleLexicalFocus}
                  setTextContent={setTextContent}
                  dropHandler={dropHandler}
                  clearContentOnPost={clearContentOnPost}
                  setClearContentOnPost={setClearContentOnPost}
              />
              <input 
                  type="file" 
                  className="upload__addfile"
                  style={addFileStyle}
                  onChange={dropHandler}
                  multiple 
              />
              <div className="upload__feedback">
                  <div className='upload__feedback__checkbox'>
                      <label className="upload__feedback__checkbox__label">Likes
                          <input type="checkbox" className="upload__feedback__checkbox__input" onChange={(e) => postSettingHandler(e,0)} />
                      </label>
                  </div>
                  <div className='upload__feedback__checkbox'>
                      <label className="upload__feedback__checkbox__label">Comments
                          <input type="checkbox" className="upload__feedback__checkbox__input" onChange={(e) => postSettingHandler(e,1)}/>
                      </label>
                  </div>
                  <div className='upload__feedback__checkbox'>
                      <label className="upload__feedback__checkbox__label">Shares
                          <input type="checkbox" className="upload__feedback__checkbox__input" onChange={(e) => postSettingHandler(e,2)} />
                      </label>
                  </div>
                  <br />
                  <select 
                  className="upload__feedback__privacy"
                  onChange={(e) => postSettingHandler(e,3)}
                  >
                      <option>Public</option>
                      <option>Followers</option>
                      <option>Friends</option>
                      <option>Self</option>
                      <option>Save Media</option>
                  </select>
                  {uploadBlocks.length?(
                      <input
                      type="text" 
                      className="upload__feedback__target-directory"
                      value={fileDir}
                      onFocus={autoFillDirectories}
                      onBlur={hideAutoFillDirectories}
                      onChange={updateDir}
                      />
                  ):""}
                  <button className="upload__feedback__submit" onClick={submitPost}>POST</button>
              </div>
              <div className="upload__file-preview">
                  {uploadBlocks.map((uploadBlock,i) => (
                      <div key={uuid()} ref={(element) => upPrevRef.current[i]=element} className="upload__file-preview__file" style={{backgroundImage: `url(${uploadBlocksPreview[i]})`}}>
                          <div className="upload__file-preview__file--close" onClick={(() => removePreview(i))} style={{visibility: isUploading ? 'hidden' : 'visible' }}></div>
                          { uploadBlock.name }
                          <div className="upload__file-preview__file--progress" style={{visibility: isUploading ? 'visible' : 'hidden' }}>
                              <div className="upload__file-preview__file--progress--message" ref={(element) => upProgMsgRef.current[i]=element}>0%</div>
                              <div className="upload__file-preview__file--progress--bar">
                                  <div className="upload__file-preview__file--progress--bar__inner" ref={(element) => upProgPercRef.current[i]=element}></div>
                              </div>
                          </div>
                      </div>
                  ))}
              </div>
          </div>
        </>
    )
}