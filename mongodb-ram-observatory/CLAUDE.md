# CLAUDE.md - MongoDB RAM Pool Observatory

## Build & Run Commands
```bash
npm install && cd client && npm install && cd ..   # Install all deps
npm run dev          # Dev mode (hot-reload frontend + backend)
npm start            # Production build + start
npm run build        # Build frontend only
npm run seed         # Seed test data (requires MONGODB_URI in .env)
npm run seed -- --large-count 2000000  # Seed with custom large collection size
npm run verify-seed  # Verify seed data
npm run cleanup      # Drop ram_pool_demo database
npm run verify-cleanup  # Verify cleanup
```

## Architecture
- **Frontend**: React (Vite) + Tailwind CSS + Recharts at `client/`
- **Backend**: Express + MongoDB Node.js Driver at `server/`
- **Load Generator**: Worker threads at `server/workers/loadWorker.js`
- **Metrics**: SSE streaming from `server/services/metricsPoller.js`
- **Sizing Engine**: `server/services/sizingEngine.js`

## Key Constraints
- All load targets `ram_pool_demo` database only — never customer data
- Connection strings never logged or persisted (memory only + .env which is gitignored)
- Load generator auto-stops after 5 minutes (safety timeout)
- Works with MongoDB 4.4, 5.0, 6.0, 7.0, 8.0 (including Atlas M10+)
