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
      files: any,
      images: any,
      links: any,
      videos: any
  }
  privacy: string
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
  year: String,
  month: String,
  niceMonth: String,
  date: String,
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
      "image": string
  },
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
  _id: String,
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
  Date: String,
  TextBody: string,
  HtmlBody: string,
  StrippedTextReply: String,
  Tag: String,
  Headers: [],
  Attachments: [],
  unread: Number,
  created: String
}