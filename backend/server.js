/**
 * Gala reservation backend.
 * Built with Node.js + Express and a local JSON store.
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

const { Resend } = require('resend');
const Stripe = require('stripe');

const envCandidates = [
  path.join(__dirname, '.env'),
  path.join(__dirname, 'backend', '.env')
];

for (const envPath of envCandidates) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const app = express();
const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(__dirname, 'database.json');
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

app.use(cors());
app.use(express.json());

const tableHolds = new Map();
const HOLD_DURATION_MINUTES = 10;

function getDatabase() {
  if (!fs.existsSync(DB_FILE)) {
    const defaultData = {
      tables: [
        { id: 'T01', number: 1, capacity: 2, tier: 'Grand Seated', zone: 'Balcony Promenade', price: 1160, status: 'available', champagne: '1x Dom Pérignon Brut' },
        { id: 'T02', number: 2, capacity: 2, tier: 'Grand Seated', zone: 'Balcony Promenade', price: 1160, status: 'available', champagne: '1x Dom Pérignon Brut' },
        { id: 'T03', number: 3, capacity: 4, tier: 'Grand Seated', zone: 'Center Ballroom', price: 2320, status: 'reserved', champagne: '2x Dom Pérignon Brut' },
        { id: 'T04', number: 4, capacity: 4, tier: 'Grand Seated', zone: 'Center Ballroom', price: 2320, status: 'available', champagne: '2x Dom Pérignon Brut' },
        { id: 'T05', number: 5, capacity: 6, tier: 'Grand Seated', zone: 'Center Ballroom', price: 3480, status: 'available', champagne: '3x Dom Pérignon Brut' },
        { id: 'T06', number: 6, capacity: 6, tier: 'Grand Seated', zone: 'Center Ballroom', price: 3480, status: 'reserved', champagne: '3x Dom Pérignon Brut' },
        { id: 'T07', number: 7, capacity: 4, tier: 'Grand Seated', zone: 'Center Ballroom', price: 2320, status: 'available', champagne: '2x Dom Pérignon Brut' },
        { id: 'T08', number: 8, capacity: 4, tier: 'Grand Seated', zone: 'Center Ballroom', price: 2320, status: 'available', champagne: '2x Dom Pérignon Brut' },
        { id: 'T09', number: 9, capacity: 8, tier: 'Imperial VIP', zone: 'Front Stage Salon', price: 9900, status: 'available', champagne: 'Vintage 2013 Unlimited' },
        { id: 'T10', number: 10, capacity: 8, tier: 'Imperial VIP', zone: 'Front Stage Salon', price: 9900, status: 'available', champagne: 'Vintage 2013 Unlimited' },
        { id: 'T11', number: 11, capacity: 8, tier: 'Imperial VIP', zone: 'Front Stage Salon', price: 9900, status: 'reserved', champagne: 'Vintage 2013 Unlimited' },
        { id: 'T12', number: 12, capacity: 4, tier: 'Grand Seated', zone: 'Center Ballroom Ring', price: 2400, status: 'available', champagne: '2x Dom Pérignon Brut' },
        { id: 'T13', number: 13, capacity: 2, tier: 'Grand Seated', zone: 'Mezzanine Terrace', price: 1160, status: 'available', champagne: '1x Dom Pérignon Brut' },
        { id: 'T14', number: 14, capacity: 2, tier: 'Grand Seated', zone: 'Mezzanine Terrace', price: 1160, status: 'reserved', champagne: '1x Dom Pérignon Brut' },
        { id: 'T15', number: 15, capacity: 6, tier: 'Grand Seated', zone: 'Center Ballroom', price: 3480, status: 'available', champagne: '3x Dom Pérignon Brut' },
        { id: 'T16', number: 16, capacity: 8, tier: 'Imperial VIP', zone: 'Private Royal Box', price: 10500, status: 'available', champagne: 'Vintage 2013 Unlimited' }
      ],
      bookings: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(defaultData, null, 2));
    return defaultData;
  }

  return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}

function saveDatabase(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

async function sendBookingConfirmationEmail(booking) {
  const guestEmail = booking?.primaryGuest?.email;

  if (!guestEmail) {
    return { success: false, message: 'No guest email available for confirmation.' };
  }

  if (!resend) {
    console.log(`📧 Mock confirmation email sent to ${guestEmail} for booking ${booking.bookingRef}`);
    return {
      success: true,
      mode: 'mock',
      to: guestEmail,
      bookingRef: booking.bookingRef
    };
  }

  try {
    const response = await resend.emails.send({
      from: 'concierge@yourdomain.com',
      to: [guestEmail],
      subject: `Your gala reservation is confirmed - ${booking.bookingRef}`,
      html: `
        <h2>Reservation confirmed</h2>
        <p>Hello ${booking.primaryGuest.firstName},</p>
        <p>Your table reservation for ${booking.tableNumber} is confirmed.</p>
        <p><strong>Booking reference:</strong> ${booking.bookingRef}</p>
        <p><strong>Total amount:</strong> $${booking.totalAmount}</p>
      `
    });

    return {
      success: true,
      mode: 'resend',
      to: guestEmail,
      bookingRef: booking.bookingRef,
      id: response?.id || null
    };
  } catch (error) {
    console.error('Email send failed:', error.message);
    return {
      success: false,
      mode: 'resend',
      to: guestEmail,
      bookingRef: booking.bookingRef,
      error: error.message
    };
  }
}

setInterval(() => {
  const now = Date.now();
  for (const [tableId, hold] of tableHolds.entries()) {
    if (hold.expiresAt < now) {
      tableHolds.delete(tableId);
      console.log(`⏱️ Hold expired for table: ${tableId}`);
    }
  }
}, 30000);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'NYE Gala Backend API', timestamp: new Date() });
});

app.get('/api/tables', (req, res) => {
  const db = getDatabase();
  const now = Date.now();

  const tables = db.tables.map((table) => {
    const hold = tableHolds.get(table.id);
    if (table.status === 'available' && hold && hold.expiresAt > now) {
      return { ...table, status: 'held', heldUntil: hold.expiresAt };
    }
    return table;
  });

  res.json({ success: true, count: tables.length, tables });
});

app.post('/api/tables/hold', (req, res) => {
  const { tableId, guestEmail } = req.body;
  if (!tableId || !guestEmail) {
    return res.status(400).json({ success: false, message: 'Missing tableId or guestEmail' });
  }

  const db = getDatabase();
  const table = db.tables.find((item) => item.id === tableId);
  if (!table) {
    return res.status(404).json({ success: false, message: 'Table not found' });
  }

  if (table.status === 'reserved') {
    return res.status(409).json({ success: false, message: 'Table is already reserved by another party' });
  }

  const existingHold = tableHolds.get(tableId);
  const now = Date.now();
  if (existingHold && existingHold.expiresAt > now && existingHold.guestEmail !== guestEmail) {
    return res.status(409).json({ success: false, message: 'Table is currently held by another guest' });
  }

  const expiresAt = now + HOLD_DURATION_MINUTES * 60 * 1000;
  tableHolds.set(tableId, { guestEmail, expiresAt });

  res.json({
    success: true,
    message: `Table held for ${HOLD_DURATION_MINUTES} minutes`,
    tableId,
    expiresAt
  });
});

app.post('/api/bookings/reserve', async (req, res) => {
  const {
    tableId,
    tableNumber,
    tier,
    tierName,
    guestCount,
    primaryGuest,
    dietaryNotes,
    specialRequests,
    totalAmount
  } = req.body;

  if (!primaryGuest || !primaryGuest.firstName || !primaryGuest.lastName || !primaryGuest.email || !primaryGuest.phone) {
    return res.status(400).json({
      success: false,
      message: 'Validation Error: Primary guest first name, last name, email, and phone are mandatory.'
    });
  }

  const db = getDatabase();

  if (tableId && tableId !== 'LOUNGE') {
    const tableIndex = db.tables.findIndex((item) => item.id === tableId);
    if (tableIndex === -1) {
      return res.status(404).json({ success: false, message: 'Selected table does not exist.' });
    }

    if (db.tables[tableIndex].status === 'reserved') {
      return res.status(409).json({
        success: false,
        message: 'This table has already been reserved. Please select another table.'
      });
    }

    db.tables[tableIndex].status = 'reserved';
    tableHolds.delete(tableId);
  }

  const bookingRef = 'NYE-' + Math.floor(1000 + Math.random() * 9000) + '-VIP';
  const newBooking = {
    id: 'book_' + Date.now(),
    bookingRef,
    createdAt: new Date().toISOString(),
    status: 'CONFIRMED',
    tableId: tableId || 'LOUNGE',
    tableNumber: tableNumber || 'Lounge',
    tier,
    tierName,
    guestCount: guestCount || 1,
    primaryGuest,
    dietaryNotes: dietaryNotes || 'None',
    specialRequests: specialRequests || 'None',
    totalAmount: Number(totalAmount) || 0,
    paymentStatus: 'PAID_MOCK'
  };

  db.bookings.push(newBooking);
  saveDatabase(db);

  const emailResult = await sendBookingConfirmationEmail(newBooking);

  console.log(`✅ [New Booking] Ref: ${bookingRef} | Guest: ${primaryGuest.firstName} ${primaryGuest.lastName} | Table: #${tableNumber} | Total: $${totalAmount}`);

  res.status(201).json({
    success: true,
    message: 'Gala reservation confirmed successfully.',
    booking: newBooking,
    email: emailResult
  });
});

app.post('/api/email/test', async (req, res) => {
  const { email = 'guest@example.com', bookingRef = 'NYE-TEST-EMAIL' } = req.body || {};

  const mockBooking = {
    bookingRef,
    tableNumber: 12,
    totalAmount: 2400,
    primaryGuest: {
      firstName: 'Guest',
      lastName: 'Test',
      email
    }
  };

  const result = await sendBookingConfirmationEmail(mockBooking);

  res.json({ success: true, email: result });
});

app.get('/api/bookings/:bookingRef', (req, res) => {
  const { bookingRef } = req.params;
  const db = getDatabase();
  const match = db.bookings.find((booking) => booking.bookingRef.toUpperCase() === bookingRef.toUpperCase());

  if (!match) {
    return res.status(404).json({ success: false, message: 'Reservation not found' });
  }

  res.json({ success: true, booking: match });
});

app.get('/api/admin/bookings', (req, res) => {
  const db = getDatabase();
  res.json({
    success: true,
    totalBookings: db.bookings.length,
    revenue: db.bookings.reduce((sum, booking) => sum + (booking.totalAmount || 0), 0),
    bookings: db.bookings
  });
});

app.post('/api/payments/create-intent', async (req, res) => {
  const { amount, bookingRef, currency = 'usd' } = req.body || {};

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'A valid amount is required to create a payment intent.'
    });
  }

  if (!stripe) {
    const mockClientSecret = `mock_client_secret_${Date.now()}`;
    return res.json({
      success: true,
      mode: 'mock',
      clientSecret: mockClientSecret,
      paymentIntentId: `mock_${Date.now()}`,
      amount: Number(amount),
      currency,
      bookingRef: bookingRef || 'demo-booking',
      message: 'Stripe is not configured yet. This mock intent is for local testing only.'
    });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      metadata: {
        bookingRef: bookingRef || 'guest-booking'
      }
    });

    return res.json({
      success: true,
      mode: 'stripe',
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: Number(amount),
      currency,
      bookingRef: bookingRef || 'guest-booking'
    });
  } catch (error) {
    console.error('Stripe payment intent error:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Payment intent creation failed.',
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🍾 L'ÉTOILE NYE GALA BACKEND RUNNING ON http://localhost:${PORT}`);
  console.log(`====================================================`);
  console.log(`- Health Check:    GET  http://localhost:${PORT}/api/health`);
  console.log(`- Tables List:     GET  http://localhost:${PORT}/api/tables`);
  console.log(`- Reserve Booking: POST http://localhost:${PORT}/api/bookings/reserve`);
  console.log(`- Lookup Booking:  GET  http://localhost:${PORT}/api/bookings/:ref`);
  console.log(`- Admin Overview:  GET  http://localhost:${PORT}/api/admin/bookings`);
  console.log(`- Stripe Intent:   POST http://localhost:${PORT}/api/payments/create-intent`);
  console.log(`====================================================`);
});
