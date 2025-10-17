# 🔄 Diagram Alur FTP DigiOH Photobooth

## Alur Lengkap Upload FTP

```mermaid
graph TD
    A[📸 Kamera mengambil foto] --> B[📤 Data base64 ke server]
    B --> C[💾 Simpan file lokal di uploads/]
    C --> D[🔐 Koneksi ke FTP server]
    D --> E{✅ Koneksi berhasil?}
    E -->|Ya| F[📁 Pastikan direktori remote ada]
    E -->|Tidak| G[❌ Fallback ke local storage]
    F --> H[🎨 Tambahkan watermark DigiOH]
    H --> I[📤 Upload file ber-watermark ke FTP]
    I --> J[🔗 Generate URL final]
    J --> K[📱 Generate QR Code]
    K --> L[🗑️ Cleanup file lokal]
    L --> M[✅ Return URL + QR ke client]
    G --> N[📱 Generate QR Code local]
    N --> O[✅ Return URL local ke client]
```

## Struktur File FTP

```mermaid
graph LR
    A[FTP Server] --> B[/_sfpg_data/image/]
    B --> C[DigiOH_PhotoBox_1705742400000.jpg]
    B --> D[DigiOH_PhotoBox_1705742400001.jpg]
    B --> E[DigiOH_PhotoBox_1705742400002.jpg]
    
    F[Display URL] --> G[https://wsaseno.de/digiOH_files/]
    G --> H[_sfpg_data/image/]
    H --> I[DigiOH_PhotoBox_1705742400000.jpg]
```

## Konfigurasi FTP

```mermaid
graph TD
    A[🔧 Konfigurasi FTP] --> B[digiOH_PhotoBox_config_ftp.json]
    B --> C[ftpAddress: webhosting67.1blu.de]
    B --> D[ftpUsername: ftp173957-digiOh]
    B --> E[ftpPassword: Passworddigioh2025#]
    B --> F[ftpPort: 21]
    B --> G[ftpPath: /_sfpg_data/image/]
    B --> H[displayUrl: https://wsaseno.de/digiOH_files/]
    
    I[🌐 Interface Web] --> J[ftpconfig.html]
    J --> K[Load Configuration]
    J --> L[Test Connection]
    J --> M[Save Configuration]
```

## Error Handling Flow

```mermaid
graph TD
    A[🚀 Upload Request] --> B[📁 Save Local File]
    B --> C[🔐 Connect FTP]
    C --> D{✅ FTP OK?}
    D -->|Ya| E[🎨 Add Watermark]
    D -->|Tidak| F[❌ FTP Error]
    E --> G[📤 Upload to FTP]
    G --> H{✅ Upload OK?}
    H -->|Ya| I[✅ Success - Return FTP URL]
    H -->|Tidak| F
    F --> J[🔄 Fallback to Local]
    J --> K[📱 Generate Local QR]
    K --> L[⚠️ Return Local URL]
    
    M[🎨 Watermark Error] --> N[📤 Upload Original]
    N --> O[✅ Success - Return URL]
```

## API Endpoints

```mermaid
graph LR
    A[🌐 API Endpoints] --> B[POST /api/upload]
    A --> C[GET /api/ftp/config]
    A --> D[POST /api/ftp/config]
    A --> E[POST /api/ftp/test]
    A --> F[GET /health]
    A --> G[GET /ftpconfig.html]
    
    B --> H[Upload file dengan watermark]
    C --> I[Get FTP configuration]
    D --> J[Update FTP configuration]
    E --> K[Test FTP connection]
    F --> L[Server health check]
    G --> M[FTP config interface]
```

## File Structure

```
Photobooth/
├── 📁 ftpUtils.js                    # Utilitas FTP lengkap
├── 📁 digiOH_PhotoBox_config_ftp.json # Konfigurasi FTP
├── 🖼️ watermarkdigioh.png            # File watermark
├── 📁 public/
│   └── 🌐 ftpconfig.html             # Interface konfigurasi
├── 📁 uploads/                       # Folder file lokal
│   ├── 📷 DigiOH_PhotoBox_1705742400000.jpg
│   ├── 🎨 watermarked_DigiOH_PhotoBox_1705742400000.jpg
│   └── 📷 DigiOH_PhotoBox_1705742400001.jpg
├── 📁 server.js                      # Server dengan endpoint FTP
└── 📁 SETUP_FTP_COMPLETE.md          # Dokumentasi lengkap
```

## Watermark Process

```mermaid
graph TD
    A[📷 Input Image] --> B[📐 Get Image Dimensions]
    B --> C[🎨 Load Watermark]
    C --> D[📏 Calculate Watermark Size]
    D --> E[📍 Calculate Position]
    E --> F[🔄 Resize Watermark]
    F --> G[🎭 Composite Watermark]
    G --> H[💾 Save Watermarked Image]
    H --> I[✅ Watermarked Image Ready]
    
    J[❌ Watermark Error] --> K[📋 Copy Original Image]
    K --> L[⚠️ Use Original Image]
```

## Monitoring & Logging

```mermaid
graph TD
    A[📊 Monitoring] --> B[🔍 Health Check]
    A --> C[📝 Detailed Logging]
    A --> D[🌐 Web Interface]
    
    B --> E[Server Status]
    B --> F[FTP Configuration]
    B --> G[Connection Status]
    
    C --> H[Upload Progress]
    C --> I[Error Messages]
    C --> J[File Operations]
    
    D --> K[Load Config]
    D --> L[Test Connection]
    D --> M[Save Config]
```

## Performance Optimization

```mermaid
graph TD
    A[⚡ Performance] --> B[🗑️ Auto Cleanup]
    A --> C[🔄 Error Handling]
    A --> D[📝 Efficient Logging]
    A --> E[🚀 Fast Fallback]
    
    B --> F[Delete Local Files]
    B --> G[Clean Temp Files]
    
    C --> H[FTP Fallback]
    C --> I[Watermark Fallback]
    
    D --> J[Essential Logs Only]
    D --> K[Structured Messages]
    
    E --> L[Local Storage Backup]
    E --> M[Quick Response]
```

Sistem FTP ini dirancang untuk memberikan kontrol penuh atas file photobooth dengan watermark otomatis dan fallback yang robust! 🚀
