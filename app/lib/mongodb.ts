import { MongoClient } from 'mongodb'

if (!process.env.MONGODB_URL) {
  throw new Error('Invalid environment variable: "MONGODB_URI"')
}

const uri = process.env.MONGODB_URL

let client
let clientPromise: Promise<MongoClient>

if (!process.env.MONGODB_URL) {
  throw new Error('Please add your Mongo URI to .env.local')
}

client = new MongoClient(uri)
clientPromise = client.connect()

export { clientPromise };

