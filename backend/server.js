/**
 * Gala reservation backend.
 * Built with Node.js + Express and PostgreSQL.
 */

const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const crypto = require('crypto');

const { Resend } = require('resend');
const Stripe = require('stripe');
const { Pool } = require('pg');

dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 5000;
const stripeKey = process.env.STRIPE_SECRET_KEY;
const stripe = stripeKey ? new Stripe(stripeKey) : null;
const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const allowedOrigins = (process.env.FRONTEND_ORIGIN || 'http://localhost:5500,http://127.0.0.1:5500')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required to start the reservation API.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined
});

app.use(cors({
  origin: (origin, callback) => callback(null, !origin || allowedOrigins.includes(origin))
}));
app.use(express.json());

const tableHolds = new Map();
const HOLD_DURATION_MINUTES = 10;
const asyncHandler = (handler) => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const defaultTables = [
  { id: 'T01', number: 1, capacity: 2, tier: 'Grand Seated', zone: 'Balcony Promenade', price: 1160, champagne: '1x Dom Pérignon Brut' },
  { id: 'T02', number: 2, capacity: 2, tier: 'Grand Seated', zone: 'Balcony Promenade', price: 1160, champagne: '1x Dom Pérignon Brut' },
  { id: 'T03', number: 3, capacity: 4, tier: 'Grand Seated', zone: 'Center Ballroom', price: 2320, champagne: '2x Dom Pérignon Brut' },
  { id: 'T04', number: 4, capacity: 4, tier: 'Grand Seated', zone: 'Center Ballroom', price: 2320, champagne: '2x Dom Pérignon Brut' },
  { id: 'T05', number: 5, capacity: 6, tier: 'Grand Seated', zone: 'Center Ballroom', price: 3480, champagne: '3x Dom Pérignon Brut' },
  { id: 'T06', number: 6, capacity: 6, tier: 'Grand Seated', zone: 'Center Ballroom', price: 3480, champagne: '3x Dom Pérignon Brut' },
  { id: 'T07', number: 7, capacity: 4, tier: 'Grand Seated', zone: 'Center Ballroom', price: 2320, champagne: '2x Dom Pérignon Brut' },
  { id: 'T08', number: 8, capacity: 4, tier: 'Grand Seated', zone: 'Center Ballroom', price: 2320, champagne: '2x Dom Pérignon Brut' },
  { id: 'T09', number: 9, capacity: 8, tier: 'Imperial VIP', zone: 'Front Stage Salon', price: 9900, champagne: 'Vintage 2013 Unlimited' },
  { id: 'T10', number: 10, capacity: 8, tier: 'Imperial VIP', zone: 'Front Stage Salon', price: 9900, champagne: 'Vintage 2013 Unlimited' },
  { id: 'T11', number: 11, capacity: 8, tier: 'Imperial VIP', zone: 'Front Stage Salon', price: 9900, champagne: 'Vintage 2013 Unlimited' },
  { id: 'T12', number: 12, capacity: 4, tier: 'Grand Seated', zone: 'Center Ballroom Ring', price: 2400, champagne: '2x Dom Pérignon Brut' },
  { id: 'T13', number: 13, capacity: 2, tier: 'Grand Seated', zone: 'Mezzanine Terrace', price: 1160, champagne: '1x Dom Pérignon Brut' },
  { id: 'T14', number: 14, capacity: 2, tier: 'Grand Seated', zone: 'Mezzanine Terrace', price: 1160, champagne: '1x Dom Pérignon Brut' },
  { id: 'T15', number: 15, capacity: 6, tier: 'Grand Seated', zone: 'Center Ballroom', price: 3480, champagne: '3x Dom Pérignon Brut' },
  { id: 'T16', number: 16, capacity: 8, tier: 'Imperial VIP', zone: 'Private Royal Box', price: 10500, champagne: 'Vintage 2013 Unlimited' }
];

async function initializeDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS gala_tables (
      id TEXT PRIMARY KEY,
      number INTEGER NOT NULL,
      capacity INTEGER NOT NULL,
      tier TEXT NOT NULL,
      zone TEXT NOT NULL,
      price NUMERIC NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      champagne TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS gala_bookings (
      id TEXT PRIMARY KEY,
      booking_ref TEXT NOT NULL UNIQUE,
      created_at TIMESTAMPTZ NOT NULL,
      table_id TEXT NOT NULL,
      total_amount NUMERIC NOT NULL,
      booking_data JSONB NOT NULL
    );
  `);

  for (const table of defaultTables) {
    await pool.query(
      `INSERT INTO gala_tables (id, number, capacity, tier, zone, price, champagne)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [table.id, table.number, table.capacity, table.tier, table.zone, table.price, table.champagne]
    );
  }
}

function requireAdmin(req, res, next) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) {
    return res.status(503).json({ success: false, message: 'Admin access is not configured.' });
  }

  const authorization = req.get('authorization') || '';
  const supplied = Buffer.from(authorization.replace(/^Bearer\s+/i, ''));
  const expected = Buffer.from(expectedToken);
  if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  next();
}

async function sendBookingConfirmationEmail(booking) {
  const guestEmail = booking?.primaryGuest?.email;

  if (!guestEmail) {
    return { success: false, message: 'No guest email available for confirmation.' };
  }

  if (!resend) {
    console.log(`📧 Mock confirmation email for booking ${booking.bookingRef}`);
    return {
      success: true,
      mode: 'mock',
      to: guestEmail,
      bookingRef: booking.bookingRef
    };
  }

  try {
    const response = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'concierge@yourdomain.com',
      to: [guestEmail],
      subject: `Your gala reservation is confirmed - ${booking.bookingRef}`,
      html: `
        <h2>Reservation confirmed</h2>
        <p>Hello ${booking.primaryGuest.firstName},</p>
        <p>Your table reservation for ${booking.tableNumber} is confirmed.</p>
        <p><strong>Booking reference:</strong> ${booking.bookingRef}</p>
        <p><strong>Total amount:</strong> ₹${Number(booking.totalAmount).toLocaleString('en-IN')}</p>
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

app.get('/api/health', asyncHandler(async (req, res) => {
  await pool.query('SELECT 1');
  res.json({ status: 'ok', service: 'NYE Gala Backend API', timestamp: new Date() });
}));

app.get('/api/tables', asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT id, number, capacity, tier, zone, price, status, champagne FROM gala_tables ORDER BY number'
  );
  const now = Date.now();

  const tables = result.rows.map((row) => {
    const table = { ...row, price: Number(row.price) };
    const hold = tableHolds.get(table.id);
    if (table.status === 'available' && hold && hold.expiresAt > now) {
      return { ...table, status: 'held', heldUntil: hold.expiresAt };
    }
    return table;
  });

  res.json({ success: true, count: tables.length, tables });
}));

app.post('/api/tables/hold', asyncHandler(async (req, res) => {
  const { tableId, guestEmail } = req.body || {};
  if (typeof tableId !== 'string' || typeof guestEmail !== 'string' || !tableId || !guestEmail) {
    return res.status(400).json({ success: false, message: 'Missing tableId or guestEmail' });
  }

  const tableResult = await pool.query('SELECT status FROM gala_tables WHERE id = $1', [tableId]);
  if (tableResult.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'Table not found' });
  }

  if (tableResult.rows[0].status === 'reserved') {
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
}));

app.post('/api/bookings/reserve', asyncHandler(async (req, res) => {
  const {
    tableId,
    primaryGuest,
    dietaryNotes,
    specialRequests
  } = req.body || {};

  const requiredGuestFields = ['firstName', 'lastName', 'email', 'phone'];
  if (!primaryGuest || requiredGuestFields.some((field) => (
    typeof primaryGuest[field] !== 'string' || !primaryGuest[field].trim()
  ))) {
    return res.status(400).json({
      success: false,
      message: 'Validation Error: Primary guest first name, last name, email, and phone are mandatory.'
    });
  }

  const client = await pool.connect();
  let newBooking;
  try {
    await client.query('BEGIN');
    let reservationDetails;
    if (tableId === 'LOUNGE') {
      reservationDetails = {
        tableId: 'LOUNGE',
        tableNumber: 'Lounge',
        tier: 'starlight',
        tierName: 'Starlight Soirée (Cocktail Lounge)',
        guestCount: 1,
        totalAmount: 275
      };
    } else if (tableId) {
      const tableResult = await client.query(
        'SELECT id, number, capacity, tier, price, status FROM gala_tables WHERE id = $1 FOR UPDATE',
        [tableId]
      );
      if (tableResult.rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ success: false, message: 'Selected table does not exist.' });
      }

      const hold = tableHolds.get(tableId);
      if (tableResult.rows[0].status === 'reserved') {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'This table has already been reserved. Please select another table.'
        });
      }
      if (hold && hold.expiresAt > Date.now() && hold.guestEmail !== primaryGuest.email) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          success: false,
          message: 'This table is currently held by another guest.'
        });
      }

      await client.query('UPDATE gala_tables SET status = $1 WHERE id = $2', ['reserved', tableId]);
      tableHolds.delete(tableId);
      const table = tableResult.rows[0];
      reservationDetails = {
        tableId: table.id,
        tableNumber: table.number,
        tier: table.tier === 'Imperial VIP' ? 'imperial' : 'grand',
        tierName: table.tier,
        guestCount: table.capacity,
        totalAmount: Number(table.price)
      };
    } else {
      await client.query('ROLLBACK');
      return res.status(400).json({ success: false, message: 'A valid table or lounge selection is required.' });
    }

    const bookingRef = `NYE-${crypto.randomBytes(8).toString('hex').toUpperCase()}-VIP`;
    newBooking = {
      id: 'book_' + Date.now(),
      bookingRef,
      createdAt: new Date().toISOString(),
      status: 'CONFIRMED',
      ...reservationDetails,
      primaryGuest,
      dietaryNotes: dietaryNotes || 'None',
      specialRequests: specialRequests || 'None',
      paymentStatus: 'PENDING'
    };

    await client.query(
      `INSERT INTO gala_bookings (id, booking_ref, created_at, table_id, total_amount, booking_data)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        newBooking.id,
        newBooking.bookingRef,
        newBooking.createdAt,
        newBooking.tableId,
        newBooking.totalAmount,
        newBooking
      ]
    );
    await client.query('COMMIT');
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      console.error('Booking transaction rollback failed:', rollbackError.message);
    }
    console.error('Booking could not be saved:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to save reservation. Please try again.' });
  } finally {
    client.release();
  }

  const emailResult = await sendBookingConfirmationEmail(newBooking);

  console.log(`✅ [New Booking] Ref: ${newBooking.bookingRef} | Table: #${newBooking.tableNumber} | Total: ₹${Number(newBooking.totalAmount).toLocaleString('en-IN')}`);

  res.status(201).json({
    success: true,
    message: 'Gala reservation confirmed successfully.',
    booking: newBooking,
    email: emailResult
  });
}));

app.post('/api/email/test', requireAdmin, asyncHandler(async (req, res) => {
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
}));

app.get('/api/bookings/:bookingRef', asyncHandler(async (req, res) => {
  const { bookingRef } = req.params;
  const result = await pool.query(
    'SELECT booking_data FROM gala_bookings WHERE UPPER(booking_ref) = UPPER($1)',
    [bookingRef]
  );

  if (result.rowCount === 0) {
    return res.status(404).json({ success: false, message: 'Reservation not found' });
  }

  res.json({ success: true, booking: result.rows[0].booking_data });
}));

app.get('/api/admin/bookings', requireAdmin, asyncHandler(async (req, res) => {
  const result = await pool.query(
    'SELECT booking_data FROM gala_bookings ORDER BY created_at DESC'
  );
  const totals = await pool.query(
    'SELECT COUNT(*)::INTEGER AS total_bookings, COALESCE(SUM(total_amount), 0) AS booking_value FROM gala_bookings'
  );
  res.json({
    success: true,
    totalBookings: totals.rows[0].total_bookings,
    bookingValue: Number(totals.rows[0].booking_value),
    bookings: result.rows.map((row) => row.booking_data)
  });
}));

app.post('/api/payments/create-intent', async (req, res) => {
  const { amount, bookingRef, currency = 'inr' } = req.body || {};

  if (process.env.NODE_ENV === 'production') {
    return res.status(503).json({
      success: false,
      message: 'Online checkout is not enabled for this reservation service.'
    });
  }

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({
      success: false,
      message: 'A valid amount is required to create a payment intent.'
    });
  }

  if (!stripe) {
    if (process.env.NODE_ENV === 'production') {
      return res.status(503).json({
        success: false,
        message: 'Payment processing is not configured.'
      });
    }

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

app.use((error, req, res, next) => {
  console.error('API request failed:', error.message);
  res.status(500).json({ success: false, message: 'Reservation service encountered an error.' });
});

initializeDatabase().then(() => app.listen(PORT, () => {
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
})).catch((error) => {
  console.error('Failed to initialize the reservation database:', error.message);
  process.exitCode = 1;
});
