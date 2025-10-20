import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import QRCode from 'qrcode'
import {
  uploadFile as uploadFtpFile,
  copyFile as copyFtpFile,
  testFtpConnection,
  getFtpConfig,
  updateFtpConfig,
  addWatermark
} from './storages/ftpUtils.js'
import {
  uploadNextcloudFile,
  getNextcloudConfig,
  updateNextcloudConfig,
  testNextcloudConnection
} from './storages/nextcloudUtils.js'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const WATERMARK_FILE =
  process.env.WATERMARK_FILE_PATH
    ? path.resolve(process.env.WATERMARK_FILE_PATH)
    : path.resolve(__dirname, '..', '..', 'public', 'logowatermark.png')

const UPLOAD_BASE_DIR =
  process.env.UPLOAD_BASE_DIR
    ? path.resolve(process.env.UPLOAD_BASE_DIR)
    : path.resolve(__dirname, '..', '..', 'public', 'upload')
const UPLOAD_IMG_DIR = path.join(UPLOAD_BASE_DIR, 'img')
const UPLOAD_GIF_DIR = path.join(UPLOAD_BASE_DIR, 'gif')

if (!fs.existsSync(WATERMARK_FILE)) {
  console.warn(`⚠️ Watermark file not found at ${WATERMARK_FILE}`)
}

const ensureDir = dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

ensureDir(UPLOAD_BASE_DIR)
ensureDir(UPLOAD_IMG_DIR)
ensureDir(UPLOAD_GIF_DIR)

const app = express()
const PORT = process.env.PORT || 3001
const STORAGE_PROVIDER = (process.env.STORAGE_PROVIDER || 'nextcloud').toLowerCase()
const isNextcloudProvider = STORAGE_PROVIDER === 'nextcloud'

app.use(express.json())
app.use(express.static(path.resolve(__dirname, '..', '..', 'dist')))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
})

console.log(`🔧 Active storage provider: ${STORAGE_PROVIDER}`)
if (isNextcloudProvider) {
  console.log('🔧 Nextcloud configuration loaded from nextcloudUtils.js')
} else {
  console.log('🔧 FTP configuration loaded from ftpUtils.js')
}

function safeUnlink(filePath, label) {
  if (!filePath) return
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath)
    }
  } catch (error) {
    console.warn(`⚠️ Unable to remove ${label || 'file'} (${filePath}):`, error.message)
  }
}

// FTP endpoints
app.get('/api/ftp/config', (req, res) => {
  try {
    const config = getFtpConfig()
    res.json({ success: true, data: config })
  } catch (error) {
    res.json({ success: false, message: error.message })
  }
})

app.post('/api/ftp/config', (req, res) => {
  try {
    updateFtpConfig(req.body)
    res.json({ success: true, message: 'FTP configuration updated successfully' })
  } catch (error) {
    res.json({ success: false, message: error.message })
  }
})

app.post('/api/ftp/test', async (req, res) => {
  try {
    const originalConfig = getFtpConfig()
    updateFtpConfig(req.body)

    const result = await testFtpConnection()

    updateFtpConfig(originalConfig)
    res.json(result)
  } catch (error) {
    res.json({ success: false, message: error.message })
  }
})

// Nextcloud endpoints
app.get('/api/nextcloud/config', (req, res) => {
  try {
    const config = getNextcloudConfig()
    res.json({ success: true, data: config })
  } catch (error) {
    res.json({ success: false, message: error.message })
  }
})

app.post('/api/nextcloud/config', (req, res) => {
  try {
    updateNextcloudConfig(req.body)
    res.json({ success: true, message: 'Nextcloud configuration updated successfully' })
  } catch (error) {
    res.json({ success: false, message: error.message })
  }
})

app.post('/api/nextcloud/test', async (req, res) => {
  try {
    const originalConfig = getNextcloudConfig()
    updateNextcloudConfig(req.body)

    const result = await testNextcloudConnection()

    updateNextcloudConfig(originalConfig)
    res.json(result)
  } catch (error) {
    res.json({ success: false, message: error.message })
  }
})

// Health check endpoint
app.get('/health', (req, res) => {
  const ftpConfig = getFtpConfig()
  const ncConfig = getNextcloudConfig()
  res.json({
    status: 'ok',
    storage_provider: STORAGE_PROVIDER,
    ftp_configured: !!(ftpConfig.ftpAddress && ftpConfig.ftpUsername && ftpConfig.ftpPassword),
    ftp_config: {
      host: ftpConfig.ftpAddress,
      port: ftpConfig.ftpPort,
      path: ftpConfig.ftpPath,
      displayUrl: ftpConfig.displayUrl
    },
    nextcloud_configured: !!(ncConfig.serverUrl && ncConfig.webdavRoot && ncConfig.username && ncConfig.password),
    nextcloud_config: {
      serverUrl: ncConfig.serverUrl,
      webdavRoot: ncConfig.webdavRoot,
      baseFolder: ncConfig.baseFolder,
      gifFolder: ncConfig.gifFolder,
      sharePermissions: ncConfig.sharePermissions
    },
    timestamp: new Date().toISOString()
  })
})

// Upload endpoint (supports FTP or Nextcloud storage with watermarking)
app.post('/api/upload', upload.single('file'), async (req, res) => {
  console.log('📤 Upload request received')

  if (!req.file) {
    console.log('❌ No file uploaded')
    return res.status(400).json({ error: 'No file uploaded' })
  }

  console.log('📁 File received:', {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size
  })

  const timestamp = Date.now()
  const extension = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase()
  const isGif = extension === 'gif'
  const filename = `DigiOH_PhotoBox_${timestamp}.${extension}`
  const targetDir = isGif ? UPLOAD_GIF_DIR : UPLOAD_IMG_DIR
  const localPath = path.join(targetDir, filename)
  let watermarkedPath = null

  try {
    ensureDir(targetDir)
    fs.writeFileSync(localPath, req.file.buffer)

    console.log('📝 Using filename:', filename)

    let finalUrl

    if (isNextcloudProvider) {
      console.log('☁️ Using Nextcloud storage provider')

      if (isGif) {
        console.log('🎞️ Uploading GIF to Nextcloud (no watermark)...')
        const uploadInfo = await uploadNextcloudFile(localPath, filename, { isGif: true })
        finalUrl = uploadInfo.publicUrl
        console.log('🌐 Nextcloud remote path:', uploadInfo.remotePath)
      } else {
        console.log('🖼️ Uploading image to Nextcloud with watermark...')
        watermarkedPath = path.join(targetDir, `watermarked_${filename}`)
        const watermarkAsset = WATERMARK_FILE
        let sourcePath = localPath

        try {
          await addWatermark(localPath, watermarkAsset, watermarkedPath)
          if (fs.existsSync(watermarkedPath)) {
            sourcePath = watermarkedPath
          } else {
            watermarkedPath = null
          }
        } catch (watermarkError) {
          console.warn('⚠️ Nextcloud watermark failed, using original image:', watermarkError.message)
          safeUnlink(watermarkedPath, 'watermark')
          watermarkedPath = null
          sourcePath = localPath
        }

        const uploadInfo = await uploadNextcloudFile(sourcePath, filename, { isGif: false })
        finalUrl = uploadInfo.publicUrl
        console.log('🌐 Nextcloud remote path:', uploadInfo.remotePath)
      }
    } else {
      console.log('📦 Using FTP storage provider')
      const cfg = getFtpConfig()
      const basePath = isGif
        ? (cfg.ftpPath.replace(/\/$/, '') + '/gif/')
        : cfg.ftpPath
      const normalizedBase = basePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/([^/])$/, '$1/')
      const remoteFile = `${normalizedBase}${filename}`.replace(/\/+/g, '/')

      console.log('🌐 Remote path:', remoteFile)

      if (isGif) {
        console.log('🎞️ Uploading GIF to FTP (no watermark)...')
        finalUrl = await uploadFtpFile(localPath, remoteFile)
      } else {
        console.log('🖼️ Uploading image to FTP with watermark...')
        finalUrl = await copyFtpFile(localPath, remoteFile)
      }
    }

    console.log('✅ Storage upload successful:', finalUrl)

    const qrDataURL = await QRCode.toDataURL(finalUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    })

    safeUnlink(localPath, 'local upload')
    safeUnlink(watermarkedPath, 'watermarked upload')

    return res.json({
      success: true,
      downloadUrl: finalUrl,
      viewUrl: finalUrl,
      directLink: finalUrl,
      qrCode: qrDataURL,
      filename,
      storageProvider: isNextcloudProvider ? 'nextcloud' : 'ftp'
    })
  } catch (error) {
    console.error('❌ Upload error, falling back to local storage:', error)

    try {
      if (!fs.existsSync(localPath)) {
        fs.mkdirSync(path.dirname(localPath), { recursive: true })
        fs.writeFileSync(localPath, req.file.buffer)
      }
    } catch (writeError) {
      console.error('❌ Failed to prepare local fallback file:', writeError)
      return res.status(500).json({ error: 'Upload failed and local fallback unavailable' })
    }

    const subDir = isGif ? 'gif' : 'img'
    const relativePath = path.posix.join('uploads', subDir, filename)
    const localUrl = `${req.protocol}://${req.get('host')}/${relativePath.replace(/\\/g, '/')}`
    const qrDataURL = await QRCode.toDataURL(localUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    })

    return res.json({
      success: true,
      downloadUrl: `/${relativePath}`,
      viewUrl: `/${relativePath}`,
      directLink: localUrl,
      qrCode: qrDataURL,
      filename,
      storageProvider: 'local-fallback'
    })
  }
})

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_BASE_DIR))

// Serve the main app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'dist', 'index.html'))
})

app.listen(PORT, () => {
  const ftpConfig = getFtpConfig()
  const ncConfig = getNextcloudConfig()
  console.log(`🚀 Server running on port ${PORT}`)
  console.log(`🔧 Active storage provider: ${STORAGE_PROVIDER}`)
  console.log(`📡 FTP configured: ${!!(ftpConfig.ftpAddress && ftpConfig.ftpUsername && ftpConfig.ftpPassword)}`)
  console.log(`☁️ Nextcloud configured: ${!!(ncConfig.serverUrl && ncConfig.webdavRoot && ncConfig.username && ncConfig.password)}`)
  console.log(`🩺 Health check: http://localhost:${PORT}/health`)
})
