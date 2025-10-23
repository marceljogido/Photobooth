/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, {useRef, useState, useCallback, useEffect, useMemo} from 'react'
import QRCode from 'qrcode'
import c from 'clsx'
import {
  snapPhoto,
  setMode,
  deletePhoto,
  makeGif,
  hideGif,
  resetSession,
  setCustomPrompt,
  init
} from '../lib/actions'
import useStore from '../lib/store'
import imageData from '../lib/imageData'
import modes from '../lib/modes'
const canvas = document.createElement('canvas')
const ctx = canvas.getContext('2d')
const modeKeys = Object.keys(modes)
const WATERMARK_OVERLAY_SRC = '/logowatermark.png'
const QR_TAB_OPTIONS = [
  {key: 'photo', label: 'QR Foto', icon: 'photo_camera'},
  {key: 'gif', label: 'QR GIF', icon: 'movie'}
]
const RESULT_TAB_OPTIONS = [
  {key: 'ai', label: 'Hasil AI', icon: 'image'},
  {key: 'gif', label: 'Hasil GIF', icon: 'movie'}
]

const PORTRAIT_ASPECT = 9 / 16
const LANDSCAPE_ASPECT = 16 / 9
const FORCE_PORTRAIT_CAPTURE = false
const DESKTOP_BREAKPOINT = 1024

const resolveViewportOrientation = () => {
  if (FORCE_PORTRAIT_CAPTURE) return 'portrait'
  if (typeof window === 'undefined') return 'landscape'
  const {innerWidth, innerHeight} = window
  if (innerWidth >= DESKTOP_BREAKPOINT) {
    return 'landscape'
  }
  if (typeof window.matchMedia === 'function') {
    try {
      if (window.matchMedia('(orientation: portrait)').matches) {
        return 'portrait'
      }
    } catch (error) {
      // matchMedia can throw on unsupported environments; ignore gracefully
    }
  }
  return innerHeight >= innerWidth ? 'portrait' : 'landscape'
}

const ensurePositive = (value, fallback) =>
  Number.isFinite(value) && value > 0 ? value : fallback

const computeCaptureGeometry = (videoWidth, videoHeight, {portrait, rotate}) => {
  const targetAspect = portrait ? PORTRAIT_ASPECT : LANDSCAPE_ASPECT
  const safeWidth = ensurePositive(videoWidth, portrait ? 1080 : 1920)
  const safeHeight = ensurePositive(videoHeight, portrait ? 1920 : 1080)

  const effectiveWidth = rotate ? safeHeight : safeWidth
  const effectiveHeight = rotate ? safeWidth : safeHeight
  const effectiveAspect = ensurePositive(effectiveWidth / effectiveHeight, targetAspect)

  let cropWidthEffective = effectiveWidth
  let cropHeightEffective = effectiveHeight

  if (Math.abs(effectiveAspect - targetAspect) > 0.001) {
    if (effectiveAspect > targetAspect) {
      cropWidthEffective = cropHeightEffective * targetAspect
    } else {
      cropHeightEffective = cropWidthEffective / targetAspect
    }
  }

  const sourceWidth = rotate ? cropHeightEffective : cropWidthEffective
  const sourceHeight = rotate ? cropWidthEffective : cropHeightEffective

  const sourceX = Math.max(0, (safeWidth - sourceWidth) / 2)
  const sourceY = Math.max(0, (safeHeight - sourceHeight) / 2)

  return {
    canvasWidth: Math.round(cropWidthEffective),
    canvasHeight: Math.round(cropHeightEffective),
    sourceWidth,
    sourceHeight,
    sourceX,
    sourceY,
    aspect: targetAspect
  }
}

const loadImage = src =>
  new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image API unavailable'))
      return
    }
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

let watermarkPreviewPromise = null

const getWatermarkImage = async () => {
  if (!watermarkPreviewPromise) {
    watermarkPreviewPromise = loadImage(WATERMARK_OVERLAY_SRC).catch(error => {
      watermarkPreviewPromise = null
      throw error
    })
  }
  return watermarkPreviewPromise
}

const getMimeTypeFromDataUrl = dataUrl => {
  const match = typeof dataUrl === 'string'
    ? dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);/)
    : null
  return match ? match[1] : 'image/png'
}

const buildWatermarkedPreview = async base64Data => {
  const [sourceImage, watermark] = await Promise.all([
    loadImage(base64Data),
    getWatermarkImage()
  ])

  const width = sourceImage.width || 1
  const height = sourceImage.height || 1
  const previewCanvas = document.createElement('canvas')
  previewCanvas.width = width
  previewCanvas.height = height
  const previewCtx = previewCanvas.getContext('2d')
  previewCtx.drawImage(sourceImage, 0, 0, width, height)

  if (watermark && watermark.width && watermark.height) {
    const targetWidth = width * 0.2
    const targetHeight = targetWidth * (watermark.height / watermark.width)
    const margin = Math.max(10, Math.round(Math.min(width, height) * 0.04))
    const x = width - targetWidth - margin
    const y = height - targetHeight - margin
    previewCtx.drawImage(watermark, x, y, targetWidth, targetHeight)
  }

  const mimeType = getMimeTypeFromDataUrl(base64Data)
  try {
    if (mimeType === 'image/jpeg' || mimeType === 'image/webp') {
      return previewCanvas.toDataURL(mimeType, 0.92)
    }
    return previewCanvas.toDataURL(mimeType)
  } catch (error) {
    console.warn('Falling back to PNG for watermarked preview:', error)
    return previewCanvas.toDataURL('image/png')
  }
}
export default function App() {
  console.log('🚀 App component rendering...')
  
  useEffect(() => {
    init()
  }, [])
  
  let photos, customPrompt, activeMode, gifInProgress, gifUrl
  
  try {
    console.log('🛠️ Attempting to load store...')
    photos = useStore.use.photos()
    customPrompt = useStore.use.customPrompt()
    activeMode = useStore.use.activeMode()
    gifInProgress = useStore.use.gifInProgress()
    gifUrl = useStore.use.gifUrl()
    console.log('📦 Store state loaded:', { 
      photosCount: photos.length, 
      activeMode, 
      customPromptLength: customPrompt.length 
    })
  } catch (error) {
    console.error('⚠️ Error loading store:', error)
    // Fallback values
    photos = []
    customPrompt = ''
    activeMode = 'renaissance'
    gifInProgress = false
    gifUrl = null
    console.log('🛟 Using fallback values')
  }
  
  console.log('🧩 About to render App component...')
  
  const [videoActive, setVideoActive] = useState(false)
  const [didInitVideo, setDidInitVideo] = useState(false)
  const [focusedId, setFocusedId] = useState(null)
  const [didJustSnap, setDidJustSnap] = useState(false)
  const [hoveredMode, setHoveredMode] = useState(null)
  const [tooltipPosition, setTooltipPosition] = useState({top: 0, left: 0})
  const [showCustomPrompt, setShowCustomPrompt] = useState(false)
  const [cameraError, setCameraError] = useState(null)
  const [isLoading, setIsLoading] = useState(false)
  const [countdown, setCountdown] = useState(0)
  const [showPreview, setShowPreview] = useState(false)
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false)
  const [lastPhoto, setLastPhoto] = useState(null)
  const [lastPhotoMeta, setLastPhotoMeta] = useState(null)
  const [qrCodes, setQrCodes] = useState({photo: null, gif: null})
  const [isUploading, setIsUploading] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [activeQrTab, setActiveQrTab] = useState('photo')
  const [currentPage, setCurrentPage] = useState('camera') // 'camera' or 'results'
  const [currentPhotoId, setCurrentPhotoId] = useState(null)
  const [showMobileModeSelector, setShowMobileModeSelector] = useState(false)
  const [showDesktopModeSelector, setShowDesktopModeSelector] = useState(false)
  const [activeResultTab, setActiveResultTab] = useState('ai')
  const [isMobileResults, setIsMobileResults] = useState(false)
  const initialOrientation = resolveViewportOrientation()
  const [cameraAspectRatio, setCameraAspectRatio] = useState(
    initialOrientation === 'portrait' ? PORTRAIT_ASPECT : LANDSCAPE_ASPECT
  )
  const [shouldRotateVideo, setShouldRotateVideo] = useState(false)
  const [isPortraitCapture, setIsPortraitCapture] = useState(initialOrientation === 'portrait')
  const [cloudUrls, setCloudUrls] = useState({}) // Store cloud URLs for photos
  const [watermarkedOutputs, setWatermarkedOutputs] = useState({})
  const [preparedDownloads, setPreparedDownloads] = useState({})
  const [isViewportPortrait, setIsViewportPortrait] = useState(initialOrientation === 'portrait')
  const watermarkedOutputsRef = useRef({})
  const uploadTokenRef = useRef(0)
  useEffect(() => {
    watermarkedOutputsRef.current = watermarkedOutputs
  }, [watermarkedOutputs])
  useEffect(() => {
    const updateOrientation = () => {
      if (typeof window === 'undefined') return
      setIsViewportPortrait(resolveViewportOrientation() === 'portrait')
    }
    updateOrientation()
    window.addEventListener('resize', updateOrientation)
    window.addEventListener('orientationchange', updateOrientation)
    return () => {
      window.removeEventListener('resize', updateOrientation)
      window.removeEventListener('orientationchange', updateOrientation)
    }
  }, [])
  const cameraStyle = useMemo(() => {
    const aspect = cameraAspectRatio > 0 ? cameraAspectRatio : 1
    const treatAsPortrait = aspect < 1 || isViewportPortrait || isPortraitCapture
    const widthValue = treatAsPortrait
      ? 'var(--camera-mobile-width, min(88vw, 420px))'
      : 'min(90vw, 1080px)'
    const maxHeightValue = treatAsPortrait
      ? 'var(--camera-mobile-max-height, auto)'
      : 'min(80vh, 608px)'
    return {
      aspectRatio: aspect,
      width: widthValue,
      maxWidth: '100%',
      height: 'auto',
      maxHeight: maxHeightValue,
      margin: 'var(--camera-margin, 0 auto)'
    }
  }, [cameraAspectRatio, isViewportPortrait, isPortraitCapture])
  
  useEffect(() => {
    if (photos.length === 0) {
      if (Object.keys(watermarkedOutputsRef.current).length) {
        watermarkedOutputsRef.current = {}
        setWatermarkedOutputs({})
      }
      return
    }
    const validIds = new Set(photos.map(photo => photo.id))
    const storedIds = Object.keys(watermarkedOutputsRef.current)
    const hasOrphans = storedIds.some(id => !validIds.has(id))
    if (hasOrphans) {
      const next = storedIds.reduce((acc, id) => {
        if (validIds.has(id)) {
          acc[id] = watermarkedOutputsRef.current[id]
        }
        return acc
      }, {})
      watermarkedOutputsRef.current = next
      setWatermarkedOutputs(next)
    }
  }, [photos])
  useEffect(() => {
    let cancelled = false
    const ensureWatermarkedPreviews = async () => {
      for (const photo of photos) {
        if (cancelled || photo.isBusy) continue
        const base64 = imageData.outputs[photo.id]
        if (!base64 || watermarkedOutputsRef.current[photo.id]) continue
        try {
          const watermarked = await buildWatermarkedPreview(base64)
          if (cancelled) return
          watermarkedOutputsRef.current = {
            ...watermarkedOutputsRef.current,
            [photo.id]: watermarked
          }
          setWatermarkedOutputs(current => ({
            ...current,
            [photo.id]: watermarked
          }))
        } catch (error) {
          console.warn('Failed generating watermarked preview:', error)
        }
      }
    }
    ensureWatermarkedPreviews()
    return () => {
      cancelled = true
    }
  }, [photos])
  useEffect(() => {
    if (!showDownloadModal) return
    setActiveQrTab(current => {
      if (current === 'photo' && qrCodes.photo) return current
      if (current === 'gif' && qrCodes.gif) return current
      if (qrCodes.photo) return 'photo'
      if (qrCodes.gif) return 'gif'
      return 'photo'
    })
  }, [showDownloadModal, qrCodes.photo, qrCodes.gif])
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mediaQuery = window.matchMedia('(max-width: 768px)')
    const handleChange = event => {
      setIsMobileResults(event.matches)
    }
    setIsMobileResults(mediaQuery.matches)
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange)
    } else {
      mediaQuery.addListener(handleChange)
    }
    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', handleChange)
      } else {
        mediaQuery.removeListener(handleChange)
      }
    }
  }, [])
  useEffect(() => {
    setActiveResultTab('ai')
  }, [currentPhotoId])
  
  const videoRef = useRef(null)
  // Auto-create GIF when there are ready photos and no GIF yet
  useEffect(() => {
    try {
      const readyCount = photos.filter(p => !p.isBusy).length
      if (readyCount > 0 && !gifInProgress && !gifUrl) {
        console.log('🎞️ Auto-creating GIF because photos are ready...')
        makeGif()
      }
    } catch (e) {
      // ignore
    }
  }, [photos, gifInProgress, gifUrl])

  const startVideo = async () => {
    try {
      console.log('Starting video...')
      setIsLoading(true)
      setCameraError(null)
      setDidInitVideo(true)
      
      // Check if getUserMedia is supported
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('getUserMedia tidak didukung di browser ini')
      }
      
      const desiredOrientation = resolveViewportOrientation()
      const portraitDesired = desiredOrientation === 'portrait'
      setIsViewportPortrait(portraitDesired)
      const preferredAspect = portraitDesired ? PORTRAIT_ASPECT : LANDSCAPE_ASPECT
      const highResConstraints = {
        audio: false,
        video: {
          width: {ideal: portraitDesired ? 1080 : 1920},
          height: {ideal: portraitDesired ? 1920 : 1080},
          aspectRatio: {ideal: preferredAspect},
          facingMode: {ideal: 'user'}
        }
      }
        const mediumResConstraints = {
        audio: false,
        video: {
          width: {ideal: portraitDesired ? 720 : 1280},
          height: {ideal: portraitDesired ? 1280 : 720},
          aspectRatio: {ideal: preferredAspect},
          facingMode: {ideal: 'user'}
        }
      }

      // Try different video constraints
      let stream
      try {
        // Try with high resolution first
        stream = await navigator.mediaDevices.getUserMedia(highResConstraints)
      } catch (error) {
        console.log('High resolution failed, trying medium...', error)
        try {
          // Try with medium resolution
          stream = await navigator.mediaDevices.getUserMedia(mediumResConstraints)
        } catch (fallbackError) {
          console.log('Medium resolution failed, falling back to default constraints...', fallbackError)
          stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
              facingMode: {ideal: 'user'}
            }
          })
        }
      }
      
      console.log('Video stream obtained:', stream)
      setVideoActive(true)
      videoRef.current.srcObject = stream
      // Wait for video to load
      videoRef.current.onloadedmetadata = () => {
        const {videoWidth, videoHeight} = videoRef.current
        const safeWidth = ensurePositive(videoWidth, portraitDesired ? 1080 : 1920)
        const safeHeight = ensurePositive(videoHeight, portraitDesired ? 1920 : 1080)
        const ratio = ensurePositive(safeWidth / safeHeight, portraitDesired ? PORTRAIT_ASPECT : LANDSCAPE_ASPECT)
        const rotateForPortrait = portraitDesired && ratio > 1

        const geometry = computeCaptureGeometry(safeWidth, safeHeight, {
          portrait: portraitDesired,
          rotate: rotateForPortrait
        })

        canvas.width = geometry.canvasWidth
        canvas.height = geometry.canvasHeight

        setShouldRotateVideo(rotateForPortrait)
        setIsPortraitCapture(portraitDesired)
        const displayAspect = ensurePositive(
          geometry.canvasWidth / geometry.canvasHeight,
          portraitDesired ? PORTRAIT_ASPECT : LANDSCAPE_ASPECT
        )
        setCameraAspectRatio(displayAspect)

        console.log('Video setup complete:', {
          videoWidth: safeWidth,
          videoHeight: safeHeight,
          canvasWidth: geometry.canvasWidth,
          canvasHeight: geometry.canvasHeight,
          rotateForPortrait,
          targetAspect: geometry.aspect
        })
        setIsLoading(false)
      }
      
    } catch (error) {
      console.error('Error starting video:', error)
      setDidInitVideo(false)
      setIsLoading(false)
      
      // Show user-friendly error message
      let errorMessage = 'Error mengakses kamera: '
      if (error.name === 'NotAllowedError') {
        errorMessage += 'Izin kamera ditolak. Silakan izinkan akses kamera dan refresh halaman.'
      } else if (error.name === 'NotFoundError') {
        errorMessage += 'Kamera tidak ditemukan. Pastikan kamera terhubung.'
      } else if (error.name === 'NotSupportedError') {
        errorMessage += 'Browser tidak mendukung akses kamera.'
      } else {
        errorMessage += error.message
      }
      
      setCameraError(errorMessage)
    }
  }
  const startCountdown = () => {
    if (isLoading || countdown > 0) return
    
    setCountdown(3)
    const countdownInterval = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(countdownInterval)
          takePhoto()
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }
  const takePhoto = async () => {
    if (isLoading) return
    
    const video = videoRef.current
    const {videoWidth, videoHeight} = video
    const geometry = computeCaptureGeometry(videoWidth, videoHeight, {
      portrait: isPortraitCapture,
      rotate: shouldRotateVideo
    })

    const {
      canvasWidth,
      canvasHeight,
      sourceWidth,
      sourceHeight,
      sourceX,
      sourceY
    } = geometry

    canvas.width = Math.max(1, Math.round(canvasWidth))
    canvas.height = Math.max(1, Math.round(canvasHeight))
    setIsLoading(true)
    setLastPhotoMeta(null)
    
    try {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      if (shouldRotateVideo) {
        ctx.translate(canvas.width, 0)
        ctx.rotate(Math.PI / 2)
        ctx.scale(-1, 1)
        ctx.drawImage(
          video,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          0,
          0,
          canvas.height,
          canvas.width
        )
      } else {
        ctx.scale(-1, 1)
        ctx.drawImage(
          video,
          sourceX,
          sourceY,
          sourceWidth,
          sourceHeight,
          -canvas.width,
          0,
          canvas.width,
          canvas.height
        )
      }
      ctx.restore()
      
      const aspect =
        canvas.height > 0
          ? canvas.width / canvas.height
          : isPortraitCapture
            ? PORTRAIT_ASPECT
            : LANDSCAPE_ASPECT
      setLastPhotoMeta({
        width: canvas.width,
        height: canvas.height,
        aspect,
        orientation: canvas.height >= canvas.width ? 'portrait' : 'landscape'
      })
      const photoData = canvas.toDataURL('image/jpeg', 0.95)
      setLastPhoto(photoData)
      setCurrentPhotoId(null)
      setShowPreview(true)
      setDidJustSnap(true)
      setTimeout(() => setDidJustSnap(false), 1000)
    } catch (error) {
      console.error('Error taking photo:', error)
      setCameraError('Gagal mengambil foto. Silakan coba lagi.')
    } finally {
      setIsLoading(false)
    }
  }
  const uploadToFTP = async (imageUrl, filename) => {
    console.log('📤 Starting FTP upload for:', filename)
    console.log('🔍 Image URL type:', imageUrl.startsWith('data:') ? 'Base64' : 'URL')
    
    try {
      // Convert base64 to blob
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      console.log('📦 Blob created, size:', blob.size)
      
      // Upload ke FTP server
      const formData = new FormData()
      formData.append('file', blob, filename)
      formData.append('name', filename)
      
      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      
      console.log('📡 FTP server response status:', uploadResponse.status)
      
      if (uploadResponse.ok) {
        const result = await uploadResponse.json()
        if (result.success && result.directLink) {
          console.log('✅ FTP upload successful:', result.directLink)
          return {
            url: result.directLink,
            qrCode: result.qrCode
          }
        }
      }
      
      throw new Error('FTP upload failed')
    } catch (error) {
      console.error('Error uploading to FTP:', error)
      throw error
    }
  }
  const generateQRCodeFor = async (imageUrl, filename = null, cacheKey = null) => {
    console.log('🧾 generateQRCodeFor called:', {filename, cacheKey})
    console.log('🌐 Image URL for QR:', imageUrl)
    
    const defaultFilename = filename || `digioh-photobooth-${Date.now()}.jpg`
    
    try {
      const uploadResult = await uploadToFTP(imageUrl, defaultFilename)
      let qrCodeDataURL = uploadResult.qrCode
      
      if (!qrCodeDataURL) {
        qrCodeDataURL = await QRCode.toDataURL(uploadResult.url, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        })
      }
      
      if (cacheKey) {
        setCloudUrls(prev => ({
          ...prev,
          [cacheKey]: uploadResult.url
        }))
      }
      
      return {
        qrCode: qrCodeDataURL,
        directUrl: uploadResult.url
      }
    } catch (error) {
      console.error('Error generating QR code:', error)
      try {
        const qrCodeDataURL = await QRCode.toDataURL(imageUrl, {
          width: 300,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        })
        
        if (cacheKey) {
          setCloudUrls(prev => ({
            ...prev,
            [cacheKey]: imageUrl
          }))
        }
        
        console.log('✅ QR Code generated with direct image URL fallback')
        
        return {
          qrCode: qrCodeDataURL,
          directUrl: imageUrl
        }
      } catch (fallbackError) {
        console.error('Fallback QR generation failed:', fallbackError)
        throw fallbackError
      }
    }
  }
  const retakePhoto = () => {
    // Bersihkan data global (store, imageData, gif)
    uploadTokenRef.current += 1
    resetSession()
    
    // Reset state lokal untuk user experience yang bersih
    setCloudUrls({})
    setQrCodes({photo: null, gif: null})
    setShowDownloadModal(false)
    setCurrentPage('camera')
    setCurrentPhotoId(null)
    setShowPreview(false)
    setIsProcessingPhoto(false)
    setPreparedDownloads({})
    setFocusedId(null)
    setLastPhoto(null)
    setLastPhotoMeta(null)
    setDidJustSnap(false)
    setCountdown(0)
    setIsUploading(false)
    setShowMobileModeSelector(false)
    setShowDesktopModeSelector(false)
    
    // Reset ke tampilan awal (start screen) 
    setVideoActive(false)
    setDidInitVideo(false)
    setCameraError(null)
    setIsLoading(false)
    
    // Stop video stream jika ada
    if (videoRef.current && videoRef.current.srcObject) {
      const tracks = videoRef.current.srcObject.getTracks()
      tracks.forEach(track => track.stop())
      videoRef.current.srcObject = null
    }
    
    console.log('🔄 Reset aplikasi untuk user berikutnya')
  }
  const prepareDownloadsForPhoto = useCallback(
    async (photoId, {force = false} = {}) => {
      if (!photoId) {
        return false
      }

      const previousStatus = preparedDownloads[photoId]

      if (!force) {
        if (previousStatus === true) {
          return true
        }

        if (previousStatus === 'error') {
          return false
        }
      }

      if (isUploading) {
        return false
      }

      const targetPhoto = photos.find(photo => photo.id === photoId)
      if (!targetPhoto || targetPhoto.isBusy) {
        return false
      }

      const photoData = imageData.outputs[photoId]
      if (!photoData) {
        return false
      }

      const photoReady = !!(qrCodes.photo && cloudUrls[photoId])
      const gifReady = !!(qrCodes.gif && cloudUrls.gif)

      if (photoReady && gifReady && !force) {
        setPreparedDownloads(prev => ({
          ...prev,
          [photoId]: true
        }))
        return true
      }

      const token = uploadTokenRef.current + 1
      uploadTokenRef.current = token
      setIsUploading(true)

      try {
        let ensuredGifUrl = gifUrl

        if (!ensuredGifUrl) {
          ensuredGifUrl = await makeGif()
        }

        if (!ensuredGifUrl) {
          throw new Error('GIF is not available after generation')
        }

        if (uploadTokenRef.current !== token) {
          return false
        }

        const photoResult = photoReady
          ? {qrCode: qrCodes.photo, directUrl: cloudUrls[photoId]}
          : await generateQRCodeFor(
              photoData,
              `digioh-photobooth-foto-${Date.now()}.jpg`,
              photoId
            )

        if (uploadTokenRef.current !== token) {
          return false
        }

        const gifResult = gifReady
          ? {qrCode: qrCodes.gif, directUrl: cloudUrls.gif}
          : await generateQRCodeFor(
              ensuredGifUrl,
              `digioh-photobooth-gif-${Date.now()}.gif`,
              'gif'
            )

        if (!photoResult?.qrCode || !gifResult?.qrCode) {
          throw new Error('QR code generation incomplete')
        }

        if (uploadTokenRef.current !== token) {
          return false
        }

        setQrCodes({
          photo: photoResult.qrCode,
          gif: gifResult.qrCode
        })

        setPreparedDownloads(prev => ({
          ...prev,
          [photoId]: true
        }))

        return true
      } catch (error) {
        console.error('Error preparing downloads:', error)
        if (uploadTokenRef.current === token) {
          setPreparedDownloads(prev => ({
            ...prev,
            [photoId]: 'error'
          }))
        }
        return false
      } finally {
        if (uploadTokenRef.current === token) {
          setIsUploading(false)
        }
      }
    },
    [
      cloudUrls,
      generateQRCodeFor,
      makeGif,
      gifUrl,
      isUploading,
      photos,
      preparedDownloads,
      qrCodes
    ]
  )
  useEffect(() => {
    if (!currentPhotoId) {
      return
    }

    const preparationStatus = preparedDownloads[currentPhotoId]

    if (preparationStatus === true || preparationStatus === 'error') {
      return
    }

    if (isUploading) {
      return
    }

    const currentPhoto = photos.find(photo => photo.id === currentPhotoId)
    if (!currentPhoto || currentPhoto.isBusy) {
      return
    }

    if (!imageData.outputs[currentPhotoId]) {
      return
    }

    prepareDownloadsForPhoto(currentPhotoId)
  }, [
    currentPhotoId,
    isUploading,
    photos,
    preparedDownloads,
    prepareDownloadsForPhoto
  ])
  const proceedToResults = async () => {
    if (isProcessingPhoto) {
      return
    }
    if (!lastPhoto) {
      alert('? Foto tidak tersedia. Silakan ambil foto terlebih dahulu.')
      return
    }
    if (!lastPhotoMeta) {
      alert('? Data foto belum lengkap. Silakan ambil foto terlebih dahulu.')
      return
    }

    setIsProcessingPhoto(true)
    setShowPreview(false)

    try {
      const photoId = await snapPhoto(lastPhoto, lastPhotoMeta)
      if (photoId) {
        setCurrentPhotoId(photoId)
        setCurrentPage('results')
      } else {
        throw new Error('ID foto tidak tersedia')
      }
    } catch (error) {
      console.error('Error processing photo with AI:', error)
      alert('? Gagal memproses foto. Silakan coba lagi.')
      setShowPreview(true)
    } finally {
      setIsProcessingPhoto(false)
    }
  }
  const handleDownloadClick = async () => {
    if (isUploading) {
      alert('? Sedang menyiapkan file. Mohon tunggu sebentar...')
      return
    }

    if (!currentPhotoId) {
      alert('? Foto tidak tersedia. Silakan ambil foto terlebih dahulu.')
      return
    }

    const currentPhoto = photos.find(p => p.id === currentPhotoId)
    if (!currentPhoto || currentPhoto.isBusy) {
      alert('? Foto masih dipoles AI. Tunggu sejenak ya!')
      return
    }

    if (gifInProgress) {
      alert('? GIF masih dibuat. Coba lagi setelah selesai.')
      return
    }

    if (!qrCodes.photo || !qrCodes.gif) {
      const prepared = await prepareDownloadsForPhoto(currentPhotoId, {force: true})
      if (!prepared) {
        alert('? Hasil belum siap. Mohon tunggu sebentar lalu coba lagi.')
        return
      }
    }

    setShowDownloadModal(true)
  }
  const handleModeHover = useCallback((modeInfo, event) => {
    if (!modeInfo) {
      setHoveredMode(null)
      return
    }
    setHoveredMode(modeInfo)
    const rect = event.currentTarget.getBoundingClientRect()
    const tooltipTop = rect.top
    const tooltipLeft = rect.left + rect.width / 2
    setTooltipPosition({
      top: tooltipTop,
      left: tooltipLeft
    })
  }, [])
  // Tidak ada auto-start video - user harus klik tombol "Mari Berfoto!" dulu
  
  console.log('🖥️ Rendering JSX now...')
  console.log('🧠 Current state:', {
    currentPage,
    videoActive,
    showPreview,
    currentPhotoId,
    photosCount: photos.length
  })
  const currentPhoto = currentPhotoId
    ? photos.find(photo => photo.id === currentPhotoId)
    : null
  const aiPhotoSrc = currentPhotoId
    ? (watermarkedOutputs[currentPhotoId] || imageData.outputs[currentPhotoId] || null)
    : null
  const renderResultSection = section => {
    const isAi = section === 'ai'
    const heading = isAi ? '✨ Hasil AI' : '🎞️ GIF'
    const isBusy = isAi ? currentPhoto?.isBusy : gifInProgress || !gifUrl
    const src = isAi
      ? aiPhotoSrc || (currentPhotoId ? imageData.outputs[currentPhotoId] : null)
      : gifUrl
    const alt = isAi ? 'Hasil AI' : 'Hasil GIF'
    const placeholderText = isAi ? 'Sedang memproses...' : 'GIF sedang diproses...'
    return (
      <div className="photoSide" key={section}>
        <h3>{heading}</h3>
        {isBusy || !src ? (
          <div className="loadingPlaceholder">
            <div className="spinner"></div>
            <p>{placeholderText}</p>
          </div>
        ) : (
          <img src={src} alt={alt} />
        )}
      </div>
    )
  }
  // Test render dulu
  console.log('↩️ About to return JSX...')
  return (
    <>
      {/* Header dengan Logo dan Nama Aplikasi */}
      <header className="appHeader">
        <div className="logoContainer">
          <img src="/DIGIOH_Logomark.svg" alt="digiSelfie AI" className="appLogo" />
          <h1 className="appTitle">digiSelfie AI</h1>
        </div>
      </header>
      <main>
        {/* Navigation Header */}
        {currentPage === 'results' && (
          <div className="pageHeader">
            <button 
              className="backButton"
              onClick={retakePhoto}
            >
              <span className="icon">arrow_back</span>
              Kembali ke Kamera
            </button>
            <h2 className="pageTitle">? Hasil Foto Anda</h2>
          </div>
        )}
        {showCustomPrompt && (
        <div className="customPrompt" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowCustomPrompt(false)
          }
        }}>
          <div className="modalContent">
            <div className="modalHeader">
              <h2 className="modalTitle">Custom AI Prompt</h2>
              <button
                className="closeBtn"
                onClick={() => setShowCustomPrompt(false)}
                type="button"
              >
                <span className="icon">close</span>
              </button>
            </div>
            
            <div className="modalBody">
              <p style={{marginBottom: '15px', color: 'rgba(255, 255, 255, 0.8)', fontSize: '14px'}}>
                Describe the art style or effect you want for your photos. Be creative and specific!
              </p>
              
              <textarea
                placeholder="e.g., 'cyberpunk style, neon lights, futuristic city, dramatic lighting'"
                value={customPrompt}
                onChange={e => setCustomPrompt(e.target.value)}
                autoFocus
              />
              
              <div style={{marginTop: '15px', fontSize: '12px', color: 'rgba(255, 255, 255, 0.6)'}}>
                <p>💡 <strong>Tips:</strong></p>
                <ul style={{margin: '8px 0', paddingLeft: '20px'}}>
                  <li>Be specific about colors, lighting, and mood</li>
                  <li>Mention art styles like "oil painting", "watercolor", "digital art"</li>
                  <li>Include details about the setting or background</li>
            </ul>
        </div>
      </div>
            
            <div className="modalFooter">
              <button
                className="btn btnSecondary"
                onClick={() => {
                  setShowCustomPrompt(false)
                  if (customPrompt.trim().length === 0) {
                    setMode(modeKeys[0])
                  }
                }}
              >
                Cancel
              </button>
              <button
                className="btn btnPrimary"
                onClick={() => {
                  setShowCustomPrompt(false)
                }}
                disabled={!customPrompt.trim()}
              >
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Preview Modal - Foto Asli dengan Pilihan Retake/Lanjut */}
      {showPreview && lastPhoto && (
        <div className="previewModal" onClick={(e) => {
          if (e.target === e.currentTarget) {
            // Don't close on background click, force user to choose
          }
        }}>
          <div className="previewContent">
            <div className="previewHeader">
              <h2 className="previewTitle">📸 Foto Anda!</h2>
              <p className="previewSubtitle">Bagaimana hasilnya? Pilih aksi selanjutnya</p>
            </div>
            
            <div className="previewBody">
              <div className="photoPreview">
                <img src={lastPhoto} alt="Foto Anda" className="previewImage" />
                <img
                  src={WATERMARK_OVERLAY_SRC}
                  alt=""
                  className="watermarkOverlay previewWatermark"
                  aria-hidden="true"
                />
                <div className="photoOverlay">
                  <div className="photoStatus">
                    {(isProcessingPhoto || photos.find(p => p.id === currentPhotoId)?.isBusy) ? (
                      <div className="processingStatus">
                        <div className="spinner"></div>
                        <p>AI sedang memproses foto...</p>
                      </div>
                    ) : (
                      <div className="readyStatus">
                        <span className="icon">check_circle</span>
                        <p>Foto siap diproses!</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="previewActions">
                <button 
                  className="btn btnSecondary"
                  onClick={retakePhoto}
                  disabled={isProcessingPhoto}
                >
                  <span className="icon">refresh</span>
                  Retake
                </button>
                <button 
                  className="btn btnPrimary"
                  onClick={proceedToResults}
                  disabled={isProcessingPhoto}
                >
                  <span className="icon">
                    {isProcessingPhoto ? 'autorenew' : 'arrow_forward'}
                  </span>
                  {isProcessingPhoto ? 'Memproses...' : 'Lanjut'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {isProcessingPhoto && (
        <div className="aiProcessingOverlay" role="alert" aria-live="assertive">
          <div className="aiProcessingCard">
            <div className="aiProcessingSpinner">
              <span className="dot dot-1"></span>
              <span className="dot dot-2"></span>
              <span className="dot dot-3"></span>
            </div>
            <h3 className="aiProcessingTitle">AI lagi memoles fotomu</h3>
            <p className="aiProcessingSubtitle">
              Pegang dulu posenya ya… hasil kece bakal muncul sebentar lagi!
            </p>
          </div>
        </div>
      )}
      {/* Countdown Overlay */}
      {countdown > 0 && (
        <div className="countdownOverlay" aria-live="assertive">
          <div className="countdownCircle">{countdown}</div>
        </div>
      )}
      {/* Camera Page */}
      {currentPage === 'camera' && (
        <>
          {/* Canvas 1: Kamera */}
          <div
            className={c('camera', {portraitMode: isPortraitCapture})}
            style={cameraStyle}

            onClick={() => {
              hideGif()
              setFocusedId(null)
            }}
          >
            {/* Mode Selector Overlay di dalam Camera */}
            <div className="cameraModeSelector">
              <div className="cameraModeHeader">
                <h3 className="cameraModeTitle">🎨 Pilih Mode Foto</h3>
                <button 
                  className="cameraModeToggle"
                  onClick={(e) => {
                    e.stopPropagation()
                    setShowDesktopModeSelector(!showDesktopModeSelector)
                  }}
                >
                  <span className="icon">palette</span>
                  <span>{modes[activeMode]?.name || 'Custom'}</span>
                  <span className="icon">{showDesktopModeSelector ? 'expand_less' : 'expand_more'}</span>
                </button>
              </div>
              
              {/* Mode Grid - Always Visible */}
              {showDesktopModeSelector && (
                <div className="cameraModeGrid">
                  <button
                    key="custom"
                    className={c('cameraModeButton', {active: activeMode === 'custom'})}
                    onMouseEnter={e =>
                      handleModeHover({key: 'custom', prompt: customPrompt}, e)
                    }
                    onMouseLeave={() => handleModeHover(null)}
                    onClick={(e) => {
                      e.stopPropagation()
                      setMode('custom')
                      setShowCustomPrompt(true)
                    }}
                  >
                    <span>✨</span> 
                    <p>Custom</p>
                  </button>
                  {Object.entries(modes).map(([key, {name, emoji, prompt}]) => (
                    <button
                      key={key}
                      className={c('cameraModeButton', {active: key === activeMode})}
                      onMouseEnter={e => handleModeHover({key, prompt}, e)}
                      onMouseLeave={() => handleModeHover(null)}
                      onClick={(e) => {
                        e.stopPropagation()
                        setMode(key)
                      }}
                    >
                      <span>{emoji}</span> 
                      <p>{name}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
        <div className={c('cameraPreview', {portraitMode: shouldRotateVideo})}>
          <video
            ref={videoRef}
            muted
            autoPlay
            playsInline
            disablePictureInPicture={true}
          />
          {videoActive && (
            <img
              src={WATERMARK_OVERLAY_SRC}
              alt=""
              className="watermarkOverlay cameraWatermark"
              aria-hidden="true"
            />
          )}
          {didJustSnap && <div className="flash" />}
        </div>
        {!videoActive && (
          <button className="startButton" onClick={startVideo} disabled={isLoading}>
            <div style={{display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px'}}>
              <span style={{fontSize: '2rem'}}>📸</span>
              <h1>Mari Berfoto!</h1>
            </div>
            <p>
              {isLoading ? '✨ Siapkan gaya Anda...' : 
               didInitVideo ? '⌛ Tunggu sebentar...' : 
               'Klik untuk mulai berfoto! 📸'}
            </p>
            
            {cameraError && (
              <div style={{
                marginTop: '15px',
                padding: '12px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: '8px',
                color: '#fca5a5',
                fontSize: '14px'
              }}>
                <p style={{margin: 0, fontWeight: '600'}}>⚠️ Error Kamera</p>
                <p style={{margin: '4px 0 0 0', fontSize: '12px'}}>{cameraError}</p>
                <button 
                  onClick={(e) => {
                    e.stopPropagation()
                    setCameraError(null)
                    startVideo()
                  }}
                  style={{
                    marginTop: '8px',
                    padding: '6px 12px',
                    background: 'rgba(239, 68, 68, 0.2)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: '4px',
                    color: '#fff',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Coba Lagi
                </button>
              </div>
            )}
          </button>
        )}
        {videoActive && (
          <div className="videoControls">
            <button 
              onClick={startCountdown} 
              className="shutter"
              disabled={isLoading || countdown > 0}
              style={{opacity: (isLoading || countdown > 0) ? 0.6 : 1}}
            >
              <span className="icon">
                {isLoading ? 'hourglass_empty' : countdown > 0 ? countdown : 'camera'}
              </span>
            </button>
            
            
            {isLoading && (
              <div style={{
                position: 'absolute',
                bottom: '-40px',
                left: '50%',
                transform: 'translateX(-50%)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '5px'
              }}>
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid rgba(255, 255, 255, 0.3)',
                  borderTop: '2px solid #6366f1',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }}></div>
                <p style={{
                  fontSize: '12px',
                  color: 'rgba(255, 255, 255, 0.8)',
                  margin: 0,
                  textAlign: 'center'
                }}>
                  Sedang memproses...
                </p>
              </div>
            )}
          </div>
        )}
          </div>
          {/* Mobile Mode Selector - Hidden on Desktop */}
          <div className="mobileModeContainer">
            <button 
              className="mobileModeToggle"
              onClick={() => setShowMobileModeSelector(!showMobileModeSelector)}
            >
              <span className="icon">palette</span>
              <span>🎨 {modes[activeMode]?.name || 'Custom'}</span>
              <span className="icon">{showMobileModeSelector ? 'expand_less' : 'expand_more'}</span>
            </button>
            
            {/* Mobile Mode Selector Dropdown */}
            {showMobileModeSelector && (
              <div className="mobileModeSelector">
                <button 
                  className="mobileModeClose"
                  onClick={() => setShowMobileModeSelector(false)}
                >
                  <span className="icon">close</span>
                </button>
                <div className="mobileModeGrid">
                  <button
                    key="custom"
                    className={c('mobileModeButton', {active: activeMode === 'custom'})}
                    onClick={() => {
                      setMode('custom')
                      setShowCustomPrompt(true)
                      setShowMobileModeSelector(false)
                    }}
                  >
                    <span>✨</span> 
                    <span>Custom</span>
                  </button>
                  {Object.entries(modes).map(([key, {name, emoji, prompt}]) => (
                    <button
                      key={key}
                      className={c('mobileModeButton', {active: key === activeMode})}
                      onClick={() => {
                        setMode(key)
                        setShowMobileModeSelector(false)
                      }}
                    >
                      <span>{emoji}</span> 
                      <span>{name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </>
      )}
      {/* Results Page */}
      {currentPage === 'results' && currentPhotoId && (
        <div className="resultsPage">
          <div className="photoResult">
            <div className={c('photoComparison', {isMobileResults})}>
              {isMobileResults ? (
                <>
                  <div className="resultTabs" role="tablist" aria-label="Hasil foto dan GIF">
                    {RESULT_TAB_OPTIONS.map(({key, label, icon}) => {
                      const isActive = activeResultTab === key
                      const isAi = key === 'ai'
                      const isBusy = isAi ? currentPhoto?.isBusy : gifInProgress || !gifUrl
                      return (
                        <button
                          key={key}
                          type="button"
                          id={`result-tab-${key}`}
                          className={c('resultTabButton', {active: isActive})}
                          onClick={() => setActiveResultTab(key)}
                          role="tab"
                          aria-selected={isActive}
                          aria-controls="result-panel"
                          tabIndex={isActive ? 0 : -1}
                        >
                          <span className="icon">{icon}</span>
                          <span className="resultTabLabel">{label}</span>
                          {isBusy && <span className="resultTabStatus">Loading</span>}
                        </button>
                      )
                    })}
                  </div>
                  <div
                    className="resultPanel"
                    role="tabpanel"
                    id="result-panel"
                    aria-labelledby={`result-tab-${activeResultTab}`}
                  >
                    {renderResultSection(activeResultTab)}
                  </div>
                </>
              ) : (
                <>
                  {renderResultSection('ai')}
                  {renderResultSection('gif')}
                </>
              )}
            </div>
            {/* 3 Tombol Utama: Download GIF | Download Foto | Selesai */}
            <div className="resultsActions">
              <button 
                className="btn btnPrimary"
                onClick={handleDownloadClick}
                disabled={isUploading || photos.find(p => p.id === currentPhotoId)?.isBusy || gifInProgress}
                style={{
                  fontSize: '16px',
                  padding: '15px 25px',
                  minWidth: '180px',
                  background: 'linear-gradient(135deg, #f59e0b, #f97316)'
                }}
              >
                <span className="icon">
                  {isUploading ? 'hourglass_empty' : 'download'}
                </span>
                Download
              </button>
              
              <button 
                className="btn btnSecondary"
                onClick={retakePhoto}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  minWidth: '160px',
                  fontSize: '16px',
                  padding: '15px 25px'
                }}
              >
                <span className="icon">check</span>
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}
      {showDownloadModal && (
        <div className="qrModal" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowDownloadModal(false)
          }
        }}>
          <div className="qrContent">
            <div className="qrHeader">
              <h2 className="qrTitle" >Scan QR untuk Download</h2>
            </div>
            <div className="qrBody">
              <div className="qrTabs" role="tablist" aria-label="QR download options">
                {QR_TAB_OPTIONS.map(({key, label, icon}) => {
                  const isActive = activeQrTab === key
                  const isReady = Boolean(qrCodes[key])
                  return (
                    <button
                      key={key}
                      type="button"
                      id={`qr-tab-${key}`}
                      className={c('qrTabButton', {active: isActive, ready: isReady})}
                      onClick={() => setActiveQrTab(key)}
                      role="tab"
                      aria-selected={isActive}
                      aria-controls="qr-download-panel"
                      tabIndex={isActive ? 0 : -1}
                    >
                      <span className="icon">{icon}</span>
                      <span className="qrTabLabel">{label}</span>
                      {!isReady && <span className="qrTabStatus">Loading</span>}
                    </button>
                  )
                })}
              </div>
              <div
                className="qrCard"
                role="tabpanel"
                id="qr-download-panel"
                aria-labelledby={`qr-tab-${activeQrTab}`}
              >
                <h3 className="qrCardTitle">
                  {activeQrTab === 'photo' ? 'QR Foto' : 'QR GIF'}
                </h3>
                {qrCodes[activeQrTab] ? (
                  <img
                    src={qrCodes[activeQrTab]}
                    alt={activeQrTab === 'photo' ? 'QR Foto' : 'QR GIF'}
                    className="qrCodeImage"
                  />
                ) : (
                  <div className="qrPlaceholder">
                    <div className="spinner"></div>
                    <p className="qrPlaceholderText">
                      {activeQrTab === 'photo'
                        ? 'Menyiapkan QR untuk foto...'
                        : 'Menyiapkan QR untuk GIF...'}
                    </p>
                  </div>
                )}
              </div>
            </div>
            <div className="qrActions">
              <button 
                className="btn btnSecondary"
                onClick={() => setShowDownloadModal(false)}
              >
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Desktop Mode Selector Overlay - Full Page */}
      {showDesktopModeSelector && (
        <div className="desktopModeOverlay" onClick={(e) => {
          if (e.target === e.currentTarget) {
            setShowDesktopModeSelector(false)
          }
        }}>
          <div className="desktopModeContent">
            <div className="desktopModeHeader">
              <h2 className="desktopModeTitle">🎨 Pilih Mode Foto</h2>
            </div>
            
            <div className="desktopModeGrid">
              <button
                key="custom"
                className={c('desktopModeButton', {active: activeMode === 'custom'})}
                onMouseEnter={e =>
                  handleModeHover({key: 'custom', prompt: customPrompt}, e)
                }
                onMouseLeave={() => handleModeHover(null)}
                onClick={() => {
                  setMode('custom')
                  setShowCustomPrompt(true)
                  setShowDesktopModeSelector(false)
                }}
              >
                <span>✨</span> 
                <p>Custom</p>
              </button>
              {Object.entries(modes).map(([key, {name, emoji, prompt}]) => (
                <button
                  key={key}
                  className={c('desktopModeButton', {active: key === activeMode})}
                  onMouseEnter={e => handleModeHover({key, prompt}, e)}
                  onMouseLeave={() => handleModeHover(null)}
                  onClick={() => {
                    setMode(key)
                    setShowDesktopModeSelector(false)
                  }}
                >
                  <span>{emoji}</span> 
                  <p>{name}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {hoveredMode && (
        <div
          className={c('tooltip', {isFirst: hoveredMode.key === 'custom'})}
          role="tooltip"
          style={{
            top: tooltipPosition.top,
            left: tooltipPosition.left,
            transform: 'translateX(-50%)'
          }}
        >
          {hoveredMode.key === 'custom' && !hoveredMode.prompt.length ? (
            <div style={{textAlign: 'center'}}>
              <p style={{marginBottom: '8px'}}>💡 Click to set a custom prompt</p>
              <p style={{fontSize: '11px', opacity: 0.7}}>Create your own AI art style</p>
            </div>
          ) : (
            <>
              <p style={{marginBottom: '8px', fontStyle: 'italic'}}>"{hoveredMode.prompt}"</p>
              <h4>AI Prompt</h4>
            </>
          )}
        </div>
      )}
      </main>
    </>
  )
}


