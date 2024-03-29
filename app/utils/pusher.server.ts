import Pusher from "pusher";
import type { ObjectId } from "mongodb";

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true
});

// EMAIL PUSHERS

export const receiveEmail = async(email:{ acknowledged: boolean, insertedId: ObjectId }) => {
  await pusher.trigger("client-receive-email", "refresh", {
    email
  });
}

export const deleteEmail = async(email:any[]) => {
  await pusher.trigger("client-delete-email", "refresh", {
    email
  });
}

export const readEmail = async(email:any[]) => {
  await pusher.trigger("client-read-email", "refresh", {
    email
  });
}

export const sendEmail = async(email:{ acknowledged: boolean, insertedId: ObjectId }) => {
  await pusher.trigger("client-send-email", "refresh", {
    email
  });
}

// HEADER PUSHERS

export const newWatchWord = async(watchword: any) => {
  await pusher.trigger("client-change-watchword", "refresh", {
    watchword
  });
}

export const newStoryImg = async(storyImg: any) => {
  await pusher.trigger("client-change-storyImg", "refresh", {
    storyImg
  });
}

export const newProfileImg = async(profileImg: any) => {
  await pusher.trigger("client-change-profileImg", "refresh", {
    profileImg
  });
}

