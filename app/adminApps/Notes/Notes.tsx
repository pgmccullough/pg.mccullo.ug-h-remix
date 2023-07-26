import { useEffect, useState } from "react";
import { useFetcher, useLoaderData } from "@remix-run/react";

export const Notes: React.FC<{}> = () => {
  const { notes } = useLoaderData();

  interface Note {
    _id: string,
    title: string,
    content: string,
    order: number
  }

  const [noteTitles, setNoteTitles] = useState<Note[]>(notes.sort((a:Note,b:Note)=>a.order-b.order));
  const [activeNote, setActiveNote] = useState<Note>(notes.sort((a:Note,b:Note)=>a.order-b.order)[0]);
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  const fetcher = useFetcher();

  useEffect(() => {
    if(fetcher.type==="done") {
      if(fetcher.data.note.insertedId) {
        const newNote = {_id: fetcher.data.note.insertedId, title: "Untitled", content: "", order: noteTitles.length+1};
        setNoteTitles(prev => [...prev, newNote]);
        setActiveNote(newNote);
      }
      if(fetcher.data.note.modifiedCount) setIsUpdating(false);
    }
  },[fetcher])

  const noteClick = (noteId: string) => {
    const newNote = noteTitles.find((note: Note) => note._id===noteId);
    if(newNote) setActiveNote(newNote);
  }

  const createNote = () => {
    fetcher.submit(
      { noteAction: "createNote" },
      { method: "post", action: `/api/notes?index` }
    );
  }

  const updateNote = (e:React.ChangeEvent<HTMLInputElement|HTMLTextAreaElement>) => {
    const activeTitle = noteTitles.find((note:Note) => note._id===activeNote._id);
    if(activeTitle&&e.target.name==="title") activeTitle.title = e.target.value;
    setActiveNote({...activeNote, [e.target.name]:e.target.value});
  }

  const saveNoteUpdate = () => {
    setIsUpdating(true);
    const noteID = activeNote._id;
    fetcher.submit(
      { noteAction: "saveNoteUpdate", noteID, noteData: JSON.stringify(activeNote) },
      { method: "post", action: `/api/notes?index` }
    );
  }

  const deleteNote = (noteID:string) => {
    setNoteTitles(noteTitles.filter(note => note._id!==noteID));
    if(activeNote._id===noteID) {
      const newNote = noteTitles.filter(note => note._id!==noteID)[0];
      setActiveNote(newNote);
    }
    fetcher.submit(
      { noteAction: "deleteNote", noteID },
      { method: "post", action: `/api/notes?index` }
    );
  }

  return (
    <>
      <article className="postcard--left">
        <div className="postcard__time">
          <div className="postcard__time__link--unlink">
            Notes
          </div>
        </div>
        <div className="postcard__content">
          <div className="postcard__content__media"/>
          <div className="note">
            <div className="note__titles">
              {noteTitles.map(note => 
                <div 
                  key={note._id} 
                  onClick={() => noteClick(note._id)} 
                  className={`note__title${note._id===activeNote._id?" note__title--active":""}`}
                >
                  {activeNote._id===note._id?activeNote.title:note.title}
                </div>
              )}
              <div 
                onClick={createNote}
                className={`note__title`}
              >+</div>
            </div>
            <input 
              type="text" 
              className="note__input"
              name="title"
              onChange={updateNote}
              value={activeNote.title}
            />
            <textarea 
              className={`note__textarea${isUpdating?" note__textarea--blur":""}`}
              name="content"
              onChange={updateNote}
              value={activeNote.content}
            >
            </textarea>
            <button
              onClick={saveNoteUpdate} 
              className={`note__button${isUpdating?" note__button--disabled":""}`}
            >UPDATE</button>
            <button 
              onClick={() => deleteNote(activeNote._id)}
              className={`note__button note__button--delete${isUpdating?" note__button--disabled":""}`}
            >DELETE</button>
          </div>
        </div>
      </article>
    </>
  )
}