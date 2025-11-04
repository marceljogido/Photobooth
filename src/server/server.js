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

const parseBoolean = value => {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return null
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return null
}

const resolveBoolean = (value, fallback) => {
  const parsed = parseBoolean(value)
  return parsed === null ? fallback : parsed
}

const defaultProvider = (process.env.STORAGE_PROVIDER || 'nextcloud').toLowerCase()

let enableNextcloud = resolveBoolean(process.env.ENABLE_NEXTCLOUD_STORAGE, defaultProvider === 'nextcloud')
let enableFtp = resolveBoolean(process.env.ENABLE_FTP_STORAGE, defaultProvider === 'ftp')
let enableLocal = resolveBoolean(process.env.ENABLE_LOCAL_STORAGE, defaultProvider === 'local')

if (!enableNextcloud && !enableFtp && !enableLocal) {
  enableLocal = true
}

const keepLocalCopy = resolveBoolean(process.env.KEEP_LOCAL_COPY, enableLocal)

const activeProviders = []
if (enableNextcloud) activeProviders.push('nextcloud')
if (enableFtp) activeProviders.push('ftp')
if (enableLocal) activeProviders.push('local')

const primaryStorageProvider = (() => {
  const preferred = (process.env.PRIMARY_STORAGE_PROVIDER || defaultProvider || '').toLowerCase()
  if (preferred && activeProviders.includes(preferred)) return preferred
  return activeProviders[0] || 'local'
})()

app.use(express.json())
app.use(express.static(path.resolve(__dirname, '..', '..', 'dist')))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
})

console.log(`[storage] Active providers: ${activeProviders.join(', ') || 'local (auto)'}`)
console.log(`[storage] Primary provider: ${primaryStorageProvider}`)
console.log(`[storage] Keep local copy: ${keepLocalCopy}`)

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
    storage_provider: primaryStorageProvider,
    storage_providers: activeProviders,
    local_storage_enabled: enableLocal,
    keep_local_copy: keepLocalCopy,
    ftp_enabled: enableFtp,
    ftp_configured: !!(ftpConfig.ftpAddress && ftpConfig.ftpUsername && ftpConfig.ftpPassword),
    ftp_config: {
      host: ftpConfig.ftpAddress,
      port: ftpConfig.ftpPort,
      path: ftpConfig.ftpPath,
      displayUrl: ftpConfig.displayUrl
    },
    nextcloud_enabled: enableNextcloud,
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
  console.log('[upload] Upload request received')

  if (!req.file) {
    console.log('[upload] No file uploaded')
    return res.status(400).json({ error: 'No file uploaded' })
  }

  console.log('[upload] File received:', {
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
  let nextcloudWatermarkedPath = null

  try {
    ensureDir(targetDir)
    fs.writeFileSync(localPath, req.file.buffer)

    console.log('[upload] Using filename:', filename)

    const buildLocalResult = () => {
      const subDir = isGif ? 'gif' : 'img'
      const relativePath = path.posix.join('uploads', subDir, filename)
      const directLink = `${req.protocol}://${req.get('host')}/${relativePath.replace(/\\/g, '/')}`
      return {
        provider: 'local',
        downloadUrl: `/${relativePath}`,
        viewUrl: `/${relativePath}`,
        directLink,
        relativePath
      }
    }

    const results = []
    const errors = []
    const localResult = buildLocalResult()
    let keepLocalFile = enableLocal || keepLocalCopy

    if (enableLocal || keepLocalCopy) {
      results.push({ ...localResult, retained: true })
    }

    if (enableNextcloud) {
      try {
        console.log('[nextcloud] Using Nextcloud storage provider')
        if (isGif) {
          console.log('[nextcloud] Uploading GIF to Nextcloud (no watermark)...')
          const uploadInfo = await uploadNextcloudFile(localPath, filename, { isGif: true })
          results.push({
            provider: 'nextcloud',
            downloadUrl: uploadInfo.publicUrl,
            viewUrl: uploadInfo.publicUrl,
            directLink: uploadInfo.publicUrl,
            remotePath: uploadInfo.remotePath
          })
          console.log('[nextcloud] Nextcloud remote path:', uploadInfo.remotePath)
        } else {
          console.log('[nextcloud] Uploading image to Nextcloud with watermark...')
          nextcloudWatermarkedPath = path.join(targetDir, `watermarked_${filename}`)
          const watermarkAsset = WATERMARK_FILE
          let sourcePath = localPath

          try {
            await addWatermark(localPath, watermarkAsset, nextcloudWatermarkedPath)
            if (fs.existsSync(nextcloudWatermarkedPath)) {
              sourcePath = nextcloudWatermarkedPath
            } else {
              nextcloudWatermarkedPath = null
            }
          } catch (watermarkError) {
            console.warn('[nextcloud] Nextcloud watermark failed, using original image:', watermarkError.message)
            safeUnlink(nextcloudWatermarkedPath, 'nextcloud watermark')
            nextcloudWatermarkedPath = null
            sourcePath = localPath
          }

          const uploadInfo = await uploadNextcloudFile(sourcePath, filename, { isGif: false })
          results.push({
            provider: 'nextcloud',
            downloadUrl: uploadInfo.publicUrl,
            viewUrl: uploadInfo.publicUrl,
            directLink: uploadInfo.publicUrl,
            remotePath: uploadInfo.remotePath
          })
          console.log('[nextcloud] Nextcloud remote path:', uploadInfo.remotePath)
        }
      } catch (nextcloudError) {
        console.error('[nextcloud] Nextcloud upload error:', nextcloudError)
        errors.push({ provider: 'nextcloud', message: nextcloudError.message })
      } finally {
        safeUnlink(nextcloudWatermarkedPath, 'nextcloud watermark')
        nextcloudWatermarkedPath = null
      }
    }

    if (enableFtp) {
      try {
        console.log('[ftp] Using FTP storage provider')
        const cfg = getFtpConfig()
        const basePath = isGif
          ? (cfg.ftpPath.replace(/\/$/, '') + '/gif/')
          : cfg.ftpPath
        const normalizedBase = basePath.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/([^/])$/, '$1/')
        const remoteFile = `${normalizedBase}${filename}`.replace(/\/+/g, '/')
        console.log('[ftp] Remote path:', remoteFile)

        let finalUrl
        if (isGif) {
          console.log('[ftp] Uploading GIF to FTP (no watermark)...')
          finalUrl = await uploadFtpFile(localPath, remoteFile)
        } else {
          console.log('[ftp] Uploading image to FTP with watermark...')
          finalUrl = await copyFtpFile(localPath, remoteFile)
        }

        results.push({
          provider: 'ftp',
          downloadUrl: finalUrl,
          viewUrl: finalUrl,
          directLink: finalUrl,
          remotePath: remoteFile
        })
        console.log('[ftp] FTP upload completed:', finalUrl)
      } catch (ftpError) {
        console.error('[ftp] FTP upload error:', ftpError)
        errors.push({ provider: 'ftp', message: ftpError.message })
      }
    }

    if (!results.length) {
      results.push({ ...localResult, retained: true })
      keepLocalFile = true
    } else if ((keepLocalCopy || enableLocal) && !results.some(result => result.provider === 'local')) {
      results.push({ ...localResult, retained: true })
      keepLocalFile = true
    }

    const providerLogs = results.map(result => `${result.provider} -> ${result.directLink || result.downloadUrl}`)
    if (providerLogs.length) {
      console.log('[storage] Storage results:', providerLogs.join('; '))
    }
    if (errors.length) {
      errors.forEach(errorInfo => {
        console.warn(`[storage] ${errorInfo.provider} upload issue: ${errorInfo.message}`)
      })
    }

    const primaryCandidate = primaryStorageProvider
    let primaryResult = results.find(result => result.provider === primaryCandidate)

    if (!primaryResult) {
      const nonLocal = results.find(result => result.provider !== 'local')
      primaryResult = nonLocal || results[0]
    }

    if (!primaryResult) {
      primaryResult = { ...localResult, retained: true }
      if (!results.some(result => result.provider === 'local')) {
        results.push(primaryResult)
      }
      keepLocalFile = true
    }

    const qrTarget = primaryResult.directLink || primaryResult.downloadUrl
    const qrDataURL = await QRCode.toDataURL(qrTarget, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    })

    if (!keepLocalFile) {
      safeUnlink(localPath, 'local upload')
    }

    return res.json({
      success: true,
      downloadUrl: primaryResult.downloadUrl,
      viewUrl: primaryResult.viewUrl,
      directLink: primaryResult.directLink,
      qrCode: qrDataURL,
      filename,
      storageProvider: primaryResult.provider,
      storageResults: results,
      storageErrors: errors.length ? errors : undefined
    })
  } catch (error) {
    console.error('[upload] Upload error, falling back to local storage:', error)

    try {
      if (!fs.existsSync(localPath)) {
        fs.mkdirSync(path.dirname(localPath), { recursive: true })
        fs.writeFileSync(localPath, req.file.buffer)
      }
    } catch (writeError) {
      console.error('[upload] Failed to prepare local fallback file:', writeError)
      return res.status(500).json({ error: 'Upload failed and local fallback unavailable' })
    }

    const subDir = isGif ? 'gif' : 'img'
    const relativePath = path.posix.join('uploads', subDir, filename)
    const fallbackUrl = `${req.protocol}://${req.get('host')}/${relativePath.replace(/\\/g, '/')}`
    const qrDataURL = await QRCode.toDataURL(fallbackUrl, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    })

    const fallbackResult = {
      provider: 'local',
      downloadUrl: `/${relativePath}`,
      viewUrl: `/${relativePath}`,
      directLink: fallbackUrl,
      relativePath,
      retained: true
    }

    return res.json({
      success: true,
      downloadUrl: fallbackResult.downloadUrl,
      viewUrl: fallbackResult.viewUrl,
      directLink: fallbackResult.directLink,
      qrCode: qrDataURL,
      filename,
      storageProvider: 'local-fallback',
      storageResults: [fallbackResult],
      storageErrors: [{ provider: 'combined', message: error.message }]
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
  console.log(`[server] Running on port ${PORT}`)
  console.log(`[storage] Active providers: ${activeProviders.join(', ') || 'none'}`)
  console.log(`[storage] Primary provider: ${primaryStorageProvider}`)
  console.log(
    `[ftp] Enabled: ${enableFtp} | configured: ${
      !!(ftpConfig.ftpAddress && ftpConfig.ftpUsername && ftpConfig.ftpPassword)
    }`
  )
  console.log(
    `[nextcloud] Enabled: ${enableNextcloud} | configured: ${
      !!(ncConfig.serverUrl && ncConfig.webdavRoot && ncConfig.username && ncConfig.password)
    }`
  )
  console.log(`[health] Check: http://localhost:${PORT}/health`)
})
