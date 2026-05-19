import bcrypt from "bcryptjs";
import {
    createCookieSessionStorage,
    redirect,
} from "react-router";

import { clientPromise, ObjectId } from "~/lib/mongodb";

const sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
    throw new Error("SESSION_SECRET must be set");
}
const storage = createCookieSessionStorage({
    cookie: {
        name: "sessionToken",
        secure: process.env.NODE_ENV === "production",
        secrets: [sessionSecret],
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 30,
        httpOnly: true,
    },
});
export async function createUserSession(
    userId: string,
    redirectTo: any
) {
    const session = await storage.getSession();
    session.set("userId", userId);
    return redirect(redirectTo, {
        headers: {
            "Set-Cookie": await storage.commitSession(session),
        },
    });
}

function getUserSession(request: Request) {
    return storage.getSession(request.headers.get("Cookie"));
}

export async function getUserId(request: Request) {
  const session = await getUserSession(request);
  const userId = session.get("userId");
  if (!userId || typeof userId !== "string") return null;
  return userId;
}

export async function getUser(request: Request) {
  const userId = await getUserId(request);
  const client = await clientPromise;
  const db = client.db("user_posts");
  if (typeof userId !== "string") {
    return null;
  }
  try {
    const [user] = await db
    .collection('myUsers')
    .find({ _id : new ObjectId(userId) })
    .toArray();
    if (!user) return null;
    const {_id, user_name, role, first_name, last_name, profile_image} = user;
    return {id: _id, user_name, role, first_name, last_name, profile_image: profile_image?.image};
  } catch {
    throw await logout(request);
  }
}

export async function requireUserId(
  request: Request,
  redirectTo: string = new URL(request.url).pathname
) {
  const session = await getUserSession(request);
  const userId = session.get("userId");
  if (!userId || typeof userId !== "string") {
    const searchParams = new URLSearchParams([
      ["redirectTo", redirectTo],
    ]);
    throw redirect(`/h/login?${searchParams}`);
  }
  return userId;
}

export async function login({
  username,
  password
}: any) {
  const client = await clientPromise;
  const db = client.db("user_posts");
  const [user] = await db
  .collection('myUsers')
  .find({ user_name : username })
  .toArray();
  if (!user) return null;
  // Defensive: legacy/OAuth users may not have a password hash.
  if (!user.password) return null;
  const isCorrectPassword = await bcrypt.compare(
    password,
    user.password
  );
  if (!isCorrectPassword) return null;
  return { id: user._id.toString(), username: user.user_name };
}

export async function logout(request: Request, redirectTo: string = "/h/login") {
  const session = await getUserSession(request);
  return redirect(redirectTo, {
    headers: {
      "Set-Cookie": await storage.destroySession(session),
    },
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export type RegisterInput = {
  username: string;
  email: string;
  password: string;
  confirm_password: string;
  first_name: string;
  last_name: string;
};

export type RegisterResult =
  | { ok: true; userId: string }
  | { ok: false; error: string };

const USERNAME_RE = /^[a-zA-Z0-9_.-]{3,32}$/;
// Pragmatic, not RFC 5322-perfect. Accepts "user@host.tld".
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

/**
 * Create a new account. Returns { ok: true, userId } on success, or
 * { ok: false, error } with a human-readable message for the form.
 *
 * Validation:
 *   - all six fields present
 *   - username 3-32 chars, [a-zA-Z0-9_.-]
 *   - email looks like an email
 *   - password >= 8 chars
 *   - confirm_password matches
 *   - username + email both unique (case-insensitive)
 */
export async function register(input: RegisterInput): Promise<RegisterResult> {
  const username = (input.username || "").trim();
  const email = (input.email || "").trim().toLowerCase();
  const first_name = (input.first_name || "").trim();
  const last_name = (input.last_name || "").trim();
  const password = input.password || "";
  const confirm = input.confirm_password || "";

  if (!username || !email || !first_name || !last_name || !password) {
    return { ok: false, error: "All fields are required." };
  }
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      error: "Username must be 3–32 characters: letters, numbers, dot, dash, underscore.",
    };
  }
  if (!EMAIL_RE.test(email)) {
    return { ok: false, error: "That doesn't look like a valid email address." };
  }
  if (password.length < MIN_PASSWORD) {
    return { ok: false, error: `Password must be at least ${MIN_PASSWORD} characters.` };
  }
  if (password !== confirm) {
    return { ok: false, error: "Passwords don't match." };
  }

  const client = await clientPromise;
  const db = client.db("user_posts");

  // Case-insensitive dedupe on username and email.
  const existing = await db.collection("myUsers").findOne({
    $or: [
      { user_name: { $regex: `^${escapeRegex(username)}$`, $options: "i" } },
      { email: { $regex: `^${escapeRegex(email)}$`, $options: "i" } },
    ],
  });
  if (existing) {
    if (existing.user_name?.toLowerCase() === username.toLowerCase()) {
      return { ok: false, error: "That username is already taken." };
    }
    return { ok: false, error: "An account with that email already exists." };
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const result = await db.collection("myUsers").insertOne({
    user_name: username,
    email,
    first_name,
    last_name,
    password: passwordHash,
    role: "user",
    created: Date.now(),
    auth_providers: ["password"],
  });

  return { ok: true, userId: result.insertedId.toString() };
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
