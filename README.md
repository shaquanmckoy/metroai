This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Deriv OAuth setup

Register MetroAI as an OAuth 2.0 application in the Deriv developer dashboard, then set its application ID in every deployment environment:

```bash
NEXT_PUBLIC_DERIV_APP_ID=your_deriv_oauth_app_id
```

Register the production callback as the exact HTTPS dashboard URL, without a trailing slash:

```text
https://your-production-domain.example/dashboard
```

The protocol, hostname, path, port, and trailing slash must match exactly. Register each preview or development callback separately when those environments need OAuth access. Deriv redirects back with an authorization code; MetroAI verifies the PKCE state, exchanges the code through `/api/deriv/oauth/token`, loads the user's Options accounts, and requests an account-scoped trading WebSocket through Deriv's OTP endpoint.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
