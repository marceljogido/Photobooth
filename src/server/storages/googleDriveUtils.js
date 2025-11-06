/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import {google} from 'googleapis'

const DRIVE_SCOPES = ['https://www.googleapis.com/auth/drive.file']

const parseBoolean = value => {
  if (value === undefined || value === null) return null
  const normalized = String(value).trim().toLowerCase()
  if (!normalized) return null
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true
  if (['false', '0', 'no', 'off'].includes(normalized)) return false
  return null
}

const resolveBoolean = (value, fallback = false) => {
  const parsed = parseBoolean(value)
  return parsed === null ? fallback : parsed
}

const normalizePrivateKey = key => {
  if (!key) return key
  return key.replace(/\\n/g, '\n')
}

const readJsonIfExists = filePath => {
  if (!filePath) return null
  try {
    const resolved = path.resolve(filePath)
    if (!fs.existsSync(resolved)) return null
    const raw = fs.readFileSync(resolved, 'utf8')
    return JSON.parse(raw)
  } catch (error) {
    console.warn('[gdrive] Failed reading service account file:', error.message)
    return null
  }
}

const parseJsonSafe = raw => {
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch (error) {
    console.warn('[gdrive] Failed parsing inline service account JSON:', error.message)
    return null
  }
}

const resolveServiceAccount = overrides => {
  if (overrides?.serviceAccount) return overrides.serviceAccount
  if (overrides?.serviceAccountJson) {
    const parsed = parseJsonSafe(overrides.serviceAccountJson)
    if (parsed) return parsed
  }
  if (process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON) {
    const parsed = parseJsonSafe(process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON)
    if (parsed) return parsed
  }
  const filePath =
    overrides?.serviceAccountFile || process.env.GOOGLE_DRIVE_SERVICE_ACCOUNT_FILE
  if (filePath) {
    const parsed = readJsonIfExists(filePath)
    if (parsed) return parsed
  }
  return null
}

const resolveCredentials = (overrides = {}) => {
  const serviceAccount = resolveServiceAccount(overrides)
  let clientEmail = overrides.clientEmail || process.env.GOOGLE_DRIVE_CLIENT_EMAIL
  let privateKey = overrides.privateKey || process.env.GOOGLE_DRIVE_PRIVATE_KEY
  const impersonateEmail =
    overrides.impersonateEmail || process.env.GOOGLE_DRIVE_IMPERSONATE_EMAIL || null

  if (serviceAccount) {
    clientEmail = serviceAccount.client_email || clientEmail
    privateKey = serviceAccount.private_key || privateKey
  }

  privateKey = normalizePrivateKey(privateKey)

  return {
    clientEmail: clientEmail || '',
    privateKey: privateKey || '',
    impersonateEmail
  }
}

const cached = {
  auth: null,
  drive: null,
  cachedKey: null
}

async function getDriveClient(options = {}) {
  const {clientEmail, privateKey, impersonateEmail} = resolveCredentials(options)

  if (!clientEmail || !privateKey) {
    throw new Error('Google Drive credentials are not fully configured')
  }

  const cacheKey = `${clientEmail}:${impersonateEmail || ''}`
  if (cached.drive && cached.cachedKey === cacheKey) {
    return cached.drive
  }

  const auth = new google.auth.JWT(
    clientEmail,
    undefined,
    privateKey,
    DRIVE_SCOPES,
    impersonateEmail || undefined
  )

  await auth.authorize()
  const drive = google.drive({version: 'v3', auth})
  cached.auth = auth
  cached.drive = drive
  cached.cachedKey = cacheKey
  return drive
}

const detectMimeType = (filename, fallbackMime = 'application/octet-stream') => {
  if (!filename) return fallbackMime
  const ext = path.extname(filename).slice(1).toLowerCase()
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'png':
      return 'image/png'
    case 'gif':
      return 'image/gif'
    case 'webp':
      return 'image/webp'
    default:
      return fallbackMime
  }
}

export const getGoogleDriveConfig = () => {
  const credentials = resolveCredentials()
  const baseFolderId =
    process.env.GOOGLE_DRIVE_BASE_FOLDER_ID ||
    process.env.GOOGLE_DRIVE_FOLDER_ID ||
    ''
  return {
    clientEmail: credentials.clientEmail,
    hasPrivateKey: Boolean(credentials.privateKey),
    baseFolderId,
    gifFolderId: process.env.GOOGLE_DRIVE_GIF_FOLDER_ID || '',
    makePublic: resolveBoolean(process.env.GOOGLE_DRIVE_SHARE_WITH_ANYONE, true),
    impersonateEmail: credentials.impersonateEmail,
    useTeamDrive: resolveBoolean(process.env.GOOGLE_DRIVE_USE_SHARED_DRIVE, false),
    sharedDriveId: process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID || ''
  }
}

export const isGoogleDriveConfigured = () => {
  const cfg = getGoogleDriveConfig()
  return Boolean(cfg.clientEmail && cfg.hasPrivateKey)
}

export const testGoogleDriveConnection = async overrides => {
  try {
    const drive = await getDriveClient(overrides)
    const cfg = getGoogleDriveConfig()
    const folderId = overrides?.folderId || cfg.baseFolderId || cfg.gifFolderId

    if (folderId) {
      await drive.files.get({
        fileId: folderId,
        fields: 'id',
        supportsAllDrives: cfg.useTeamDrive
      })
    } else {
      await drive.files.list({
        pageSize: 1,
        fields: 'files(id)',
        corpora: cfg.useTeamDrive ? 'drive' : 'user',
        driveId: cfg.useTeamDrive ? cfg.sharedDriveId || undefined : undefined,
        includeItemsFromAllDrives: cfg.useTeamDrive || undefined,
        supportsAllDrives: cfg.useTeamDrive || undefined
      })
    }

    return {success: true, message: 'Google Drive connection succeeded'}
  } catch (error) {
    return {success: false, message: error.message}
  }
}

export const uploadGoogleDriveFile = async (localPath, filename, options = {}) => {
  if (!fs.existsSync(localPath)) {
    throw new Error(`Local file not found: ${localPath}`)
  }

  const cfg = getGoogleDriveConfig()
  const drive = await getDriveClient(options)
  const isGif = Boolean(options.isGif)

  const targetFolderId = isGif && cfg.gifFolderId ? cfg.gifFolderId : cfg.baseFolderId
  if (!targetFolderId) {
    throw new Error('Google Drive folder is not configured (GOOGLE_DRIVE_BASE_FOLDER_ID)')
  }

  const mimeType = options.mimeType || detectMimeType(filename)
  const media = {
    mimeType,
    body: fs.createReadStream(localPath)
  }

  const requestBody = {
    name: filename,
    parents: [targetFolderId]
  }

  const fileResponse = await drive.files.create({
    requestBody,
    media,
    fields: 'id, name, webViewLink, webContentLink',
    supportsAllDrives: cfg.useTeamDrive
  })

  const fileId = fileResponse.data.id
  if (!fileId) {
    throw new Error('Google Drive did not return a file id')
  }

  if (cfg.makePublic) {
    try {
      await drive.permissions.create({
        fileId,
        requestBody: {role: 'reader', type: 'anyone'},
        supportsAllDrives: cfg.useTeamDrive
      })
    } catch (permissionError) {
      console.warn('[gdrive] Unable to set public permission:', permissionError.message)
    }
  }

  const viewUrl =
    fileResponse.data.webViewLink ||
    `https://drive.google.com/file/d/${fileId}/view?usp=sharing`
  const downloadUrl =
    fileResponse.data.webContentLink ||
    `https://drive.google.com/uc?id=${fileId}&export=download`

  return {
    provider: 'google-drive',
    fileId,
    downloadUrl,
    viewUrl,
    publicUrl: viewUrl
  }
}

export default {
  uploadGoogleDriveFile,
  getGoogleDriveConfig,
  isGoogleDriveConfigured,
  testGoogleDriveConnection
}
