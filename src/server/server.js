import express from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'
import QRCode from 'qrcode'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const UPLOAD_BASE_DIR =
  process.env.UPLOAD_BASE_DIR
    ? path.resolve(process.env.UPLOAD_BASE_DIR)
    : path.resolve(__dirname, '..', '..', 'public', 'uploads')
const UPLOAD_IMG_DIR = path.join(UPLOAD_BASE_DIR, 'img')
const UPLOAD_GIF_DIR = path.join(UPLOAD_BASE_DIR, 'gif')

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

const resolvePublicBaseUrl = req => {
  const configured = (process.env.PUBLIC_BASE_URL || '').trim()
  if (configured) {
    return configured.replace(/\/+$/, '')
  }
  return `${req.protocol}://${req.get('host')}`
}

app.use(express.json())
app.use(express.static(path.resolve(__dirname, '..', '..', 'dist')))

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
})

console.log(`[storage] Provider: local (hardcoded)`)

// Upload endpoint simplified for local storage only
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

  try {
    ensureDir(targetDir)
    fs.writeFileSync(localPath, req.file.buffer)

    console.log('[upload] File saved locally:', localPath)

    const subDir = isGif ? 'gif' : 'img'
    const relativePath = path.posix.join('uploads', subDir, filename)
    const basePublicUrl = resolvePublicBaseUrl(req)
    const webPath = relativePath.replace(/\\/g, '/')
    const directLink = `${basePublicUrl}/${webPath}`
    
    const localResult = {
      provider: 'local',
      downloadUrl: `/${webPath}`,
      viewUrl: `/${webPath}`,
      directLink,
      relativePath: webPath
    }

    const qrTarget = directLink
    const qrDataURL = await QRCode.toDataURL(qrTarget, {
      width: 300,
      margin: 2,
      color: { dark: '#000000', light: '#FFFFFF' }
    })

    return res.json({
      success: true,
      downloadUrl: localResult.downloadUrl,
      viewUrl: localResult.viewUrl,
      directLink: localResult.directLink,
      qrCode: qrDataURL,
      filename,
      storageProvider: 'local',
      storageResults: [localResult]
    })
  } catch (error) {
    console.error('[upload] Error during local save or QR generation:', error)
    return res.status(500).json({ error: 'File processing failed.' })
  }
})

// Serve uploaded files
app.use('/uploads', express.static(UPLOAD_BASE_DIR))

// Serve the main app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'dist', 'index.html'))
})

app.listen(PORT, () => {
  console.log(`[server] Running on port ${PORT}`)
  console.log(`[storage] Provider forced to 'local'`)
})
