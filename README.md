# TotoConnect Backend API

REST API server for the TotoConnect platform — a ride-sharing and blogging application.

## Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js v4
- **Database:** MongoDB Atlas (Mongoose ODM)
- **Auth:** JWT + Google OAuth 2.0
- **File Uploads:** Cloudinary (via Multer)
- **Payments:** Cashfree Gateway
- **Email:** SendGrid

## Prerequisites

- [Node.js](https://nodejs.org/) v18+
- [MongoDB Atlas](https://www.mongodb.com/atlas) account (or local MongoDB)
- [Cloudinary](https://cloudinary.com/) account
- [SendGrid](https://sendgrid.com/) account
- Google OAuth 2.0 credentials

## Getting Started

```bash
# 1. Install dependencies
npm install

# 2. Create your environment file
cp .env.example .env
# Then fill in your real credentials in .env

# 3. Start the development server
npm run dev
```

The server runs at `http://localhost:5000` by default.

## Scripts

| Command        | Description                        |
| -------------- | ---------------------------------- |
| `npm start`    | Start server with nodemon          |
| `npm run dev`  | Start server with nodemon (alias)  |

## Folder Structure

```
server/
├── server.js               # Entry point
├── authMiddleware.js        # JWT verification
├── config/                  # DB, Cloudinary, env config
├── models/                  # Mongoose schemas
├── middleware/              # File upload middleware
├── routes/                  # Express route handlers
├── utils/                   # Email utilities
└── email_template/          # HTML email templates
```

## API Routes

| Prefix            | Description                              |
| ----------------- | ---------------------------------------- |
| `/api/auth`       | Signup, login, OAuth, password reset     |
| `/api/users`      | Wallet, profile, photos                  |
| `/api/posts`      | Blog CRUD                                |
| `/api/routes`     | Ride routes                              |
| `/api/bookings`   | Ride bookings                            |
| `/api/reviews`    | Driver reviews                           |
| `/api/drivers`    | Driver registration & management         |
| `/api/payment`    | Cashfree payment flow                    |
| `/api/settings`   | Profile/password/account management      |
| `/api/support`    | Contact form                             |

## Environment Variables

See [`.env.example`](.env.example) for all required variables.

## License

Private — All rights reserved.
