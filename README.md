# MemoSpace

Sistem pengelolaan catatan pribadi berbasis web — tanpa login, tanpa password, tanpa registrasi.
Setiap pengguna mendapat ruang catatan anonim sendiri (UUID + token sesi acak di cookie HttpOnly).

**Stack:** Python · Flask · Flask-SQLAlchemy · Flask-WTF (CSRF) · MySQL · Bootstrap 5 · Jinja2 · Lucide Icons

## Instalasi (lokal)

Prasyarat: Python 3.10+ dan MySQL 8 (atau MariaDB 10.5+) yang sedang berjalan.

```bash
cd MemoSpace
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env                 # Windows: copy .env.example .env
python -c "import secrets; print(secrets.token_hex(32))"   # tempel hasilnya ke SECRET_KEY di .env
# lalu isi DB_USER / DB_PASSWORD (dst.) di .env sesuai MySQL kamu

flask --app app init-db              # membuat database `memospace` + semua tabel
python app.py                        # buka http://127.0.0.1:5000
```

> `SECRET_KEY` **wajib** diisi dan harus tetap sama. Jika berubah, cookie sesi lama tidak valid lagi
> dan pengguna harus memakai kode pemulihan.

Produksi: set `APP_ENV=production` (mengaktifkan cookie `Secure` — gunakan HTTPS), lalu jalankan
`gunicorn wsgi:app` di belakang reverse proxy (Nginx/Caddy).

## Menjalankan tes

```bash
pip install -r requirements-dev.txt
pytest -q
```

Tes memakai SQLite in-memory (dengan FOREIGN KEY diaktifkan) dan mencakup onboarding, CRUD, pencarian,
filter tanggal/jam, IDOR antar-pengguna, CSRF, kode pemulihan, ekspor, dan penghapusan akun.

## Fitur

| Area | Isi |
|---|---|
| Onboarding | 3 frame bertahap (nama → tanggal lahir opsional → selamat datang), validasi, progres sementara tersimpan, anti-identitas-ganda |
| Catatan | Buat, detail, edit, hapus (modal konfirmasi), favorit, kategori |
| Pencarian | Judul + isi, tidak peka huruf besar/kecil, semua kata harus cocok, live search; `%` dan `_` dianggap karakter biasa |
| Filter | Tanggal tertentu, rentang tanggal, rentang jam (bisa lewat tengah malam), digabung dengan pencarian/kategori/favorit |
| Urutan | Terbaru, Terlama, Judul A-Z, Judul Z-A |
| Tambahan | Autosave (halaman edit) + draf lokal (catatan baru), ekspor TXT/MD/PDF (satu atau semua), Baru Dihapus (pulihkan / hapus permanen / otomatis bersih setelah 30 hari) |
| Tampilan | Terang, Gelap, atau Ikuti perangkat (dipilih dari menu profil, tersimpan di browser), responsif dari layar 320px hingga desktop, panel filter berupa bottom sheet di HP |
| Identitas | Kode pemulihan 16 karakter (dilihat sekali, bisa dibuat ulang di Profil), keluar dari perangkat, hapus semua data |

## Catatan desain & keamanan

- **Identitas:** `anonymous_id` (UUID) hanya penghubung data. Akses diverifikasi lewat token acak 256-bit di cookie
  sesi bertanda tangan (HttpOnly, SameSite=Lax, Secure di produksi); database hanya menyimpan hash SHA-256 token.
  UUID saja tidak cukup untuk masuk. `user_id` dari frontend tidak pernah dipakai.
- **IDOR:** semua query catatan/kategori selalu difilter `user_id` pengguna aktif; akses ke milik orang lain
  menghasilkan 404 (tidak membocorkan keberadaan data).
- **CSRF:** semua POST dilindungi Flask-WTF; perubahan data hanya lewat POST (GET ke endpoint ubah → 405).
- **Query:** SQLAlchemy ORM / parameterized; input pencarian di-escape; output Jinja2 auto-escape (anti-XSS).
- **Header:** CSP, X-Frame-Options, nosniff, Referrer-Policy, `Cache-Control: no-store` untuk halaman data pribadi.
- **Zona waktu:** `created_at/updated_at` disimpan sebagai waktu lokal `APP_TIMEZONE` (default `Asia/Jakarta`),
  sehingga filter tanggal & jam tidak bergeser. Ubah zona waktu di `.env` sebelum ada data; mengubahnya
  kemudian tidak mengonversi catatan lama.
- **Penyimpanan isi catatan:** kolom `content` memakai `MEDIUMTEXT` di MySQL (varian dari TEXT) agar catatan panjang
  (batas aplikasi 100.000 karakter) tidak terpotong.
- **Tabel tambahan** (tanpa mengubah struktur utama): `categories`, `identity_tokens`; kolom tambahan
  `notes.category_id`, `notes.deleted_at`, `anonymous_users.recovery_code_hash`, `anonymous_users.onboarding_nonce`.

## Struktur

```
app.py  config.py  extensions.py  utils.py  wsgi.py  requirements.txt  .env.example
models/     user.py  note.py  category.py
routes/     onboarding.py  notes.py  categories.py  profile.py  filters.py  helpers.py
services/   identity_service.py  note_service.py  export_service.py
templates/  base · index · _notes_results · onboarding · welcome · add_note · edit_note · detail_note · trash · profile · error
static/     css/style.css  js/script.js  js/theme.js
tests/      test_memospace.py
```

## Batasan yang perlu diketahui

- PDF memakai font bawaan (Helvetica): huruf Latin/aksen aman, emoji & aksara non-Latin diganti `?`.
  TXT dan Markdown mempertahankan semua karakter.
- Pembatas percobaan kode pemulihan bersifat in-memory per proses; untuk produksi multi-worker gunakan
  rate limiting di reverse proxy atau Redis.
- Tampilan memuat Bootstrap, Lucide, dan font Inter dari CDN — butuh koneksi internet.
