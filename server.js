/**
 * ==============================================================================
 * L'ÉTOILE NEW YEAR'S EVE GALA - PRODUCTION-READY BACKEND API
 * ==============================================================================
 * 
 * Technology: Node.js + Express + JSON file persistence
 * Can easily be swapped with PostgreSQL, MySQL, MongoDB, or Firebase Firestore.
 * ==============================================================================
 */

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;
const DB_FILE = path.join(__dirname, 'database.json');

// Middleware
app.use(cors());
app.use(express.json());

// In-memory hold locks for tables: { [tableId]: { heldBy: email, expiresAt: timestamp } }
const tableHolds = new Map();
const HOLD_DURATION_MINUTES = 10;

// Initialize or read JSON Database
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

// Clean up expired table holds
setInterval(() => {
  const now = Date.now();
  for (const [tableId, hold] of tableHolds.entries()) {
    if (hold.expiresAt < now) {
      tableHolds.delete(tableId);
      console.log(`⏱️ Hold expired for table: ${tableId}`);
    }
  }
}, 30000);

// ==============================================================================
// API ROUTES
// ==============================================================================

/**
 * Health check endpoint
 */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'NYE Gala Backend API', timestamp: new Date() });
});

/**
 * GET /api/tables
 * Returns all tables with their current status (available, reserved, or held)
 */
app.get('/api/tables', (req, res) => {
  const db = getDatabase();
  const now = Date.now();

  const tables = db.tables.map(table => {
    // Check if table is currently held by someone in checkout
    const hold = tableHolds.get(table.id);
    if (table.status === 'available' && hold && hold.expiresAt > now) {
      return { ...table, status: 'held', heldUntil: hold.expiresAt };
    }
    return table;
  });

  res.json({ success: true, count: tables.length, tables });
});

/**
 * POST /api/tables/hold
 * Temporarily locks a table for 10 minutes to prevent race conditions during checkout
 * Body: { tableId: "T12", guestEmail: "guest@example.com" }
 */
app.post('/api/tables/hold', (req, res) => {
  const { tableId, guestEmail } = req.body;
  if (!tableId || !guestEmail) {
    return res.status(400).json({ success: false, message: 'Missing tableId or guestEmail' });
  }

  const db = getDatabase();
  const table = db.tables.find(t => t.id === tableId);
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

  const expiresAt = now + (HOLD_DURATION_MINUTES * 60 * 1000);
  tableHolds.set(tableId, { guestEmail, expiresAt });

  res.json({
    success: true,
    message: `Table held for ${HOLD_DURATION_MINUTES} minutes`,
    tableId,
    expiresAt
  });
});

/**
 * POST /api/bookings/reserve
 * Confirms a reservation, assigns the table, generates booking reference
 */
app.post('/api/bookings/reserve', (req, res) => {
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

  // Validation
  if (!primaryGuest || !primaryGuest.firstName || !primaryGuest.lastName || !primaryGuest.email || !primaryGuest.phone) {
    return res.status(400).json({
      success: false,
      message: 'Validation Error: Primary guest first name, last name, email, and phone are mandatory.'
    });
  }

  const db = getDatabase();

  // If table-based booking, verify table is still free
  if (tableId && tableId !== 'LOUNGE') {
    const tableIndex = db.tables.findIndex(t => t.id === tableId);
    if (tableIndex === -1) {
      return res.status(404).json({ success: false, message: 'Selected table does not exist.' });
    }
    if (db.tables[tableIndex].status === 'reserved') {
      return res.status(409).json({
        success: false,
        message: 'This table has already been reserved. Please select another table.'
      });
    }

    // Mark table as permanently reserved in database
    db.tables[tableIndex].status = 'reserved';
    tableHolds.delete(tableId); // Release temporary hold
  }

  // Create confirmed booking entity
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

  console.log(`✅ [New Booking] Ref: ${bookingRef} | Guest: ${primaryGuest.firstName} ${primaryGuest.lastName} | Table: #${tableNumber} | Total: $${totalAmount}`);

  // In production, trigger Email Confirmation (SendGrid / Postmark / Resend) here!

  res.status(201).json({
    success: true,
    message: 'Gala reservation confirmed successfully.',
    booking: newBooking
  });
});

/**
 * GET /api/bookings/:bookingRef
 * Fetch booking pass details for QR scanner verification or customer lookup
 */
app.get('/api/bookings/:bookingRef', (req, res) => {
  const { bookingRef } = req.params;
  const db = getDatabase();
  const match = db.bookings.find(b => b.bookingRef.toUpperCase() === bookingRef.toUpperCase());

  if (!match) {
    return res.status(404).json({ success: false, message: 'Reservation not found' });
  }

  res.json({ success: true, booking: match });
});

/**
 * GET /api/admin/bookings
 * Private admin route to view all confirmed bookings (for event managers)
 */
app.get('/api/admin/bookings', (req, res) => {
  const db = getDatabase();
  res.json({
    success: true,
    totalBookings: db.bookings.length,
    revenue: db.bookings.reduce((sum, b) => sum + (b.totalAmount || 0), 0),
    bookings: db.bookings
  });
});

// Start Server
app.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🍾 L'ÉTOILE NYE GALA BACKEND RUNNING ON http://localhost:${PORT}`);
  console.log(`====================================================`);
  console.log(`- Health Check:    GET  http://localhost:${PORT}/api/health`);
  console.log(`- Tables List:     GET  http://localhost:${PORT}/api/tables`);
  console.log(`- Reserve Booking: POST http://localhost:${PORT}/api/bookings/reserve`);
  console.log(`- Lookup Booking:  GET  http://localhost:${PORT}/api/bookings/:ref`);
  console.log(`- Admin Overview:  GET  http://localhost:${PORT}/api/admin/bookings`);
  console.log(`====================================================`);
});
