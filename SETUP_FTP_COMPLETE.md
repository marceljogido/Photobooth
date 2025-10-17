# 🚀 Setup FTP Lengkap untuk DigiOH Photobooth

Sistem FTP yang telah diimplementasikan mengikuti alur yang sama dengan analisis yang Anda berikan. Berikut adalah panduan lengkap setup dan penggunaan.

## 📋 Fitur yang Diimplementasikan

### ✅ Sistem FTP Lengkap
- **Konfigurasi dinamis** - Bisa diubah tanpa restart server
- **Watermark otomatis** - Foto otomatis diberi watermark DigiOH
- **Error handling** - Fallback ke local storage jika FTP gagal
- **Logging detail** - Tracking setiap tahap proses
- **Interface konfigurasi** - Web UI untuk setup FTP

### ✅ Alur Upload yang Sama
1. **Kamera mengambil foto** → Data base64
2. **Simpan file lokal** → `uploads/DigiOH_PhotoBox_${timestamp}.jpg`
3. **Upload ke FTP** → `/_sfpg_data/image/DigiOH_PhotoBox_${timestamp}.jpg`
4. **Tambahkan watermark** → Watermark DigiOH otomatis
5. **Generate QR Code** → Link ke file di FTP
6. **Cleanup** → Hapus file lokal

## 🔧 Setup Awal

### 1. Install Dependencies
```bash
npm install
```

### 2. Konfigurasi FTP
File konfigurasi sudah dibuat: `digiOH_PhotoBox_config_ftp.json`

```json
{
  "ftpAddress": "webhosting67.1blu.de",
  "ftpUsername": "ftp173957-digiOh", 
  "ftpPassword": "Passworddigioh2025#",
  "ftpPort": 21,
  "ftpPath": "/_sfpg_data/image/",
  "displayUrl": "https://wsaseno.de/digiOH_files/"
}
```

### 3. Jalankan Server
```bash
npm run dev
```

## 🌐 Interface Konfigurasi

Akses interface konfigurasi FTP di:
**http://localhost:3001/ftpconfig.html**

### Fitur Interface:
- ✅ **Load Configuration** - Muat konfigurasi saat ini
- ✅ **Test Connection** - Test koneksi FTP tanpa menyimpan
- ✅ **Save Configuration** - Simpan konfigurasi baru
- ✅ **Real-time Status** - Status operasi real-time

## 📁 Struktur File

```
Photobooth/
├── ftpUtils.js                    # Utilitas FTP lengkap
├── digiOH_PhotoBox_config_ftp.json # Konfigurasi FTP
├── watermarkdigioh.png            # File watermark
├── public/
│   └── ftpconfig.html             # Interface konfigurasi
├── uploads/                       # Folder file lokal
└── server.js                      # Server dengan endpoint FTP
```

## 🔄 Alur Upload Detail

### 1. **Upload dari Kamera** (`/api/upload`)
```javascript
// Menerima file dari kamera
const filename = `DigiOH_PhotoBox_${timestamp}.${extension}`
const remoteFile = `_sfpg_data/image/${filename}`

// Simpan lokal dulu
fs.writeFileSync(localPath, req.file.buffer)

// Upload ke FTP dengan watermark
const result = await copyFile(localPath, remoteFile)
```

### 2. **Proses Watermark** (`copyFile()`)
```javascript
// Download file (jika dari URL)
await downloadFile(fileUrl, localFilePath)

// Tambahkan watermark
await addWatermark(localFilePath, watermarkPath, watermarkedFilePath)

// Upload ke FTP
const result = await uploadFile(watermarkedFilePath, remoteFile)

// Cleanup file lokal
fs.unlinkSync(localFilePath)
fs.unlinkSync(watermarkedFilePath)
```

### 3. **Upload ke FTP** (`uploadToFTP()`)
```javascript
// Koneksi ke FTP
await client.access(config)

// Pastikan direktori remote ada
await client.ensureDir(remoteDir)

// Upload file
await client.uploadFrom(localPath, remotePath)

// Return URL final
return `${displayUrl}${remotePath}`
```

## 🎨 Sistem Watermark

### Konfigurasi Watermark:
- **File**: `watermarkdigioh.png`
- **Posisi**: Bottom right corner
- **Ukuran**: 20% dari lebar gambar
- **Margin**: 20px dari tepi
- **Format**: PNG dengan transparansi

### Proses Watermark:
```javascript
// Hitung ukuran watermark (20% dari lebar gambar)
const watermarkWidth = Math.floor(inputMetadata.width * 0.2)
const watermarkHeight = Math.floor((watermarkWidth * watermarkMetadata.height) / watermarkMetadata.width)

// Hitung posisi (bottom right dengan margin 20px)
const x = inputMetadata.width - watermarkWidth - 20
const y = inputMetadata.height - watermarkHeight - 20

// Composite watermark ke gambar
await sharp(inputPath)
  .composite([{
    input: resizedWatermark,
    top: y,
    left: x,
  }])
  .jpeg({ quality: 90 })
  .toFile(outputPath)
```

## 🔍 Monitoring & Debugging

### Health Check
```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "ok",
  "ftp_configured": true,
  "ftp_config": {
    "host": "webhosting67.1blu.de",
    "port": 21,
    "path": "/_sfpg_data/image/",
    "displayUrl": "https://wsaseno.de/digiOH_files/"
  },
  "timestamp": "2024-01-20T10:30:00.000Z"
}
```

### Logging Detail
Setiap operasi FTP di-log dengan detail:
```
🔄 === FTP UPLOAD START ===
📁 Local file: uploads/DigiOH_PhotoBox_1705742400000.jpg
🌐 Remote file: _sfpg_data/image/DigiOH_PhotoBox_1705742400000.jpg
🔗 Final URL will be: https://wsaseno.de/digiOH_files/_sfpg_data/image/DigiOH_PhotoBox_1705742400000.jpg
✅ Connected to FTP server
📁 Ensuring remote directory: _sfpg_data/image
✅ File uploaded successfully!
🔗 Final URL: https://wsaseno.de/digiOH_files/_sfpg_data/image/DigiOH_PhotoBox_1705742400000.jpg
```

## 🚨 Error Handling

### Fallback System
1. **FTP gagal** → Fallback ke local storage
2. **Watermark gagal** → Gunakan gambar asli
3. **Download gagal** → Skip watermark, upload langsung

### Error Messages
- `FTP configuration missing` - Konfigurasi FTP tidak lengkap
- `FTP upload failed` - Upload ke FTP gagal
- `Watermark error` - Proses watermark gagal
- `Download error` - Download file gagal

## 🔧 Konfigurasi Lanjutan

### Mengubah Konfigurasi FTP
1. **Via Interface**: http://localhost:3001/ftpconfig.html
2. **Via File**: Edit `digiOH_PhotoBox_config_ftp.json`
3. **Via API**: POST ke `/api/ftp/config`

### Mengubah Watermark
1. Ganti file `watermarkdigioh.png`
2. Pastikan format PNG dengan transparansi
3. Ukuran optimal: 200x200px

### Mengubah Path Remote
Edit `ftpPath` di konfigurasi:
```json
{
  "ftpPath": "/custom/path/images/"
}
```

## 📊 Performance

### Optimasi yang Diterapkan:
- ✅ **Cleanup otomatis** - File lokal dihapus setelah upload
- ✅ **Error handling** - Tidak ada file yang tertinggal
- ✅ **Logging efisien** - Log hanya yang penting
- ✅ **Fallback cepat** - Local storage jika FTP gagal

### Monitoring:
- ✅ **Health check** - Status server dan FTP
- ✅ **Config interface** - Setup mudah via web
- ✅ **Test connection** - Test FTP tanpa menyimpan config

## 🎯 Hasil Akhir

Setelah setup, sistem akan:
1. **Otomatis upload** foto ke FTP server
2. **Menambahkan watermark** DigiOH
3. **Generate QR code** untuk sharing
4. **Cleanup file** lokal otomatis
5. **Fallback** ke local jika FTP gagal

Sistem ini siap digunakan untuk photobooth dengan kontrol penuh atas file dan watermark otomatis! 🚀
