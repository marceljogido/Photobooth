# Setup FTP untuk Photobooth

Aplikasi Photobooth sekarang menggunakan FTP untuk menyimpan foto dan GIF. Berikut cara setup-nya:

## 1. Install Dependencies

```bash
npm install
```

## 2. Konfigurasi FTP

Buat file `.env` di root project dengan konfigurasi berikut:

```env
# FTP Configuration
FTP_HOST=your-ftp-server.com
FTP_USER=your-username
FTP_PASSWORD=your-password
FTP_PORT=21
FTP_PATH=/public_html/photobooth
FTP_BASE_URL=https://your-domain.com/photobooth

# Server Configuration
PORT=3001
```

### Penjelasan Konfigurasi:

- **FTP_HOST**: Alamat server FTP Anda
- **FTP_USER**: Username untuk login FTP
- **FTP_PASSWORD**: Password untuk login FTP
- **FTP_PORT**: Port FTP (biasanya 21)
- **FTP_PATH**: Folder di server FTP dimana file akan disimpan
- **FTP_BASE_URL**: URL publik dimana file bisa diakses (biasanya domain website Anda)

## 3. Setup Folder di Server FTP

Pastikan folder yang ditentukan di `FTP_PATH` sudah ada di server FTP Anda. Contoh:
- `/public_html/photobooth/` - untuk shared hosting
- `/var/www/html/photobooth/` - untuk VPS
- `/home/user/photobooth/` - untuk dedicated server

## 4. Test Koneksi

Jalankan server dan test koneksi:

```bash
npm run dev
```

Buka browser ke `http://localhost:3001/health` untuk memeriksa status FTP.

## 5. Cara Kerja

1. User mengambil foto
2. Foto diproses oleh AI
3. File diupload ke FTP server
4. QR Code dibuat dengan link ke file di FTP
5. User scan QR Code untuk download foto

## Troubleshooting

### Error "FTP configuration missing"
- Pastikan file `.env` sudah dibuat
- Pastikan semua variabel FTP sudah diisi

### Error "FTP upload failed"
- Periksa kredensial FTP
- Pastikan server FTP bisa diakses
- Periksa folder path di server FTP

### QR Code tidak bisa diakses
- Pastikan `FTP_BASE_URL` benar
- Pastikan server FTP bisa diakses via HTTP/HTTPS
- Periksa permission folder di server

## Keuntungan FTP

- ✅ Kontrol penuh atas file
- ✅ Tidak ada limit storage
- ✅ Tidak perlu OAuth
- ✅ File tersimpan di server sendiri
- ✅ Lebih aman dan private
