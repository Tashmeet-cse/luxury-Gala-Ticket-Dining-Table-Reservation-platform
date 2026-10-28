/**
 * ==============================================================================
 * L'ÉTOILE GALA - BACKEND API ADAPTER SERVICE (api-service.js)
 * ==============================================================================
 * 
 * HOW THIS WORKS:
 * 1. Set `USE_MOCK_BACKEND = true` only for local mock testing.
 * 
 * 2. Set `GALA_API_BASE_URL` to the deployed API URL before publishing the site.
 * ==============================================================================
 */

const API_CONFIG = {
  // Backend is now enabled. Set to true only for local mock testing.
  USE_MOCK_BACKEND: false,

  // Backend server endpoint
  API_BASE_URL: window.GALA_API_BASE_URL || 'https://lpu-gala-reservation-api.onrender.com/api',

  // Request timeout in milliseconds
  TIMEOUT_MS: 8000
};

// Default table data for mock fallback & initialization
const INITIAL_MOCK_TABLES = [
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
];

class GalaApiService {
  constructor() {
    this._initMockStorage();
  }

  /**
   * Initializes browser localStorage with default tables if not already present
   */
  _initMockStorage() {
    if (!localStorage.getItem('gala_tables')) {
      localStorage.setItem('gala_tables', JSON.stringify(INITIAL_MOCK_TABLES));
    }
    if (!localStorage.getItem('gala_bookings')) {
      localStorage.setItem('gala_bookings', JSON.stringify([]));
    }
  }

  /**
   * 1. GET /api/tables
   * Retrieves all dining tables with current availability & pricing
   * @returns {Promise<Array>} List of tables
   */
  async getTables() {
    if (API_CONFIG.USE_MOCK_BACKEND) {
      console.log('⚡ [API Service] Using Mock Backend -> getTables()');
      const data = JSON.parse(localStorage.getItem('gala_tables') || '[]');
      return Promise.resolve({ success: true, tables: data });
    }

    try {
      const response = await fetch(`${API_CONFIG.API_BASE_URL}/tables`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' }
      });
      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
      return await response.json();
    } catch (error) {
      console.error('❌ [API Service] Failed to fetch tables from backend:', error);
      throw error;
    }
  }

  /**
   * 2. POST /api/bookings/reserve
   * Creates a confirmed reservation or holds table
   * 
   * @param {Object} bookingData - Details of the booking
   * Expected Payload:
   * {
   *   tableId: "T12",
   *   tier: "grand",
   *   guestCount: 4,
   *   primaryGuest: {
   *     firstName: "Alexander",
   *     lastName: "Vanderbilt",
   *     email: "alex@example.com",
   *     phone: "+15550192834"
   *   },
   *   dietaryNotes: "1x Pescatarian",
   *   specialRequests: "Anniversary table flowers",
   *   totalAmount: 2320.00
   * }
   * 
   * @returns {Promise<Object>} Booking confirmation with ref code
   */
  async createBooking(bookingData) {
    if (API_CONFIG.USE_MOCK_BACKEND) {
      console.log('⚡ [API Service] Using Mock Backend -> createBooking() with payload:', bookingData);
      
      // Simulate network latency (400ms)
      await new Promise(r => setTimeout(r, 400));

      const refCode = 'NYE-' + Math.floor(1000 + Math.random() * 9000) + '-VIP';
      const newBooking = {
        id: 'book_' + Date.now(),
        bookingRef: refCode,
        createdAt: new Date().toISOString(),
        status: 'CONFIRMED',
        ...bookingData
      };

      // Save to mock bookings
      const bookings = JSON.parse(localStorage.getItem('gala_bookings') || '[]');
      bookings.push(newBooking);
      localStorage.setItem('gala_bookings', JSON.stringify(bookings));

      // Mark table as reserved in mock store
      if (bookingData.tableId) {
        const tables = JSON.parse(localStorage.getItem('gala_tables') || '[]');
        const updatedTables = tables.map(t => {
          if (t.id === bookingData.tableId) {
            return { ...t, status: 'reserved' };
          }
          return t;
        });
        localStorage.setItem('gala_tables', JSON.stringify(updatedTables));
      }

      return Promise.resolve({
        success: true,
        message: 'Reservation successfully confirmed',
        booking: newBooking
      });
    }

    try {
      const response = await fetch(`${API_CONFIG.API_BASE_URL}/bookings/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(bookingData)
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      console.error('❌ [API Service] Booking request failed:', error);
      throw error;
    }
  }

  /**
   * 3. GET /api/bookings/:id
   * Fetches booking details by confirmation code
   */
  async getBooking(bookingRef) {
    if (API_CONFIG.USE_MOCK_BACKEND) {
      const bookings = JSON.parse(localStorage.getItem('gala_bookings') || '[]');
      const match = bookings.find(b => b.bookingRef === bookingRef);
      return Promise.resolve({ success: !!match, booking: match });
    }

    const response = await fetch(`${API_CONFIG.API_BASE_URL}/bookings/${bookingRef}`);
    return await response.json();
  }
}

// Export singleton to window
window.galaApi = new GalaApiService();
