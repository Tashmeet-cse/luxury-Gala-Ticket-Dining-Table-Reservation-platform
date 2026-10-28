/**
 * ==============================================================================
 * L'ÉTOILE NEW YEAR'S EVE GALA - APPLICATION CONTROLLER (app.js)
 * ==============================================================================
 */

// Application State Store
const state = {
  tables: [],
  selectedTable: null,
  selectedTier: {
    id: 'grand',
    name: 'Grand Ballroom Seated Dining',
    pricePerGuest: 580
  },
  guestCount: 4,
  activeFilter: 'all',
  lastBooking: null
};

// DOM References
const elements = {
  canvas: document.getElementById('ambient-canvas'),
  timerDays: document.getElementById('timer-days'),
  timerHours: document.getElementById('timer-hours'),
  timerMins: document.getElementById('timer-mins'),
  timerSecs: document.getElementById('timer-secs'),
  tablesGrid: document.getElementById('tables-grid'),
  capacityFilter: document.getElementById('capacity-filter'),
  seatsLeftCounter: document.getElementById('seats-left-counter'),

  // Table Card UI
  cardTableTier: document.getElementById('card-table-tier'),
  cardTableName: document.getElementById('card-table-name'),
  cardTableStatus: document.getElementById('card-table-status'),
  cardTableCapacity: document.getElementById('card-table-capacity'),
  cardTableZone: document.getElementById('card-table-zone'),
  cardTableChampagne: document.getElementById('card-table-champagne'),
  cardTablePrice: document.getElementById('card-table-price'),
  btnReserveSelected: document.getElementById('btn-reserve-selected-table'),

  // Checkout Modal
  checkoutModal: document.getElementById('checkout-modal'),
  modalCloseBtn: document.getElementById('modal-close-btn'),
  reservationForm: document.getElementById('reservation-form'),
  summaryTierName: document.getElementById('summary-tier-name'),
  summaryTableNumber: document.getElementById('summary-table-number'),
  summaryGuestCount: document.getElementById('summary-guest-count'),
  summaryTotalPrice: document.getElementById('summary-total-price'),
  submitBookingBtn: document.getElementById('submit-booking-btn'),

  // Confirmation / Ticket Modal
  confirmationModal: document.getElementById('confirmation-modal'),
  ticketModalCloseBtn: document.getElementById('ticket-modal-close-btn'),
  btnCloseConfirmation: document.getElementById('btn-close-confirmation'),
  ticketGuestName: document.getElementById('ticket-guest-name'),
  ticketBookingRef: document.getElementById('ticket-booking-ref'),
  ticketTableName: document.getElementById('ticket-table-name'),
  ticketPartySize: document.getElementById('ticket-party-size'),
  ticketTotalPaid: document.getElementById('ticket-total-paid')
};

// ==============================================================================
// 1. INITIALIZATION
// ==============================================================================
document.addEventListener('DOMContentLoaded', async () => {
  initAmbientParticles();
  initCountdownTimer();
  initEventListeners();
  await loadTables();
});

// ==============================================================================
// 2. LIVE COUNTDOWN TIMER
// ==============================================================================
function initCountdownTimer() {
  // Target: New Year's Eve 2026 Midnight (Dec 31, 2026 23:59:59)
  const targetNYE = new Date('December 31, 2026 23:59:59').getTime();

  function update() {
    const now = new Date().getTime();
    let distance = targetNYE - now;

    // Fallback if target has passed: set to next Dec 31
    if (distance < 0) {
      const currentYear = new Date().getFullYear();
      const nextTarget = new Date(`December 31, ${currentYear} 23:59:59`).getTime();
      distance = nextTarget - now;
    }

    const days = Math.floor(distance / (1000 * 60 * 60 * 24));
    const hours = Math.floor((distance % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const mins = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
    const secs = Math.floor((distance % (1000 * 60)) / 1000);

    elements.timerDays.textContent = String(days).padStart(2, '0');
    elements.timerHours.textContent = String(hours).padStart(2, '0');
    elements.timerMins.textContent = String(mins).padStart(2, '0');
    elements.timerSecs.textContent = String(secs).padStart(2, '0');
  }

  update();
  setInterval(update, 1000);
}

// ==============================================================================
// 3. TABLE FLOOR PLAN LOGIC & RENDERING
// ==============================================================================
async function loadTables() {
  try {
    const response = await window.galaApi.getTables();
    if (response && response.tables) {
      state.tables = response.tables;
      renderFloorPlan();
      updateAvailableCount();

      // Auto-select first available table
      const firstAvailable = state.tables.find(t => t.status === 'available');
      if (firstAvailable) {
        selectTable(firstAvailable);
      }
    }
  } catch (err) {
    console.error('Error fetching tables:', err);
  }
}

function updateAvailableCount() {
  const availableCount = state.tables.filter(t => t.status === 'available').length;
  if (elements.seatsLeftCounter) {
    elements.seatsLeftCounter.textContent = `Only ${availableCount} Dining Tables Remaining`;
  }
}

function renderFloorPlan() {
  if (!elements.tablesGrid) return;
  elements.tablesGrid.innerHTML = '';

  const filter = state.activeFilter;
  const filteredTables = state.tables.filter(table => {
    if (filter === 'all') return true;
    return table.capacity === parseInt(filter, 10);
  });

  filteredTables.forEach(table => {
    const tableEl = document.createElement('div');
    const isVip = table.tier.toLowerCase().includes('imperial') || table.capacity >= 8;
    
    tableEl.className = `dining-table ${table.status}`;
    if (isVip) tableEl.classList.add('vip-booth');
    if (state.selectedTable && state.selectedTable.id === table.id) {
      tableEl.classList.add('selected');
    }

    tableEl.dataset.tableId = table.id;
    tableEl.innerHTML = `
      <span class="table-num">T${table.number}</span>
      <span class="table-cap">${table.capacity}P</span>
    `;

    tableEl.addEventListener('click', () => {
      if (table.status === 'reserved') {
        alert(`Table #${table.number} is already fully reserved.`);
        return;
      }
      selectTable(table);
    });

    elements.tablesGrid.appendChild(tableEl);
  });
}

function selectTable(table) {
  state.selectedTable = table;
  state.guestCount = table.capacity;

  // Sync with tier
  if (table.tier.toLowerCase().includes('imperial')) {
    state.selectedTier = {
      id: 'imperial',
      name: 'The Imperial Salon VIP',
      pricePerGuest: 1250
    };
  } else {
    state.selectedTier = {
      id: 'grand',
      name: 'Grand Ballroom Dining',
      pricePerGuest: 580
    };
  }

  // Update UI Card
  elements.cardTableTier.textContent = table.tier.toUpperCase();
  elements.cardTableName.textContent = `Table #${table.number}`;
  elements.cardTableStatus.textContent = table.status === 'available' ? 'Available' : 'Reserved';
  elements.cardTableStatus.className = `table-status-pill ${table.status}`;
  elements.cardTableCapacity.textContent = `${table.capacity} Guests`;
  elements.cardTableZone.textContent = table.zone;
  elements.cardTableChampagne.textContent = table.champagne;
  elements.cardTablePrice.textContent = `$${table.price.toLocaleString()}`;

  // Update visual selection in grid
  document.querySelectorAll('.dining-table').forEach(el => {
    el.classList.toggle('selected', el.dataset.tableId === table.id);
  });
}

// ==============================================================================
// 4. CHECKOUT MODAL & BOOKING SUBMISSION
// ==============================================================================
function openCheckoutModal() {
  if (!state.selectedTable) {
    alert('Please select a dining table from the floor plan first.');
    return;
  }

  const table = state.selectedTable;
  elements.summaryTierName.textContent = state.selectedTier.name;
  elements.summaryTableNumber.textContent = `Table #${table.number} (${table.zone})`;
  elements.summaryGuestCount.textContent = `${table.capacity} Guests`;
  elements.summaryTotalPrice.textContent = `$${table.price.toLocaleString()}.00`;

  elements.checkoutModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeCheckoutModal() {
  elements.checkoutModal.classList.remove('active');
  document.body.style.overflow = '';
}

async function handleBookingSubmit(e) {
  e.preventDefault();

  const firstName = document.getElementById('primary-first-name').value.trim();
  const lastName = document.getElementById('primary-last-name').value.trim();
  const email = document.getElementById('primary-email').value.trim();
  const phone = document.getElementById('primary-phone').value.trim();
  const dietary = document.getElementById('dietary-notes').value.trim();
  const specialRequests = document.getElementById('special-requests').value.trim();

  if (!firstName || !lastName || !email || !phone) {
    alert('Please fill out all required guest details.');
    return;
  }

  const table = state.selectedTable;
  const bookingPayload = {
    tableId: table.id,
    tableNumber: table.number,
    tier: state.selectedTier.id,
    tierName: state.selectedTier.name,
    guestCount: table.capacity,
    primaryGuest: {
      firstName,
      lastName,
      email,
      phone
    },
    dietaryNotes: dietary || 'None specified',
    specialRequests: specialRequests || 'None',
    totalAmount: table.price
  };

  // Change button state
  elements.submitBookingBtn.disabled = true;
  elements.submitBookingBtn.innerHTML = `<span>Processing VIP Reservation...</span>`;

  try {
    const result = await window.galaApi.createBooking(bookingPayload);
    
    if (result && result.success) {
      state.lastBooking = result.booking;

      // Close checkout drawer
      closeCheckoutModal();

      // Show luxury confirmation pass
      showConfirmationTicket(result.booking);

      // Refresh table status in UI
      await loadTables();
    } else {
      alert(result.message || 'Unable to complete reservation. Please try again.');
    }
  } catch (err) {
    alert('Error connecting to reservation system: ' + err.message);
  } finally {
    elements.submitBookingBtn.disabled = false;
    elements.submitBookingBtn.innerHTML = `<span>Complete Reservation & Generate Ticket</span>`;
  }
}

function showConfirmationTicket(booking) {
  elements.ticketGuestName.textContent = `${booking.primaryGuest.firstName} ${booking.primaryGuest.lastName}`;
  elements.ticketBookingRef.textContent = booking.bookingRef;
  elements.ticketTableName.textContent = `Table #${booking.tableNumber}`;
  elements.ticketPartySize.textContent = `${booking.guestCount} Guests`;
  elements.ticketTotalPaid.textContent = `$${booking.totalAmount.toLocaleString()}.00`;

  elements.confirmationModal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeConfirmationModal() {
  elements.confirmationModal.classList.remove('active');
  document.body.style.overflow = '';
}

// ==============================================================================
// 5. EVENT LISTENERS
// ==============================================================================
function initEventListeners() {
  // Table reserve CTA
  elements.btnReserveSelected.addEventListener('click', openCheckoutModal);

  // Close modals
  elements.modalCloseBtn.addEventListener('click', closeCheckoutModal);
  elements.checkoutModal.addEventListener('click', (e) => {
    if (e.target === elements.checkoutModal) closeCheckoutModal();
  });

  elements.ticketModalCloseBtn.addEventListener('click', closeConfirmationModal);
  elements.btnCloseConfirmation.addEventListener('click', closeConfirmationModal);
  elements.confirmationModal.addEventListener('click', (e) => {
    if (e.target === elements.confirmationModal) closeConfirmationModal();
  });

  // Capacity filter
  elements.capacityFilter.addEventListener('change', (e) => {
    state.activeFilter = e.target.value;
    renderFloorPlan();
  });

  // Package Tier buttons
  document.querySelectorAll('.select-tier-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tierId = e.currentTarget.dataset.tier;
      if (tierId === 'starlight') {
        // Lounge ticket without assigned table
        state.selectedTier = {
          id: 'starlight',
          name: 'Starlight Soirée (Cocktail Lounge)',
          pricePerGuest: 275
        };
        state.selectedTable = {
          id: 'LOUNGE',
          number: 'Lounge',
          capacity: 1,
          zone: 'Skyline Terrace Bar',
          price: 275
        };
        openCheckoutModal();
      } else {
        // Scroll smoothly to floorplan
        document.getElementById('floorplan').scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Form submit
  elements.reservationForm.addEventListener('submit', handleBookingSubmit);
}

// ==============================================================================
// 6. AMBIENT GOLD DUST PARTICLES (Canvas)
// ==============================================================================
function initAmbientParticles() {
  const canvas = elements.canvas;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let width = (canvas.width = window.innerWidth);
  let height = (canvas.height = window.innerHeight);

  window.addEventListener('resize', () => {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  });

  const particleCount = 45;
  const particles = [];

  for (let i = 0; i < particleCount; i++) {
    particles.push({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: Math.random() * 1.5 + 0.5,
      alpha: Math.random() * 0.7 + 0.2,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: -Math.random() * 0.4 - 0.1
    });
  }

  function render() {
    ctx.clearRect(0, 0, width, height);

    particles.forEach(p => {
      p.x += p.speedX;
      p.y += p.speedY;

      if (p.y < 0) p.y = height;
      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(235, 200, 110, ${p.alpha})`;
      ctx.shadowBlur = 4;
      ctx.shadowColor = 'rgba(212, 175, 55, 0.4)';
      ctx.fill();
    });

    requestAnimationFrame(render);
  }

  render();
}
