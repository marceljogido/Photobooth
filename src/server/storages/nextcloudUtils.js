/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */
import { createClient } from 'webdav'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import fetch from 'node-fetch'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const USE_NEXTCLOUD_CONFIG_FILE = String(
  process.env.NEXTCLOUD_USE_CONFIG_FILE || process.env.USE_CONFIG_FILES || ''
).toLowerCase() === 'true'

function normalizeUrl(url) {
  if (!url) return ''
  return url.replace(/\s+/g, '').replace(/\/+$/, '')
}

function normalizeDavRoot(davRoot) {
  if (!davRoot) return ''
  const cleaned = davRoot.replace(/\\/g, '/').replace(/\/+/g, '/')
  return cleaned.replace(/\/+$/, '')
}

function normalizeFolder(folder, defaultValue = '') {
  if (!folder) return defaultValue
  const cleaned = folder.replace(/\\/g, '/')
  return cleaned.replace(/^\/+/, '').replace(/\/+$/, '')
}

let nextcloudConfig = {
  serverUrl: normalizeUrl(process.env.NEXTCLOUD_SERVER_URL || 'https://your-nextcloud.example.com'),
  username: process.env.NEXTCLOUD_USERNAME || '',
  password: process.env.NEXTCLOUD_PASSWORD || '',
  webdavRoot: normalizeDavRoot(process.env.NEXTCLOUD_WEBDAV_ROOT || '/remote.php/dav/files/USERNAME'),
  baseFolder: normalizeFolder(process.env.NEXTCLOUD_BASE_FOLDER || 'digiOH_files'),
  gifFolder: normalizeFolder(process.env.NEXTCLOUD_GIF_FOLDER || 'digiOH_files/gif'),
  sharePermissions: Number(process.env.NEXTCLOUD_SHARE_PERMISSIONS || 1),
  sharePassword: process.env.NEXTCLOUD_SHARE_PASSWORD || '',
  shareExpireDays: process.env.NEXTCLOUD_SHARE_EXPIRE_DAYS ? Number(process.env.NEXTCLOUD_SHARE_EXPIRE_DAYS) : null
}

function getConfigPath() {
  return path.join(__dirname, 'digiOH_PhotoBox_config_nextcloud.json')
}

function loadNextcloudConfig() {
  if (!USE_NEXTCLOUD_CONFIG_FILE) {
    console.log('ℹ️ Nextcloud config file disabled; using environment variables only')
    return
  }
  try {
    const configPath = getConfigPath()
    if (fs.existsSync(configPath)) {
      const configData = fs.readFileSync(configPath, 'utf8')
      const config = JSON.parse(configData)
      nextcloudConfig = {
        ...nextcloudConfig,
        ...config,
        serverUrl: normalizeUrl(config.serverUrl ?? nextcloudConfig.serverUrl),
        username: config.username ?? nextcloudConfig.username,
        password: config.password ?? nextcloudConfig.password,
        webdavRoot: normalizeDavRoot(config.webdavRoot ?? nextcloudConfig.webdavRoot),
        baseFolder: normalizeFolder(config.baseFolder ?? nextcloudConfig.baseFolder, 'digiOH_files'),
        gifFolder: normalizeFolder(config.gifFolder ?? nextcloudConfig.gifFolder, 'digiOH_files/gif'),
        sharePermissions: Number(config.sharePermissions ?? nextcloudConfig.sharePermissions ?? 1),
        sharePassword: config.sharePassword ?? nextcloudConfig.sharePassword ?? '',
        shareExpireDays: config.shareExpireDays != null
          ? Number(config.shareExpireDays)
          : nextcloudConfig.shareExpireDays
      }
      console.log('✅ Nextcloud configuration loaded from file')
    } else {
      console.log('ℹ️ Nextcloud config file not found, using defaults')
    }
  } catch (error) {
    console.error('❌ Error loading Nextcloud config:', error.message)
    console.log('ℹ️ Using default Nextcloud configuration')
  }
}

export function getNextcloudConfig() {
  return { ...nextcloudConfig }
}

export function updateNextcloudConfig(newConfig) {
  nextcloudConfig = {
    ...nextcloudConfig,
    ...newConfig,
    serverUrl: normalizeUrl(newConfig?.serverUrl ?? nextcloudConfig.serverUrl),
    username: newConfig?.username ?? nextcloudConfig.username,
    password: newConfig?.password ?? nextcloudConfig.password,
    webdavRoot: normalizeDavRoot(newConfig?.webdavRoot ?? nextcloudConfig.webdavRoot),
    baseFolder: normalizeFolder(newConfig?.baseFolder ?? nextcloudConfig.baseFolder, 'digiOH_files'),
    gifFolder: normalizeFolder(newConfig?.gifFolder ?? nextcloudConfig.gifFolder, 'digiOH_files/gif'),
    sharePermissions: Number(newConfig?.sharePermissions ?? nextcloudConfig.sharePermissions ?? 1),
    sharePassword: newConfig?.sharePassword ?? nextcloudConfig.sharePassword ?? '',
    shareExpireDays: newConfig?.shareExpireDays != null
      ? Number(newConfig.shareExpireDays)
      : nextcloudConfig.shareExpireDays
  }

  if (USE_NEXTCLOUD_CONFIG_FILE) {
    try {
      const configPath = getConfigPath()
      fs.writeFileSync(configPath, JSON.stringify(nextcloudConfig, null, 2))
      console.log('✅ Nextcloud configuration saved to file')
    } catch (error) {
      console.error('❌ Error saving Nextcloud config:', error.message)
    }
  }
}

function buildClient() {
  const cfg = getNextcloudConfig()
  if (!cfg.serverUrl || !cfg.webdavRoot || !cfg.username || !cfg.password) {
    throw new Error('Incomplete Nextcloud configuration')
  }
  const remoteBase = `${cfg.serverUrl}${cfg.webdavRoot}`.replace(/\/+$/, '') + '/'
  return createClient(remoteBase, {
    username: cfg.username,
    password: cfg.password
  })
}

function resolveTargetPath(isGif, filename) {
  const cfg = getNextcloudConfig()
  const targetFolder = isGif ? cfg.gifFolder : cfg.baseFolder
  const normalizedFolder = normalizeFolder(targetFolder, isGif ? 'digiOH_files/gif' : 'digiOH_files')
  const folderPath = normalizedFolder ? `${normalizedFolder}/` : ''
  const remotePath = `${folderPath}${filename}`.replace(/\/+/g, '/')
  return {
    folder: normalizedFolder,
    remotePath,
    sharePath: `/${remotePath}`
  }
}

async function ensureDirectory(client, folder) {
  if (!folder) return
  const segments = folder.split('/').filter(Boolean)
  let current = ''
  for (const segment of segments) {
    current += `${segment}/`
    try {
      // eslint-disable-next-line no-await-in-loop
      await client.createDirectory(current)
    } catch (error) {
      if (error?.response?.status !== 405) {
        throw error
      }
      // Ignore "Method Not Allowed" which means directory already exists.
    }
  }
}

async function createPublicShare(remotePath) {
  const cfg = getNextcloudConfig()
  if (!cfg.serverUrl || !cfg.username || !cfg.password) {
    throw new Error('Nextcloud credentials are missing for share creation')
  }

  const shareEndpoint = `${cfg.serverUrl}/ocs/v2.php/apps/files_sharing/api/v1/shares?format=json`
  const params = new URLSearchParams({
    path: remotePath,
    shareType: '3',
    permissions: String(cfg.sharePermissions ?? 1)
  })

  if (cfg.sharePassword) {
    params.append('password', cfg.sharePassword)
  }

  if (cfg.shareExpireDays && Number.isFinite(cfg.shareExpireDays)) {
    const expireDate = new Date()
    expireDate.setDate(expireDate.getDate() + Number(cfg.shareExpireDays))
    params.append('expireDate', expireDate.toISOString().slice(0, 10))
  }

  const response = await fetch(shareEndpoint, {
    method: 'POST',
    headers: {
      'OCS-APIRequest': 'true',
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    body: params
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Nextcloud share API error (${response.status}): ${errorText}`)
  }

  const data = await response.json()
  if (data?.ocs?.meta?.status !== 'ok') {
    throw new Error(`Nextcloud share API returned error: ${data?.ocs?.meta?.message || 'Unknown error'}`)
  }

  const url = data?.ocs?.data?.url
  if (!url) {
    throw new Error('Nextcloud share API did not return a public URL')
  }

  return url
}

export async function uploadNextcloudFile(localPath, filename, { isGif = false } = {}) {
  const client = buildClient()
  const { folder, remotePath, sharePath } = resolveTargetPath(isGif, filename)

  await ensureDirectory(client, folder)

  const fileBuffer = fs.readFileSync(localPath)
  await client.putFileContents(remotePath, fileBuffer, { overwrite: true })
  console.log(`✅ Uploaded file to Nextcloud: ${remotePath}`)

  const publicUrl = await createPublicShare(sharePath)
  console.log(`🔗 Nextcloud public URL: ${publicUrl}`)

  return {
    publicUrl,
    remotePath,
    sharePath
  }
}

export async function testNextcloudConnection() {
  try {
    const client = buildClient()
    await client.getDirectoryContents('/')
    return { success: true, message: 'Nextcloud connection successful' }
  } catch (error) {
    return { success: false, message: error.message }
  }
}

loadNextcloudConfig()
