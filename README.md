# 🦚 Shri Krishna Janmashtami Carnival 2026
### Event Registration & Gate Check-in System

A full-stack event management platform for **Shri Krishna Janmashtami Carnival 2026** at **Dhyansthali, Morbi**.

## Features

- 🎫 **Online Event Registration** — Pass selection (₹100 One Day / ₹500 Two Day Resident), attendee info, UPI/GPay payment with UTR reference input
- 🔍 **Pass Status Lookup** — Check registration status by Code or Mobile Number
- 📋 **Admin Dashboard** — Password-protected portal for payment approval / rejection
- 📷 **Gate QR Scanner** — Live camera scanner + barcode reader for check-in at gate entry
- 🖨️ **Printable E-Receipt Pass** — Official pass card with unique scannable QR code (downloads as PNG / PDF)
- 📊 **Live Headcount Analytics** — Real-time attendee counters, revenue, and gate check-in stats

## Tech Stack

- **Backend**: Node.js + Express.js
- **Database**: SQLite3
- **Frontend**: Vanilla HTML/CSS/JS

## Setup & Run Locally

```bash
npm install
node server.js
```

Open [http://localhost:3000](http://localhost:3000)

## Admin Dashboard

URL: `/admin.html`

- **Username**: `admin123`
- **Password**: `JBS@811R`

## Environment Variables (for production)

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | Server port |
| `ADMIN_USER` | `admin123` | Admin username |
| `ADMIN_PASS` | `JBS@811R` | Admin password |
| `DATABASE_PATH` | `./database.db` | SQLite database file path |

## Event Details

- 📅 **Dates**: 4–5 September 2026
- 📍 **Venue**: Dhyansthali, Morbi, Gujarat
