/**
 * Tiny helpers for normalizing Mongo documents before they cross the
 * loader → client boundary.
 *
 * Mongo v6's `ObjectId` instances no longer serialize as bare hex strings
 * over RR7's loader-data wire format — they end up as plain objects on
 * the client, which then template-interpolate as "[object Object]". The
 * cure is to coerce any ObjectId field to its hex string before return.
 */

import type { ObjectId } from "mongodb";

type WithId = { _id?: ObjectId | string | unknown };

/** String-ify a single doc's `_id` (and any other Object-ish id you pass in). */
export function serializeDoc<T extends WithId>(
  doc: T
): Omit<T, "_id"> & { _id: string } {
  return { ...doc, _id: String(doc._id) };
}

/** Same for an array. */
export function serializeDocs<T extends WithId>(
  docs: T[]
): Array<Omit<T, "_id"> & { _id: string }> {
  return docs.map(serializeDoc);
}
