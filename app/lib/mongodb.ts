import { MongoClient, ObjectId } from "mongodb";

declare global {
  // eslint-disable-next-line no-var
  var __mongoClientPromise: Promise<MongoClient> | undefined;
}

const uri = process.env.MONGODB_URL;

if (!uri) {
  throw new Error('Invalid environment variable: "MONGODB_URL"');
}

// Cache the connection promise on globalThis so warm serverless function
// invocations (and Vite dev HMR) re-use the same MongoClient instance.
//
// MongoClient handles connection pooling internally; calling .connect() on
// the same client is a no-op after the first call, so this is safe.
const clientPromise: Promise<MongoClient> =
  globalThis.__mongoClientPromise ??
  (globalThis.__mongoClientPromise = new MongoClient(uri).connect());

export { clientPromise, ObjectId };
