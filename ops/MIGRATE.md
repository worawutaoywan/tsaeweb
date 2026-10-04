# ย้ายโปรเจกต์ไปเครื่องอื่น (GitHub → เครื่องใหม่)

Repo: `https://github.com/worawutaoywan/tsaeweb` (ปัจจุบันเป็น **public**)

## สิ่งที่อยู่บน GitHub แล้ว

| ชุดข้อมูล | ที่อยู่ | หมายเหตุ |
|-----------|---------|----------|
| โค้ดเว็บ Astro | `src/`, `public/` | รวมรูป/PDF สาธารณะ |
| ฐานเนื้อหา CMS | `data/cms/` | hero, news, events, homepage, campaigns… |
| รูปข่าวอัปโหลด | `public/uploads/news/` | ใช้กับบทความ CMS |
| Backend ลงทะเบียน/CMS admin | `server/registration/` | FastAPI + Docker |
| Deploy / Caddy / ops | `deploy.sh`, `deploy/`, `ops/` | |

## สิ่งที่ **ไม่** ขึ้น GitHub (ข้อมูลส่วนบุคคล / ความลับ)

เพราะ repo เป็น public จึง **ห้าม commit**:

- `.env` (รหัส admin, SMTP, secret)
- `server/registration/data/members.json` (สมาชิก: ชื่อ อีเมล โทร)
- `server/registration/data/registrations.db` (ใบลงทะเบียนประชุม)
- `server/registration/data/uploads/` (~1.2GB หลักฐานโอนเงิน)

คัดลอกจากเซิร์ฟเวอร์ production ด้วย `scp` (ดูด้านล่าง)

---

## 1) Clone และรันเว็บท้องถิ่น

```bash
git clone git@github.com:worawutaoywan/tsaeweb.git
cd tsaeweb
cp .env.example .env          # แก้ค่าตามต้องการ (Umami ฯลฯ)
npm install
npm run dev                   # http://localhost:4321
```

เนื้อหาหน้าเว็บอ่านจาก `data/cms/` โดยตรง — ไม่ต้องมี WordPress

## 2) คัดลอกฐานข้อมูลส่วนตัวจากเซิร์ฟเวอร์

Host: `root@104.248.152.59`

```bash
mkdir -p server/registration/data

# สมาชิก (JSON ที่ CMS สมาชิกใช้)
scp root@104.248.152.59:/opt/registration/data/members.json \
  server/registration/data/members.json

# ฐานลงทะเบียนประชุม (SQLite)
scp root@104.248.152.59:/opt/registration/data/registrations.db \
  server/registration/data/registrations.db

# (ถ้าต้องการ) ไฟล์หลักฐานโอน — ใหญ่ ~1.2GB
# scp -r root@104.248.152.59:/opt/registration/data/uploads \
#   server/registration/data/uploads
```

สร้าง `.env` ของ API จากตัวอย่างบนเซิร์ฟเวอร์หรือ `server/registration/README.md`:

```bash
# บนเซิร์ฟเวอร์: /opt/registration/.env
# คัดลอกเฉพาะเครื่องคุณ — อย่า commit
scp root@104.248.152.59:/opt/registration/.env server/registration/.env
```

รัน API ท้องถิ่น:

```bash
cd server/registration
docker compose up -d --build
# หรือ: uvicorn app:app --reload --port 8090
```

## 3) Deploy จากเครื่องใหม่

```bash
# ตั้ง SSH key ไปยัง 104.248.152.59 ก่อน
./deploy.sh web    # build Astro + อัปโหลดเว็บ
./deploy.sh api    # อัปโหลด registration + CMS admin
./deploy.sh all    # ทั้งคู่
```

รายละเอียดเซิร์ฟเวอร์: `ops/SERVER.md`

## 4) Checklist หลังย้าย

- [ ] `npm run build` ผ่าน
- [ ] หน้าแรก / ข่าว / Hero อ่านจาก `data/cms/` ได้
- [ ] มี `server/registration/data/members.json` (ถ้าต้องแก้สมาชิก)
- [ ] มี `registrations.db` (ถ้าต้องดูใบลงทะเบียน)
- [ ] มี `.env` ของเว็บและของ API (ไม่ commit)
- [ ] `./deploy.sh` ใช้ SSH ไป production ได้

## หมายเหตุ

- ถ้าต้องการเก็บ `members.json` / `registrations.db` บน GitHub ด้วย ต้องเปลี่ยน repo เป็น **private** ก่อน แล้วค่อยยกเลิก ignore — อย่าทำตอนยัง public
- Runtime publish ของเซิร์ฟเวอร์ (`data/cms/.publish.*`) ไม่ต้อง commit
