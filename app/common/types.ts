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
      sharesOn: any,
      likesOn: any
  },
  lastEdited: number,
  media: {
      audio: any,
      directory?: string,
      files: any,
      images: any,
      links: any,
      videos: any
  }
  privacy: "Public"|"Followers"|"Friends"|"Self"|"Save Media"
}

export interface Posts extends Array<Post>{}

export interface dateForm {
  start_code: any,
  event_title: any
  event_details: any
  start_hour: any,
  start_minute: any,
  start_ampm: any, 
  end_month: any, 
  end_date: any, 
  end_year: any,
  end_hour: any, 
  end_minute: any, 
  end_ampm: any
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
  Opened: String,
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