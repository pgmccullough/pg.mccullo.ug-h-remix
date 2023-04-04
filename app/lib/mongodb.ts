import { MongoClient, ObjectId } from 'mongodb'

declare global {
  var __db: MongoClient | undefined;
}

if (!process.env.MONGODB_URL) {
  throw new Error('Invalid environment variable: "MONGODB_URI"')
}

const uri = process.env.MONGODB_URL

let client
let clientPromise: Promise<MongoClient>

if (!process.env.MONGODB_URL) {
  throw new Error('Please add your Mongo URI to .env.local')
}

if (process.env.NODE_ENV === "production") {
  client = new MongoClient(uri);
  clientPromise = client.connect();
} else {
  if(!global.__db) {
    global.__db = new MongoClient(uri);
  }
  clientPromise = global.__db.connect();
}

export { clientPromise, ObjectId };