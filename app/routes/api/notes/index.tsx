import type { ActionArgs } from "@remix-run/node";
import { ObjectId } from "~/lib/mongodb";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  let note = null;
  if(user?.role==="administrator") {
    const noteData = await request.formData();
    const noteAction = noteData.get("noteAction")?.toString();
    const noteID = noteData.get("noteID")?.toString();
    const client = await clientPromise;
    const db = client.db("user_posts");
    if(noteAction==="createNote") {
      const newNote = {title:"Untitled",content:""};
      note = await db.collection('myNotes').insertOne(newNote);
      return { note };
    }
    if(noteAction==="deleteNote") {
      const noteToDelete = await db.collection('myNotes').find({_id : new ObjectId(noteID)}).toArray();
      note = await db.collection('myNotes').deleteOne(noteToDelete[0]);
      return { note };
    }
    if(noteAction==="saveNoteUpdate") {
      const noteJSON = noteData.get("noteData")?.toString();
      const noteObj = JSON.parse(noteJSON||"");
      const noteToUpdate = await db.collection('myNotes').find({_id : new ObjectId(noteID)}).toArray();
      const { title, content } = noteObj;
      note = await db.collection('myNotes').updateOne(noteToUpdate[0], {$set: { title, content }});
      return { note };
    }
  }
}