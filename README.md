## Team Members
- Frontend Developer: ABHINAV SAI NATH MP - 12601297
- Backend Developer: TASHMEET SINGH GURUDATTA - 12617002
- Presentation Lead: AYUSH SINGH - 12617798

## Reservation API deployment (testing only)

The GitHub Pages site is static; it cannot run the reservation API. The API in `backend/` uses PostgreSQL, and `render.yaml` can create a Render API service and a temporary free PostgreSQL database for testing.

**Do not use the free database for real customer bookings.** Temporary databases can expire and are not an appropriate permanent store. Upgrade to persistent PostgreSQL before advertising or accepting real reservations.

### Local development

Install PostgreSQL locally, create a database named `lpu_gala`, copy `backend/.env.example` to `backend/.env`, and set `DATABASE_URL` to your local connection string. Then run:

```powershell
cd backend
npm install
npm start
```

Serve the site through a local web server on port 5500 so it is allowed by the development CORS setting.

### Deploy the API

1. Push the project to GitHub, then sign in to Render and create a Blueprint from this repository using `render.yaml`.
2. Wait for the API and database to finish deploying. Check `https://YOUR-API.onrender.com/api/health`.
3. In `api-service.js`, replace the localhost fallback in `API_BASE_URL` with `https://YOUR-API.onrender.com/api`, then publish the updated site through GitHub Pages.
4. In Render's environment settings, verify `FRONTEND_ORIGIN` exactly matches the GitHub Pages origin. Render generates `ADMIN_API_TOKEN`; keep it private.

The database starts with the 16 tables available and no old local bookings. Reservation amounts and table details are taken from the server database, not trusted from the browser. The admin endpoint requires the token:

```powershell
curl.exe -H "Authorization: Bearer YOUR_ADMIN_API_TOKEN" https://YOUR-API.onrender.com/api/admin/bookings
```

The token is available only in the Render dashboard's environment settings. Do not put it in `api-service.js`, GitHub Pages, or this repository.

### Payments and customer data

Bookings are recorded with payment status `PENDING`. This project does not yet complete a real Stripe checkout, so a reservation is **not a paid order**. Configure and verify a real payment flow before claiming that customers have paid.

The old `backend/database.json` and `backend/.env` were local development files and are intentionally excluded from deployment. Removing them from the latest Git version does not remove copies in earlier commits. If this repository is public, make it private and follow GitHub's sensitive-data cleanup guidance for the committed booking data; deleting a file in a later commit alone does not erase its history.
