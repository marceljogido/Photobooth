# 🔄 Diagram Alur Detail DigiOH Photobooth

## 📸 **ALUR UTAMA: FOTO → AI → FTP → QR**

```mermaid
graph TD
    A[👤 User klik tombol foto] --> B[⏰ Countdown 3 detik]
    B --> C[📷 Webcam.snap - ambil foto base64]
    C --> D[🖼️ Tampilkan preview foto asli]
    D --> E[🤖 snapPhoto - kirim ke AI processing]
    E --> F[💾 Simpan ke imageData.inputs]
    F --> G[🎨 Proses dengan Gemini AI]
    G --> H[💾 Simpan hasil ke imageData.outputs]
    H --> I[📤 Upload ke FTP dengan watermark]
    I --> J[📱 Generate QR Code]
    J --> K[🔄 Return ke frontend]
    K --> L[🖼️ Tampilkan hasil + QR]
    L --> M[🎬 Auto create GIF]
    M --> N[🗑️ Cleanup file lokal]
    
    style A fill:#e1f5fe
    style B fill:#fff3e0
    style C fill:#f3e5f5
    style G fill:#e8f5e8
    style I fill:#e8f5e8
    style J fill:#fff9c4
    style L fill:#fce4ec
```

## 🎯 **DETAILED PROCESSING FLOW**

```mermaid
graph TD
    A[📸 takePhoto] --> B[Canvas processing]
    B --> C[Base64 conversion]
    C --> D[snapPhoto function]
    D --> E[Generate UUID]
    E --> F[Store in imageData.inputs]
    F --> G[Update state: isBusy=true]
    G --> H[Call Gemini AI]
    H --> I[AI processing]
    I --> J[Store result in imageData.outputs]
    J --> K[Update state: isBusy=false]
    K --> L[Return photo ID]
    L --> M[Show results page]
    M --> N[Generate QR Code]
    N --> O[Display QR modal]
    
    style A fill:#e3f2fd
    style D fill:#f3e5f5
    style H fill:#e8f5e8
    style I fill:#e8f5e8
    style N fill:#fff9c4
    style O fill:#fce4ec
```

## 🤖 **AI PROCESSING DETAIL**

```mermaid
graph TD
    A[snapPhoto called] --> B[Get activeMode & customPrompt]
    B --> C[Generate unique ID]
    C --> D[Store base64 in imageData.inputs[id]]
    D --> E[Add photo to state with isBusy=true]
    E --> F[Call gen function]
    F --> G[Gemini API call]
    G --> H[Process with selected mode]
    H --> I[Return AI generated image]
    I --> J[Store result in imageData.outputs[id]]
    J --> K[Update state: isBusy=false]
    K --> L[Return photo ID]
    
    style A fill:#e3f2fd
    style F fill:#e8f5e8
    style G fill:#e8f5e8
    style H fill:#e8f5e8
    style I fill:#e8f5e8
    style L fill:#fce4ec
```

## 📤 **FTP UPLOAD PROCESS**

```mermaid
graph TD
    A[User klik share] --> B[generateQRCode called]
    B --> C[uploadToFTP function]
    C --> D[Convert base64 to blob]
    D --> E[Create FormData]
    E --> F[POST to /api/upload]
    F --> G[Server: save file locally]
    G --> H[Server: copyFile with watermark]
    H --> I[Download file from URL]
    I --> J[Add watermark with Sharp]
    J --> K[Upload to FTP server]
    K --> L[Generate public URL]
    L --> M[Generate QR code]
    M --> N[Return URL + QR]
    N --> O[Display QR modal]
    O --> P[Cleanup local files]
    
    style A fill:#e3f2fd
    style C fill:#f3e5f5
    style H fill:#e8f5e8
    style J fill:#e8f5e8
    style K fill:#e8f5e8
    style M fill:#fff9c4
    style O fill:#fce4ec
```

## 🎨 **WATERMARK PROCESS**

```mermaid
graph TD
    A[copyFile called] --> B[Set file paths]
    B --> C[Download original file]
    C --> D[Load watermark image]
    D --> E[Calculate watermark size]
    E --> F[Calculate position]
    F --> G[Resize watermark]
    G --> H[Composite with Sharp]
    H --> I[Save watermarked image]
    I --> J[Upload to FTP]
    J --> K[Return public URL]
    K --> L[Cleanup files]
    
    style A fill:#e3f2fd
    style D fill:#e8f5e8
    style E fill:#e8f5e8
    style F fill:#e8f5e8
    style G fill:#e8f5e8
    style H fill:#e8f5e8
    style I fill:#e8f5e8
    style J fill:#e8f5e8
```

## 🎬 **GIF CREATION PROCESS**

```mermaid
graph TD
    A[makeGif called] --> B[Get ready photos]
    B --> C[Create GIFEncoder]
    C --> D[Loop through photos]
    D --> E[Process original image]
    E --> F[Add to GIF frame]
    F --> G[Process AI result]
    G --> H[Add to GIF frame]
    H --> I[Finish GIF]
    I --> J[Create blob URL]
    J --> K[Update state with GIF URL]
    K --> L[Display GIF]
    
    style A fill:#e3f2fd
    style C fill:#e8f5e8
    style D fill:#e8f5e8
    style E fill:#e8f5e8
    style F fill:#e8f5e8
    style G fill:#e8f5e8
    style H fill:#e8f5e8
    style I fill:#e8f5e8
    style J fill:#e8f5e8
    style K fill:#fce4ec
```

## 📱 **QR CODE GENERATION**

```mermaid
graph TD
    A[generateQRCode called] --> B[uploadToFTP]
    B --> C[Get upload result]
    C --> D[Check if QR exists]
    D --> E{QR from server?}
    E -->|Yes| F[Use server QR]
    E -->|No| G[Generate QR manually]
    G --> H[QRCode.toDataURL]
    H --> I[Set QR URL]
    I --> J[Show QR modal]
    F --> I
    
    style A fill:#e3f2fd
    style B fill:#f3e5f5
    style E fill:#fff3e0
    style F fill:#e8f5e8
    style G fill:#e8f5e8
    style H fill:#e8f5e8
    style I fill:#fce4ec
    style J fill:#fce4ec
```

## 🔄 **STATE MANAGEMENT**

```mermaid
graph TD
    A[App Component] --> B[useStore hook]
    B --> C[photos array]
    B --> D[activeMode]
    B --> E[customPrompt]
    B --> F[gifInProgress]
    B --> G[gifUrl]
    
    C --> H[Photo objects]
    H --> I[id]
    H --> J[mode]
    H --> K[isBusy]
    H --> L[error]
    
    M[imageData] --> N[inputs object]
    M --> O[outputs object]
    N --> P[photoId: base64]
    O --> Q[photoId: AI result]
    
    style A fill:#e3f2fd
    style B fill:#f3e5f5
    style C fill:#e8f5e8
    style M fill:#e8f5e8
    style N fill:#e8f5e8
    style O fill:#e8f5e8
```

## 🛡️ **ERROR HANDLING FLOW**

```mermaid
graph TD
    A[Process starts] --> B{AI processing OK?}
    B -->|Yes| C[Continue to FTP]
    B -->|No| D[Show error message]
    D --> E[Set isBusy=false]
    E --> F[Return to camera]
    
    C --> G{FTP upload OK?}
    G -->|Yes| H[Show QR code]
    G -->|No| I[Fallback to local]
    I --> J[Generate local QR]
    J --> K[Show local QR]
    
    H --> L[Success]
    K --> L
    
    style A fill:#e3f2fd
    style B fill:#fff3e0
    style C fill:#e8f5e8
    style D fill:#ffebee
    style G fill:#fff3e0
    style H fill:#e8f5e8
    style I fill:#fff3e0
    style L fill:#e8f5e8
```

## 📊 **PERFORMANCE MONITORING**

```mermaid
graph TD
    A[User action] --> B[Start timer]
    B --> C[Process step 1]
    C --> D[Log progress]
    D --> E[Process step 2]
    E --> F[Log progress]
    F --> G[Process step 3]
    G --> H[Log progress]
    H --> I[Complete]
    I --> J[End timer]
    J --> K[Log total time]
    
    style A fill:#e3f2fd
    style B fill:#fff3e0
    style C fill:#e8f5e8
    style D fill:#f3e5f5
    style E fill:#e8f5e8
    style F fill:#f3e5f5
    style G fill:#e8f5e8
    style H fill:#f3e5f5
    style I fill:#e8f5e8
    style J fill:#fff3e0
    style K fill:#f3e5f5
```

## 🎯 **USER INTERACTION FLOW**

```mermaid
graph TD
    A[User opens app] --> B[Camera starts]
    B --> C[Select AI mode]
    C --> D[Click photo button]
    D --> E[Countdown starts]
    E --> F[Photo captured]
    F --> G[AI processing]
    G --> H[Show results]
    H --> I[Click share button]
    I --> J[FTP upload]
    J --> K[Show QR code]
    K --> L[User scans QR]
    L --> M[Download photo]
    M --> N[Click retake]
    N --> B
    
    style A fill:#e3f2fd
    style B fill:#e8f5e8
    style C fill:#f3e5f5
    style D fill:#fff3e0
    style E fill:#fff3e0
    style F fill:#e8f5e8
    style G fill:#e8f5e8
    style H fill:#fce4ec
    style I fill:#fff3e0
    style J fill:#e8f5e8
    style K fill:#fff9c4
    style L fill:#e8f5e8
    style M fill:#e8f5e8
    style N fill:#f3e5f5
```

## 🔧 **CONFIGURATION FLOW**

```mermaid
graph TD
    A[App starts] --> B[Load FTP config]
    B --> C[digiOH_PhotoBox_config_ftp.json]
    C --> D[Set default values]
    D --> E[Check config validity]
    E --> F{Config valid?}
    F -->|Yes| G[Use config]
    F -->|No| H[Use defaults]
    G --> I[Start server]
    H --> I
    I --> J[Ready for requests]
    
    style A fill:#e3f2fd
    style B fill:#f3e5f5
    style C fill:#e8f5e8
    style D fill:#e8f5e8
    style E fill:#fff3e0
    style F fill:#fff3e0
    style G fill:#e8f5e8
    style H fill:#fff3e0
    style I fill:#e8f5e8
    style J fill:#e8f5e8
```

## 📱 **MOBILE RESPONSIVENESS**

```mermaid
graph TD
    A[User opens on mobile] --> B[Detect screen size]
    B --> C[Adjust UI layout]
    C --> D[Show mobile mode selector]
    D --> E[User selects mode]
    E --> F[Take photo]
    F --> G[Process with AI]
    G --> H[Show results]
    H --> I[Show QR code]
    I --> J[User scans with camera]
    J --> K[Download photo]
    
    style A fill:#e3f2fd
    style B fill:#f3e5f5
    style C fill:#e8f5e8
    style D fill:#f3e5f5
    style E fill:#f3e5f5
    style F fill:#e8f5e8
    style G fill:#e8f5e8
    style H fill:#fce4ec
    style I fill:#fff9c4
    style J fill:#e8f5e8
    style K fill:#e8f5e8
```

## 🎉 **FINAL RESULT FLOW**

```mermaid
graph TD
    A[Photo taken] --> B[AI processed]
    B --> C[Watermarked]
    C --> D[Uploaded to FTP]
    D --> E[QR generated]
    E --> F[Displayed to user]
    F --> G[User scans QR]
    G --> H[Downloads photo]
    H --> I[Photo saved to device]
    I --> J[User satisfied]
    J --> K[Process complete]
    
    style A fill:#e3f2fd
    style B fill:#e8f5e8
    style C fill:#e8f5e8
    style D fill:#e8f5e8
    style E fill:#fff9c4
    style F fill:#fce4ec
    style G fill:#e8f5e8
    style H fill:#e8f5e8
    style I fill:#e8f5e8
    style J fill:#e8f5e8
    style K fill:#e8f5e8
```

Sistem DigiOH Photobooth ini dirancang untuk memberikan pengalaman yang seamless dari pengambilan foto hingga sharing hasil! 🚀
