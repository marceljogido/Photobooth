# 📥 Penjelasan Action Download GIF & Foto

## 🎯 **OVERVIEW**

Sistem DigiOH Photobooth memiliki 2 jenis tombol download:
1. **📱 Download Foto** - Untuk download foto hasil AI
2. **🎬 Download GIF** - Untuk download GIF animasi before/after

## 📸 **ACTION DOWNLOAD FOTO**

### **Tombol: "Download Foto"**
```javascript
// Di App.jsx - Tombol Download Foto
<button 
  className="btn btnAccent"
  onClick={sharePhoto}  // ← Action utama
  disabled={photos.find(p => p.id === currentPhotoId)?.isBusy || isUploading}
>
  <span className="icon">
    {isUploading ? 'hourglass_empty' : 'photo'}
  </span>
  Download Foto
</button>
```

### **Fungsi `sharePhoto()`**
```javascript
const sharePhoto = async () => {
  console.log('🔄 sharePhoto function called')
  
  // 1. Validasi data foto
  if (!currentPhotoId || !imageData.outputs[currentPhotoId]) {
    alert('❌ Foto tidak tersedia. Silakan ambil foto dulu.')
    return
  }

  // 2. Ambil URL foto hasil AI
  const imageUrl = imageData.outputs[currentPhotoId]
  
  // 3. Generate QR Code untuk foto
  await generateQRCode(imageUrl, `digioh-photobooth-foto-${Date.now()}.jpg`)
}
```

### **Alur Download Foto:**
```mermaid
graph TD
    A[User klik "Download Foto"] --> B[sharePhoto() dipanggil]
    B --> C[Validasi foto tersedia]
    C --> D[Ambil URL foto hasil AI]
    D --> E[generateQRCode() dipanggil]
    E --> F[uploadToFTP() - upload ke server]
    F --> G[Tambah watermark DigiOH]
    G --> H[Upload ke FTP server]
    H --> I[Generate QR Code dari URL FTP]
    I --> J[Tampilkan QR Code modal]
    J --> K[User scan QR dengan HP]
    K --> L[Download foto ke HP]
    
    style A fill:#e1f5fe
    style E fill:#f3e5f5
    style F fill:#e8f5e8
    style G fill:#e8f5e8
    style H fill:#e8f5e8
    style I fill:#fff9c4
    style J fill:#fce4ec
    style L fill:#e8f5e8
```

## 🎬 **ACTION DOWNLOAD GIF**

### **Tombol: "Download GIF"**
```javascript
// Di App.jsx - Tombol Download GIF
<button 
  className="btn btnGif"
  onClick={async () => {
    if (!gifUrl) {
      // Jika GIF belum ada, buat dulu
      console.log('🎬 Creating GIF first...')
      await makeGif()
      setTimeout(() => {
        shareGif()  // ← Action utama
      }, 1500)
    } else {
      // GIF sudah ada, langsung share
      shareGif()  // ← Action utama
    }
  }}
>
  <span className="icon">
    {(gifInProgress || isUploading) ? 'hourglass_empty' : 'gif'}
  </span>
  Download GIF
</button>
```

### **Fungsi `shareGif()`**
```javascript
const shareGif = async () => {
  console.log('🎬 shareGif function called')
  
  // 1. Validasi GIF tersedia
  if (!gifUrl) {
    alert('❌ GIF tidak tersedia. Silakan buat GIF dulu.')
    return
  }

  // 2. Generate QR Code untuk GIF
  const gifFilename = `digioh-photobooth-gif-${Date.now()}.gif`
  await generateQRCode(gifUrl, gifFilename)
}
```

### **Fungsi `makeGif()`**
```javascript
// Di actions.js - Membuat GIF animasi
export const makeGif = async () => {
  const {photos} = get()
  const gif = new GIFEncoder()
  const readyPhotos = photos.filter(photo => !photo.isBusy)

  // Loop melalui semua foto
  for (const photo of readyPhotos) {
    // Add foto asli (333ms)
    const inputImageData = await processImageToCanvas(
      imageData.inputs[photo.id], gifSize
    )
    addFrameToGif(gif, inputImageData, gifSize, 333)

    // Add hasil AI (833ms)
    const outputImageData = await processImageToCanvas(
      imageData.outputs[photo.id], gifSize
    )
    addFrameToGif(gif, outputImageData, gifSize, 833)
  }

  gif.finish()
  const gifUrl = URL.createObjectURL(new Blob([gif.buffer], {type: 'image/gif'}))
  
  set(state => {
    state.gifUrl = gifUrl
  })
}
```

### **Alur Download GIF:**
```mermaid
graph TD
    A[User klik "Download GIF"] --> B{Cek GIF sudah ada?}
    B -->|Tidak| C[makeGif() - buat GIF dulu]
    B -->|Ya| D[shareGif() langsung]
    C --> E[Loop semua foto]
    E --> F[Add foto asli ke GIF]
    F --> G[Add hasil AI ke GIF]
    G --> H[Finish GIF]
    H --> I[Set gifUrl di state]
    I --> J[shareGif() dipanggil]
    D --> K[generateQRCode() untuk GIF]
    J --> K
    K --> L[uploadToFTP() - upload GIF]
    L --> M[Tambah watermark]
    M --> N[Upload ke FTP server]
    N --> O[Generate QR Code]
    O --> P[Tampilkan QR Code modal]
    P --> Q[User scan QR dengan HP]
    Q --> R[Download GIF ke HP]
    
    style A fill:#e1f5fe
    style C fill:#f3e5f5
    style E fill:#e8f5e8
    style F fill:#e8f5e8
    style G fill:#e8f5e8
    style H fill:#e8f5e8
    style K fill:#f3e5f5
    style L fill:#e8f5e8
    style M fill:#e8f5e8
    style N fill:#e8f5e8
    style O fill:#fff9c4
    style P fill:#fce4ec
    style R fill:#e8f5e8
```

## 🔄 **FUNGSI `generateQRCode()`**

### **Proses Generate QR Code:**
```javascript
const generateQRCode = async (imageUrl, filename = null) => {
  setIsUploading(true)
  
  try {
    // 1. Upload ke FTP server
    const defaultFilename = filename || `digioh-photobooth-${Date.now()}.jpg`
    const uploadResult = await uploadToFTP(imageUrl, defaultFilename)
    
    // 2. Store cloud URL
    if (currentPhotoId) {
      setCloudUrls(prev => ({
        ...prev,
        [currentPhotoId]: uploadResult.url
      }))
    }
    
    // 3. Generate QR Code
    let qrCodeDataURL
    if (uploadResult.qrCode) {
      // Server sudah generate QR
      qrCodeDataURL = uploadResult.qrCode
    } else {
      // Generate QR manual
      qrCodeDataURL = await window.QRCode.toDataURL(uploadResult.url, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#FFFFFF' }
      })
    }
    
    // 4. Tampilkan QR Code
    setQrCodeUrl(qrCodeDataURL)
    setShowQRCode(true)
    
  } catch (error) {
    // Fallback: QR dengan URL lokal
    const qrCodeDataURL = await window.QRCode.toDataURL(imageUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    })
    setQrCodeUrl(qrCodeDataURL)
    setShowQRCode(true)
  } finally {
    setIsUploading(false)
  }
}
```

## 📱 **QR CODE MODAL**

### **Tampilan QR Code:**
```javascript
{showQRCode && qrCodeUrl && (
  <div className="qrModal">
    <div className="qrContent">
      <div className="qrHeader">
        <h2>📱 Scan QR Code untuk Download</h2>
        <button onClick={() => setShowQRCode(false)}>
          <span className="icon">close</span>
        </button>
      </div>
      
      <div className="qrBody">
        <img src={qrCodeUrl} alt="QR Code" className="qrCodeImage" />
        <div className="qrInstructions">
          <h4>📱 Cara Download:</h4>
          <ol>
            <li>Buka kamera HP Anda</li>
            <li>Arahkan ke QR Code ini</li>
            <li>Klik link yang muncul</li>
            <li>Download foto Anda! ✨</li>
          </ol>
        </div>
      </div>
      
      <div className="qrActions">
        <button onClick={() => setShowQRCode(false)}>Tutup</button>
        <button onClick={() => {
          const a = document.createElement('a')
          a.href = qrCodeUrl
          a.download = 'digioh-photobooth-qr.png'
          a.click()
        }}>Download QR Code</button>
      </div>
    </div>
  </div>
)}
```

## 🎯 **PERBEDAAN DOWNLOAD FOTO vs GIF**

| Aspek | Download Foto | Download GIF |
|-------|---------------|--------------|
| **Data Source** | `imageData.outputs[currentPhotoId]` | `gifUrl` dari state |
| **File Type** | JPG hasil AI | GIF animasi |
| **Content** | 1 foto hasil AI | Multiple foto (asli + AI) |
| **Creation** | Langsung dari AI result | Perlu `makeGif()` dulu |
| **Filename** | `digioh-photobooth-foto-{timestamp}.jpg` | `digioh-photobooth-gif-{timestamp}.gif` |
| **Watermark** | Ya, otomatis | Ya, otomatis |
| **QR Code** | Ya | Ya |
| **FTP Upload** | Ya | Ya |

## ⚡ **LOADING STATES**

### **Foto Download:**
```javascript
disabled={photos.find(p => p.id === currentPhotoId)?.isBusy || isUploading}
```
- **isBusy** - Foto sedang diproses AI
- **isUploading** - Sedang upload ke FTP

### **GIF Download:**
```javascript
disabled={photos.filter(p => !p.isBusy).length === 0 || isUploading}
```
- **photos.length === 0** - Tidak ada foto
- **isUploading** - Sedang upload ke FTP
- **gifInProgress** - Sedang membuat GIF

## 🛡️ **ERROR HANDLING**

### **Foto Download Error:**
```javascript
if (!currentPhotoId || !imageData.outputs[currentPhotoId]) {
  alert('❌ Foto tidak tersedia. Silakan ambil foto dulu.')
  return
}
```

### **GIF Download Error:**
```javascript
if (!gifUrl) {
  alert('❌ GIF tidak tersedia. Silakan buat GIF dulu.')
  return
}
```

### **Upload Error Fallback:**
```javascript
try {
  // Upload ke FTP
  const result = await uploadToFTP(imageUrl, filename)
} catch (error) {
  // Fallback: QR dengan URL lokal
  const qrCodeDataURL = await window.QRCode.toDataURL(imageUrl)
  setQrCodeUrl(qrCodeDataURL)
  setShowQRCode(true)
}
```

## 🎉 **HASIL AKHIR**

Setelah user klik tombol download:

1. **📤 Upload** - File diupload ke FTP dengan watermark
2. **📱 QR Code** - QR code ditampilkan di modal
3. **📲 Scan** - User scan QR dengan HP
4. **💾 Download** - File didownload ke HP
5. **✨ Selesai** - User dapat foto/GIF di HP

Sistem download ini memberikan pengalaman yang seamless dari photobooth ke HP user! 🚀
