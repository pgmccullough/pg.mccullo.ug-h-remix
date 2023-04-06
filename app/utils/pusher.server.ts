import Pusher from "pusher";
import type { EmailInterface } from "~/common/types";
import type { ObjectId } from "mongodb";

export const pusher = new Pusher({
  appId: process.env.PUSHER_APP_ID!,
  key: process.env.PUSHER_KEY!,
  secret: process.env.PUSHER_SECRET!,
  cluster: process.env.PUSHER_CLUSTER!,
  useTLS: true
});

// export async function newEmail(email:EmailInterface) {
export const newEmail = async(email:{ acknowledged: boolean, insertedId: ObjectId }) => {
  // ref: https://pusher.com/docs/channels/using_channels/events/
  await pusher.trigger("client-new-email", "refresh", {
    email
  });
}