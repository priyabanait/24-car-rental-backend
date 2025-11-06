# udriver-backend (development)

This is a minimal Express backend scaffold that serves the frontend's mock data and provides simple auth.

Quick start (Windows CMD):

```cmd
cd "e:\\admin Udrive\\backend"
npm install
npm run dev
```

Endpoints (examples):
- GET /api/drivers
- GET /api/drivers/:id
- POST /api/auth/login  { email, password }
- GET /api/vehicles
- GET /api/investors
- GET /api/driver-plans
- GET /api/investment-plans
- GET /api/transactions
- GET /api/tickets
- GET /api/employees
- GET /api/dashboard

Auth: POST /api/auth/login returns { user, token }. Use `Authorization: Bearer <token>` to call protected endpoints (POST/PUT/DELETE)

Notes:
- The backend does NOT pre-populate domain mock data on startup. The database will remain empty until records are created by users via the API (for example, when forms are submitted in the frontend).
- The server will still create the necessary collections automatically when documents are inserted.
- For production, secure the JWT secret and use hashed passwords; do not keep plaintext passwords in the DB.
