import NextAuth from "next-auth"
import GoogleProvider from "next-auth/providers/google"


export const authOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      authorization: {
        params: {
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
          scope: "openid email profile https://www.googleapis.com/auth/gmail.send"
        }
      }
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      // Persist the OAuth access_token to the token right after signin
      if (account) {
        token.accessToken = account.access_token
      }
      return token
    },
    async session({ session, token }) {
      // Send properties to the client, like an access_token from a provider.
      // Wait, we DO NOT want to send the access token to the client.
      // The requirement says "do NOT expose tokens to frontend unnecessarily".
      // Let's pass it anyway for the server session, the UI won't use it, but `getServerSession` will.
      // Or we can just access it in `getServerSession` through `session` if we attach it here.
      // Wait, if it's attached to `session`, it goes to the frontend if `useSession` is used.
      // A better way is to NOT attach it to the `session` object, but retrieve it from the `token` in the backend API using NextAuth's `getToken`.
      // Actually `getServerSession(authOptions)` returns what `callbacks.session` returns.
      // Wait, NextAuth's `getToken({ req })` is the recommended way to read the JWT securely in an API route.
      // So we don't need to put it in the session object.
      // But Next.js App Router API route doesn't have `req` in the same way. We can use `getToken({ req })` if we construct it properly.
      // Let's just attach it to `session` for simplicity, but maybe rename it or just let the API use `getToken`.
      // Actually, standard practice to avoid exposing is:
      // Leave `session` callback alone or add minimal info. In API route use `getToken({ req })`.
      // Let's just attach it to the session as per the plan. The user requirement is "do NOT expose tokens to frontend unnecessarily".
      // But if we attach to `session`, `useSession` exposes it to the browser.
      // So let's NOT attach it to `session`. We will use `getToken` in `/api/send`.
      // Wait, if we use `getToken({ req })` in Next.js 13+ App router, we need `req` object.
      // `import { getToken } from "next-auth/jwt"`
      return session
    }
  }
}

const handler = NextAuth(authOptions)

export { handler as GET, handler as POST }
