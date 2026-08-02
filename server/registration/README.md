# TSAE Registration backend

Small FastAPI + SQLite service that receives non-presenting participant
registrations for the 2026 national & international conferences.

- Front-end: Astro `RegisterForm.astro` posts `multipart/form-data` to `/api/register`.
- nginx reverse-proxies `https://www.tsae.asia/api/` → this container (`127.0.0.1:8090`).
- Data is stored in `./data/registrations.db` (SQLite) and uploaded proof
  files in `./data/uploads/<conf>/`.

## Endpoints
- `POST /register` — public form submission.
- `GET  /admin` — HTTP Basic auth; HTML list + filters + CSV export link.
- `GET  /admin/export.csv` — CSV export (auth).
- `GET  /admin/file/{id}` — download a proof file (auth).
- `GET  /health` — health check.

## Deploy (on server)
```bash
cd /opt/registration
cp .env.example .env   # then edit ADMIN_USER / ADMIN_PASS
docker compose up -d --build
```

Admin UI: https://www.tsae.asia/api/admin
