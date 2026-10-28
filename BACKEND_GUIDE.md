# 🍾 New Year's Eve Gala Reservation & Ticketing: Complete Backend Guide

This guide explains **exactly what backend components you need**, **why you need them**, and **how to set them up step-by-step** to power your luxury Gala Ticket & Dining Table Reservation platform.

---

## 1. What You Need in the Backend (The Core Architecture)

A high-ticket luxury event (with VIP tables costing \$1,000–\$10,000+) requires a dependable backend with 5 essential pillars:

```
┌───────────────────────────────────────────────────────────┐
│                     FRONTEND WEBSITE                      │
│           (Floor Plan, Countdown, Checkout Modal)         │
└─────────────────────────────┬─────────────────────────────┘
                              │ HTTP / REST API
                              ▼
┌───────────────────────────────────────────────────────────┐
│                     BACKEND SERVER                        │
│   ┌─────────────────────┐       ┌───────────────────────┐ │
│   │ 1. Table Controller │       │ 2. Booking Controller │ │
│   └──────────┬──────────┘       └───────────┬───────────┘ │
│              │                              │             │
│   ┌──────────┴──────────┐       ┌───────────┴───────────┐ │
│   │ 3. Lock/Hold Engine │       │ 4. Payment Gateway    │ │
│   │  (Prevents Double   │       │   (Stripe / PayPal)   │ │
│   │   Booking Race)     │       └───────────┬───────────┘ │
│   └──────────┬──────────┘                   │             │
└──────────────┼──────────────────────────────┼─────────────┘
               ▼                              ▼
┌─────────────────────────┐      ┌─────────────────────────┐
│     DATABASE STORE      │      │    TRANSACTIONAL EMAIL  │
│ (Postgres/MySQL/Mongo)  │      │ (SendGrid / Resend PDF) │
└─────────────────────────┘      └─────────────────────────┘
```

### The 5 Essential Pillars:

1. **Table Inventory & Status Engine**:
   - Manages physical table availability (`available`, `held`, `reserved`).
   - Stores capacity (2-top, 4-top, 8-top), minimum spend, zone (Stage-side, Balcony).
2. **Concurrency & Temporary Hold System (Anti-Double-Booking)**:
   - When User A opens the checkout drawer for Table #12, the backend places a **10-minute temporary lock** on that table.
   - If User B attempts to select Table #12 at the same second, they receive a `"Table currently in checkout by another guest"` message instead of double-booking.
3. **Reservation & Guest Data Store**:
   - Records the primary contact info (Name, Email, Phone), dietary requirements, VIP requests, ticket reference code (e.g. `NYE-8924-VIP`).
4. **Payment Gateway Integration**:
   - Integrates with **Stripe** or **PayPal** to charge the guest's card before locking the reservation permanently.
   - Uses webhooks (`stripe-webhook`) to ensure the booking is marked `CONFIRMED` only after successful charge.
5. **Digital Pass & Email Delivery**:
   - Sends the PDF / QR Code boarding pass to the guest's email address upon payment confirmation.

---

## 2. Database Schema Design

Whether using **SQL (PostgreSQL, MySQL, SQLite)** or **NoSQL (MongoDB, Firestore)**, here are the essential entities:

### 1. `tables` Table
| Column Name | Type | Description |
| :--- | :--- | :--- |
| `id` | VARCHAR(16) PRIMARY KEY | Unique ID (e.g., `T12`) |
| `table_number` | INT | Table visual number (e.g., `12`) |
| `capacity` | INT | Maximum seating (e.g., `4`, `8`) |
| `tier` | VARCHAR(64) | Experience level (e.g., `Grand Seated`, `Imperial VIP`) |
| `zone` | VARCHAR(64) | Location (e.g., `Stage-side Center Tier`) |
| `price` | DECIMAL(10,2) | Total reservation fee (e.g., `2400.00`) |
| `champagne` | VARCHAR(128) | Included bottle service details |
| `status` | ENUM | `'available'`, `'held'`, `'reserved'` |
| `held_until` | TIMESTAMP | Expiration time of temporary hold |

### 2. `bookings` Table
| Column Name | Type | Description |
| :--- | :--- | :--- |
| `id` | VARCHAR(36) PRIMARY KEY | UUID or primary key |
| `booking_ref` | VARCHAR(16) UNIQUE | Branded pass code (e.g., `NYE-8924-VIP`) |
| `table_id` | VARCHAR(16) FOREIGN KEY | References `tables.id` (or `NULL` if lounge pass) |
| `tier_id` | VARCHAR(32) | Package tier (`starlight`, `grand`, `imperial`) |
| `guest_count` | INT | Number of guests attending |
| `first_name` | VARCHAR(100) | Primary guest first name |
| `last_name` | VARCHAR(100) | Primary guest last name |
| `email` | VARCHAR(255) | Email for digital pass delivery |
| `phone` | VARCHAR(50) | Mobile number for SMS concierge |
| `dietary_notes` | TEXT | Allergies, vegan, kosher preferences |
| `special_requests`| TEXT | Anniversary notes, valet, custom champagne |
| `total_amount` | DECIMAL(10,2) | Total amount billed |
| `payment_status` | ENUM | `'pending'`, `'paid'`, `'refunded'` |
| `created_at` | TIMESTAMP | Creation date & time |

---

## 3. Required API Endpoints

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/tables` | Returns all tables and their current live status |
| `POST` | `/api/tables/hold` | Locks a table for 10 minutes while customer fills checkout |
| `POST` | `/api/bookings/reserve` | Creates a confirmed reservation & assigns booking ref |
| `GET` | `/api/bookings/:ref` | Fetches ticket pass by confirmation code (for QR verification) |
| `POST` | `/api/payments/create-intent` | *(Optional)* Creates Stripe PaymentIntent for credit cards |
| `GET` | `/api/admin/bookings` | Admin endpoint to view event guest list and total revenue |

### Example Request Body for `POST /api/bookings/reserve`:
```json
{
  "tableId": "T12",
  "tableNumber": 12,
  "tier": "grand",
  "tierName": "Grand Ballroom Dining",
  "guestCount": 4,
  "primaryGuest": {
    "firstName": "Lord Alexander",
    "lastName": "Vanderbilt",
    "email": "alexander@vanderbilt.com",
    "phone": "+1 (555) 019-2834"
  },
  "dietaryNotes": "1x Pescatarian, 1x Nut allergy",
  "specialRequests": "Anniversary celebration table placement",
  "totalAmount": 2400
}
```

---

## 4. How to Run the Included Backend (Quick Start in 2 Minutes)

We have already included a fully configured, working Node.js & Express server in the `backend/` directory of your project!

### Step 1: Open a terminal in the `backend` folder
```powershell
cd C:\Users\abi15\.gemini\antigravity\scratch\nye-gala-reservation\backend
```

### Step 2: Install dependencies
```powershell
npm install
```

### Step 3: Start the server
```powershell
npm start
```
You will see:
```text
====================================================
🍾 L'ÉTOILE NYE GALA BACKEND RUNNING ON http://localhost:5000
====================================================
- Health Check:    GET  http://localhost:5000/api/health
- Tables List:     GET  http://localhost:5000/api/tables
- Reserve Booking: POST http://localhost:5000/api/bookings/reserve
- Lookup Booking:  GET  http://localhost:5000/api/bookings/:ref
- Admin Overview:  GET  http://localhost:5000/api/admin/bookings
====================================================
```

### Step 4: Switch Frontend from Mock to Live Backend
Open [api-service.js](file:///C:/Users/abi15/.gemini/antigravity/scratch/nye-gala-reservation/api-service.js) in your editor and change:
```javascript
const API_CONFIG = {
  USE_MOCK_BACKEND: false, // <-- Change from true to false
  API_BASE_URL: 'http://localhost:5000/api'
};
```
Now, whenever someone books a table on the website, it sends the data directly to your server and persists it to `database.json`!

---

## 5. How to Add Credit Card Payments (Stripe Integration)

To accept real credit cards (Visa, MasterCard, Amex):

1. **Install Stripe SDK in backend**:
   ```bash
   npm install stripe
   ```

2. **Add a Payment Route in `backend/server.js`**:
   ```javascript
   const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

   app.post('/api/create-payment-intent', async (req, res) => {
     const { amount, bookingRef } = req.body;
     
     const paymentIntent = await stripe.paymentIntents.create({
       amount: Math.round(amount * 100), // in cents
       currency: 'usd',
       metadata: { bookingRef }
     });

     res.json({ clientSecret: paymentIntent.client_secret });
   });
   ```

3. **In the Frontend Checkout Modal**:
   Load Stripe Elements (`https://js.stripe.com/v3/`) and call `stripe.confirmCardPayment(clientSecret)`.

---

## 6. How to Add Automated Email Confirmation

To automatically email the guest their luxury digital ticket pass:

1. **Install Resend or SendGrid**:
   ```bash
   npm install resend
   ```
2. **Trigger email inside `POST /api/bookings/reserve`**:
   ```javascript
   const { Resend } = require('resend');
   const resend = new Resend(process.env.RESEND_API_KEY);

   await resend.emails.send({
     from: "concierge@letoile-gala.com",
     to: primaryGuest.email,
     subject: `Your VIP Gala Confirmation - Code: ${bookingRef}`,
     html: `<h1>Welcome to L'Étoile NYE Gala</h1><p>Your Table #${tableNumber} is confirmed.</p>`
   });
   ```
