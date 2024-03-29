export interface User {
  user_name: string,
  role: string
}

export interface Post {
  _id: string,
  content: string,
  created: number,
  feedback: {
      commentsOn: any,
      comments: any,
      sharesOn: any,
      shares: any,
      likesOn: any,
      likes: any,
  },
  lastEdited: number,
  media: any|{
      audio: any,
      directory?: string,
      files: any[]|null,
      images: any[]|null,
      links: any[]|null,
      videos: any[]|null,
  }
  privacy: "Public"|"Followers"|"Friends"|"Self"|"Save Media"|"Story"
}

export let BlankPost: Post = {
  _id: "",
  content: "",
  created: 0,
  feedback: {
      commentsOn: false,
      comments: null,
      sharesOn: false,
      shares: null,
      likesOn: false,
      likes: null,
  },
  lastEdited: 0,
  media: {
      audio: null,
      files: "",
      images: "",
      links: "",
      videos: "",
  },
  privacy: "Public"
}

export interface Posts extends Array<Post>{}

export interface DateForm {
  event_title: string,
  event_details: string,
  start_month_numeric: string,
  start_month: string, 
  start_date: string, 
  start_year: string,
  start_hour: string,
  start_minute: string,
  start_ampm: "AM"|"PM", 
  end_month_numeric: string, 
  end_month: string, 
  end_date: string, 
  end_year: string,
  end_hour: string, 
  end_minute: string, 
  end_ampm: "AM"|"PM"
}

export interface niceDay {
  year: string,
  month: string,
  niceMonth: string,
  date: string,
  full: Date
}

export interface month {
  curDate: any,
  firstDay: any,
  prevMonth: any,
  prevYear: any,
  nextMonth: any,
  nextYear: any,
  monthName: any,
  monthArr: any,
  year: any
}

export interface SiteData {
  cover_image:{
      "gps":{
          "lat": string,
          "long": string,
          "string": string
      },
      "timestamp": number,
      "image": string // format: https://api.mccullo.ug/media/images/user/cover/8680f5a0-bbd5-11ed-9cfb-7ffb3c1a9f61_1678076127738.jpg
  },
  past_cover_images:{
    "gps":{
        "lat": string,
        "long": string,
        "string": string
    },
    "timestamp": number,
    "image": string // format: https://api.mccullo.ug/media/images/user/cover/8680f5a0-bbd5-11ed-9cfb-7ffb3c1a9f61_1678076127738.jpg
  }[],
  profile_image:{
      "gps":{
          "lat": string,
          "long": string,
          "string": string
      },
      "timestamp": number,
      "image": string
  },
  site_description: string,
  site_name: string,
  watchword:{
      word: string,
      timestamp: number
  }
}

export interface EmailInterface {
  _id: string,
  FromName: String,
  MessageStream: String,
  From: String,
  FromFull: {Email: String, Name: String, MailboxHash: String},
  To: String,
  ToFull: [],
  Cc: String,
  CcFull: [],
  Bcc: String,
  BccFull: [],
  OriginalRecipient: String,
  Subject: String,
  MessageID: String,
  ReplyTo: String,
  MailboxHash: String,
  Opened: string,
  Date: string,
  TextBody: string,
  HtmlBody: string,
  StrippedTextReply: String,
  Tag: String,
  Headers: [],
  Attachments: [],
  unread: Number,
  created: String
}

export interface YouTubeVideo {
  video: string, 
  show: boolean, 
  meta: {title: string, thumbnail: string}|null
}

export interface GoogleEvent {
  created: string, 
  creator: {email: string, displayName: string, self: boolean},
  end: {dateTime: string, timeZone: string, date?: string},
  etag: string,
  eventType: string,
  htmlLink: string,
  iCalUID: string,
  id: string,
  kind: string,
  location: string,
  organizer: {email: string, displayName: string, self: boolean},
  reminders: {useDefault: boolean},
  sequence: number,
  start: {dateTime: string, timeZone: string, date?:string},
  status: string,
  summary: string,
  updated: string,
}

export interface DBEvent {
  event_title: string,
  event_details: string,
  datesArr: string[],
  start_time_string: string,
  start_time_formatted: string,
  end_time_formatted: string,
  end_time_string: string,
  gId?: string
}

export interface DayEvent {
  datesArr: string[],
  end_time_formatted: string,
  end_time_string: string,
  event_details?: string,
  event_title: string,
  gId: string,
  start_time_formatted: string,
  start_time_string: string,
  _id: string
}

export interface WishItem {
  url: string,
  _id: string,
  ['og:title']: string,
  ['og:description']: string,
  ['og:url']: string,
  ['og:site_name']: string,
  ['og:image']: string,
  ['og:image:alt']: string
  ['og:product:price:amount']: string
  ['image']?: string[],
  ['name']?: string,
  ['offers']?: {price: string},
  ['description']?: string
}

export interface Job {
  _id: string,
  title: string,
  deadline: `${number|string}/${number|string}/${number}`|``|any,
  month: `${number|string}`,
  date: `${number|string}`,
  year: `${number}`,
  totalCount: `${number}`|string,
  units: string,
  url: {title: string, url: string}[],
  curCount: `${number}`,
  dailies: {[key: `${number|string}-${number|string}-${number|string}`]: `${number}`},
  notes: [],
  order: number,
  archive: boolean
}

export interface IPData {
  city: string,
  continent_code: string,
  continent_name: string,
  country_code: string,
  country_name: string,
  ip: string
  latitude: number
  location: {
    geoname_id: number, 
    capital: 'Washington D.C.', 
    languages: Array<{code: string, name: string, native: string}>,
    country_flag: string,
    country_flag_emoji: string,
    calling_code: string,
    country_flag_emoji_unicode: string,
    is_eu: boolean
  }
  longitude: number
  region_code: string
  region_name: string
  type: string
  zip: string
}

export interface Visitor {
  customName: string|null,
  history: Array<{action: any, path: any, timestamp: any}>,
  ip: Array<string>,
  ipData: Array<IPData|null>,
  guestUUID: Array<string>,
  user: Array<User|null>
}