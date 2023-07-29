import type { ActionArgs } from "@remix-run/node";

import { getUser } from "~/utils/session.server";
import { clientPromise } from "~/lib/mongodb";

import type { DateForm } from "~/common/types";

export const action = async ({ request }: ActionArgs) => {
  const user = await getUser(request);
  if(user?.role==="administrator") {
    const eventAndToken = await request.formData();
    const newEventJSON = eventAndToken.get("newEvent")?.toString();
    const accessToken = eventAndToken.get("accessToken")?.toString();
    const newEvent: DateForm = JSON.parse(newEventJSON!);
    const client = await clientPromise;
    const db = client.db("user_posts");
    const startHour = newEvent.start_ampm==="PM"&&newEvent.start_hour!=="12"?Number(newEvent.start_hour)+12:newEvent.start_hour;
    const endHour = newEvent.end_ampm==="PM"&&newEvent.end_hour!=="12"?Number(newEvent.end_hour)+12:newEvent.end_hour;
    let googleCreate;
    const body = JSON.stringify({
      "summary": newEvent.event_title,
      "description": newEvent.event_details,
      "start": {
        "dateTime": `${newEvent.start_year}-${newEvent.start_month_numeric}-${newEvent.start_date}T${startHour}:${newEvent.start_minute}:00-04:00`,
        "timeZone": "America/New_York"
      },
      "end": {
        "dateTime": `${newEvent.end_year}-${newEvent.end_month_numeric}-${newEvent.end_date}T${endHour}:${newEvent.end_minute}:00-04:00`,
        "timeZone": "America/New_York"
      }
    })
    try {
      googleCreate = await fetch(`https://www.googleapis.com/calendar/v3/calendars/patrick.g.mccullough@gmail.com/events?access_token=${accessToken}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body
      });
      googleCreate = await googleCreate.json();
    } catch(error) {
      googleCreate = error;
      return { error: { message: "Unable to create event in Google" }};
    }
    const dbFormat = {
      event_title: newEvent.event_title,
      event_details: newEvent.event_details,
      datesArr: [`${newEvent.start_year}${newEvent.start_month_numeric}${newEvent.start_date}`],
      start_time_string: `${startHour}${newEvent.start_minute}`,
      start_time_formatted: `${newEvent.start_hour}:${newEvent.start_minute} ${newEvent.start_ampm}`,
      end_time_formatted: `${newEvent.end_hour}:${newEvent.end_minute} ${newEvent.end_ampm}`,
      end_time_string: `${endHour}${newEvent.end_minute}`
    }
    const outcome = await db.collection('myDates').insertOne({...dbFormat, gId: googleCreate.id});
    return { newEvent: {db: outcome, google: googleCreate }};
  }
}