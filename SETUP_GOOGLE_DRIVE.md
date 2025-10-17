# 📌 Setup Google Drive untuk DigiOH Photobooth

## 🚀 Langkah-langkah Setup

### 1. Buat Service Account di Google Cloud Console

1. Buka [Google Cloud Console](https://console.cloud.google.com/)
2. Buat project baru atau pilih project yang sudah ada
3. Aktifkan **Google Drive API**:
   - Navigation menu → APIs & Services → Library
   - Cari "Google Drive API" → Enable
4. Buat Service Account:
   - Navigation menu → IAM & Admin → Service Accounts
   - Click "Create Service Account"
   - Isi nama dan deskripsi
   - Skip role assignment (opsional)
   - Click "Done"
5. Generate Key:
   - Click pada service account yang baru dibuat
   - Tab "Keys" → "Add Key" → "Create New Key"
   - Pilih format "JSON"
   - Download file JSON

### 2. Setup Google Drive Folder

1. Buka [Google Drive](https://drive.google.com)
2. Buat folder baru untuk photobooth (misal: "DigiOH Photobooth")
3. Share folder tersebut ke email service account:
   - Right click folder → Share
   - Masukkan email service account (dari file JSON: `client_email`)
   - Set permission ke "Editor"
   - Click "Send"
4. Copy Folder ID dari URL:
   - Buka folder di browser
   - URL: `https://drive.google.com/drive/folders/FOLDER_ID_HERE`
   - Copy bagian `FOLDER_ID_HERE`

### 3. Setup Environment Variables

Buat file `.env` di root project dengan isi:

```env
# Google Drive Configuration
GOOGLE_DRIVE_FOLDER_ID=paste-folder-id-here
GOOGLE_SERVICE_ACCOUNT_KEY={"type":"service_account","project_id":"...paste-entire-json-content-here..."}

# Server Configuration  
PORT=3001
```

**Tips:**
- `GOOGLE_DRIVE_FOLDER_ID`: ID folder yang sudah di-share ke service account
- `GOOGLE_SERVICE_ACCOUNT_KEY`: Isi lengkap file JSON service account (dalam satu baris)

### 4. Test Setup

Jalankan server:
```bash
npm run server
```

Cek log di console:
- ✅ "Google Drive configured: true" → Setup berhasil
- ❌ "Google Drive configured: false" → Ada masalah konfigurasi

## 🔥 Flow Hasil Akhir

1. User ambil foto di photobooth
2. Klik "📱 Dapatkan Foto Anda"  
3. Server upload foto ke Google Drive
4. Server generate QR code dari link Google Drive
5. User scan QR → langsung download foto spesifik mereka!

## 🛠 Troubleshooting

**Error: "Google Drive not configured"**
- Pastikan file `.env` ada dan benar
- Cek format JSON di `GOOGLE_SERVICE_ACCOUNT_KEY`
- Restart server setelah update `.env`

**Error: "Upload failed"**
- Pastikan folder sudah di-share ke service account
- Cek FOLDER_ID benar
- Pastikan Drive API sudah enabled

**QR Code tidak muncul**
- Cek network connection
- Lihat console browser untuk error details
