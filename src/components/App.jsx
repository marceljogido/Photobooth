/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import React, {useRef, useState, useCallback, useEffect} from 'react'
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
    console.log('🔄 Attempting to load store...')
    photos = useStore.use.photos()
    customPrompt = useStore.use.customPrompt()
    activeMode = useStore.use.activeMode()
    gifInProgress = useStore.use.gifInProgress()
    gifUrl = useStore.use.gifUrl()
    console.log('✅ Store state loaded:', { 
      photosCount: photos.length, 
      activeMode, 
      customPromptLength: customPrompt.length 
    })
  } catch (error) {
    console.error('❌ Error loading store:', error)
    // Fallback values
    photos = []
    customPrompt = ''
    activeMode = 'renaissance'
    gifInProgress = false
    gifUrl = null
    console.log('🔄 Using fallback values')
  }
  
  console.log('🎨 About to render App component...')
  
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
  const [lastPhoto, setLastPhoto] = useState(null)
  const [qrCodes, setQrCodes] = useState({photo: null, gif: null})
  const [isUploading, setIsUploading] = useState(false)
  const [showDownloadModal, setShowDownloadModal] = useState(false)
  const [currentPage, setCurrentPage] = useState('camera') // 'camera' or 'results'
  const [currentPhotoId, setCurrentPhotoId] = useState(null)
  const [showMobileModeSelector, setShowMobileModeSelector] = useState(false)
  const [showDesktopModeSelector, setShowDesktopModeSelector] = useState(false)
  const [cloudUrls, setCloudUrls] = useState({}) // Store cloud URLs for photos
  const [watermarkedOutputs, setWatermarkedOutputs] = useState({})
  const watermarkedOutputsRef = useRef({})
  useEffect(() => {
    watermarkedOutputsRef.current = watermarkedOutputs
  }, [watermarkedOutputs])
  
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
  
  const videoRef = useRef(null)
  // Auto-create GIF when there are ready photos and no GIF yet
  useEffect(() => {
    try {
      const readyCount = photos.filter(p => !p.isBusy).length
      if (readyCount > 0 && !gifInProgress && !gifUrl) {
        console.log('🎬 Auto-creating GIF because photos are ready...')
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
      
      // Try different video constraints
      let stream
      try {
        // Try with high resolution first
        stream = await navigator.mediaDevices.getUserMedia({
          video: {width: {ideal: 1920}, height: {ideal: 1080}},
          audio: false,
          facingMode: {ideal: 'user'}
        })
      } catch (error) {
        console.log('High resolution failed, trying medium...')
        // Try with medium resolution
        stream = await navigator.mediaDevices.getUserMedia({
          video: {width: {ideal: 1280}, height: {ideal: 720}},
          audio: false,
          facingMode: {ideal: 'user'}
        })
      }
      
      console.log('Video stream obtained:', stream)
      setVideoActive(true)
      videoRef.current.srcObject = stream
      // Wait for video to load
      videoRef.current.onloadedmetadata = () => {
        const {videoWidth, videoHeight} = videoRef.current
        const squareSize = Math.min(videoWidth, videoHeight)
        canvas.width = squareSize
        canvas.height = squareSize
        console.log('Video setup complete:', {videoWidth, videoHeight, squareSize})
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
    const squareSize = canvas.width
    const sourceSize = Math.min(videoWidth, videoHeight)
    const sourceX = (videoWidth - sourceSize) / 2
    const sourceY = (videoHeight - sourceSize) / 2
    setIsLoading(true)
    
    try {
      ctx.clearRect(0, 0, squareSize, squareSize)
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.scale(-1, 1)
      ctx.drawImage(
        video,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        -squareSize,
        0,
        squareSize,
        squareSize
      )
      
      const photoData = canvas.toDataURL('image/jpeg')
      const photoId = await snapPhoto(photoData)
      setLastPhoto(photoData)
      setCurrentPhotoId(photoId)
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
    console.log('🔄 Starting FTP upload for:', filename)
    console.log('📷 Image URL type:', imageUrl.startsWith('data:') ? 'Base64' : 'URL')
    
    try {
      // Convert base64 to blob
      const response = await fetch(imageUrl)
      const blob = await response.blob()
      console.log('📁 Blob created, size:', blob.size)
      
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
    console.log('🔄 generateQRCodeFor called:', {filename, cacheKey})
    console.log('📷 Image URL for QR:', imageUrl)
    
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
        
        console.log('⚠️ QR Code generated with direct image URL fallback')
        
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
    resetSession()
    
    // Reset state lokal untuk user experience yang bersih
    setCloudUrls({})
    setQrCodes({photo: null, gif: null})
    setShowDownloadModal(false)
    setCurrentPage('camera')
    setCurrentPhotoId(null)
    setShowPreview(false)
    setFocusedId(null)
    setLastPhoto(null)
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
  const proceedToResults = () => {
    setCurrentPage('results')
    setShowPreview(false)
  }
  const handleDownloadClick = async () => {
    if (isUploading) {
      return
    }
    
    if (!currentPhotoId) {
      alert('❌ Foto tidak tersedia. Silakan ambil foto terlebih dahulu.')
      return
    }
    
    const currentPhoto = photos.find(p => p.id === currentPhotoId)
    if (!currentPhoto || currentPhoto.isBusy) {
      alert('⏳ Foto atau GIF masih diproses. Silakan tunggu sebentar.')
      return
    }
    
    if (gifInProgress) {
      alert('⏳ GIF sedang diproses. Silakan coba lagi setelah selesai.')
      return
    }
    
    if (qrCodes.photo && qrCodes.gif) {
      setShowDownloadModal(true)
      return
    }
    
    const photoData = imageData.outputs[currentPhotoId]
    if (!photoData) {
      alert('❌ Foto AI belum tersedia. Silakan tunggu sebentar.')
      return
    }
    
    setIsUploading(true)
    
    try {
      let ensuredGifUrl = gifUrl
      if (!ensuredGifUrl) {
        ensuredGifUrl = await makeGif()
      }
      
      if (!ensuredGifUrl) {
        throw new Error('GIF is not available after generation')
      }
      
      const photoResult = await generateQRCodeFor(
        photoData,
        `digioh-photobooth-foto-${Date.now()}.jpg`,
        currentPhotoId
      )
      
      const gifResult = await generateQRCodeFor(
        ensuredGifUrl,
        `digioh-photobooth-gif-${Date.now()}.gif`,
        'gif'
      )
      
      if (!photoResult?.qrCode) {
        throw new Error('Photo QR missing')
      }
      if (!gifResult?.qrCode) {
        throw new Error('GIF QR missing')
      }
      
      setQrCodes({
        photo: photoResult?.qrCode || null,
        gif: gifResult?.qrCode || null
      })
      setShowDownloadModal(true)
    } catch (error) {
      console.error('❌ Failed preparing QR codes:', error)
      alert('❌ Gagal menyiapkan QR download. Silakan coba lagi.')
    } finally {
      setIsUploading(false)
    }
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
  
  console.log('🎨 Rendering JSX now...')
  console.log('📊 Current state:', {
    currentPage,
    videoActive,
    showPreview,
    currentPhotoId,
    photosCount: photos.length
  })
  const aiPhotoSrc = currentPhotoId
    ? (watermarkedOutputs[currentPhotoId] || imageData.outputs[currentPhotoId] || null)
    : null
  // Test render dulu
  console.log('🎨 About to return JSX...')
  return (
    <>
      {/* Header dengan Logo dan Nama Aplikasi */}
      <header className="appHeader">
        <div className="logoContainer">
          <div className="cameraIcon">📷</div>
          <h1 className="appTitle">DigiOH Photobooth</h1>
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
            <h2 className="pageTitle">✨ Hasil Foto Anda</h2>
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
                onClick={() => {
                  setShowCustomPrompt(false)
                  if (customPrompt.trim().length === 0) {
                    setMode(modeKeys[0])
                  }
                }}
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
                    {photos.find(p => p.id === currentPhotoId)?.isBusy ? (
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
                >
                  <span className="icon">refresh</span>
                  Retake
                </button>
                <button 
                  className="btn btnPrimary"
                  onClick={proceedToResults}
                  disabled={photos.find(p => p.id === currentPhotoId)?.isBusy}
                >
                  <span className="icon">arrow_forward</span>
                  Lanjut
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Full Screen Countdown Overlay */}
      {countdown > 0 && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 9999,
          backdropFilter: 'blur(10px)',
          animation: 'countdownOverlay 0.3s ease-out'
        }}>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '30px'
          }}>
            {/* Countdown Number */}
            <div style={{
              width: '200px',
              height: '200px',
              borderRadius: '50%',
              background: `conic-gradient(from 0deg, #ff6b6b 0%, #ff6b6b ${(4-countdown) * 33.33}%, rgba(255, 255, 255, 0.1) ${(4-countdown) * 33.33}%, rgba(255, 255, 255, 0.1) 100%)`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '80px',
              fontWeight: 'bold',
              color: '#fff',
              textShadow: '0 0 20px rgba(255, 107, 107, 0.8)',
              animation: 'countdownDramatic 1s ease-in-out infinite',
              border: '8px solid rgba(255, 255, 255, 0.2)'
            }}>
              {countdown}
            </div>
            
            {/* Message */}
            <div style={{
              textAlign: 'center',
              color: '#fff'
            }}>
              <h2 style={{
                fontSize: '36px',
                margin: '0 0 15px 0',
                fontWeight: 'bold',
                textShadow: '0 2px 10px rgba(0, 0, 0, 0.5)'
              }}>
                Bersiap! 📸
              </h2>
              <p style={{
                fontSize: '20px',
                margin: 0,
                opacity: 0.9,
                fontWeight: '500'
              }}>
                Foto akan diambil dalam {countdown} detik...
              </p>
            </div>
            
            {/* Cancel Button */}
            <button 
              onClick={() => setCountdown(0)}
              style={{
                background: 'rgba(255, 255, 255, 0.1)',
                border: '2px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '50px',
                padding: '12px 24px',
                color: '#fff',
                fontSize: '16px',
                cursor: 'pointer',
                backdropFilter: 'blur(10px)',
                transition: 'all 0.3s ease'
              }}
              onMouseOver={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.2)'
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.5)'
              }}
              onMouseOut={(e) => {
                e.target.style.background = 'rgba(255, 255, 255, 0.1)'
                e.target.style.borderColor = 'rgba(255, 255, 255, 0.3)'
              }}
            >
              ❌ Batal
            </button>
          </div>
        </div>
      )}
      {/* Camera Page */}
      {currentPage === 'camera' && (
        <>
          {/* Canvas 1: Kamera */}
          <div
            className="camera"
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
                    <span>✏️</span> 
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
        <div className="cameraPreview">
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
              {isLoading ? '🔄 Siapkan gaya Anda...' : 
               didInitVideo ? '⏳ Tunggu sebentar...' : 
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
                <p style={{margin: 0, fontWeight: '600'}}>❌ Error Kamera</p>
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
                    <span>✏️</span> 
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
            <div className="photoComparison">
              <div className="photoSide">
                <h3>🎨 Hasil AI</h3>
                {photos.find(p => p.id === currentPhotoId)?.isBusy ? (
                  <div className="loadingPlaceholder">
                    <div className="spinner"></div>
                    <p>Sedang memproses...</p>
                  </div>
                ) : (
                  <img src={aiPhotoSrc || imageData.outputs[currentPhotoId]} alt="Hasil AI" />
                )}
              </div>
              <div className="photoSide">
                <h3>🎞️ GIF</h3>
                {gifInProgress || !gifUrl ? (
                  <div className="loadingPlaceholder">
                    <div className="spinner"></div>
                    <p>GIF sedang diproses...</p>
                  </div>
                ) : (
                  <img src={gifUrl} alt="Hasil GIF" />
                )}
              </div>
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
              <h2 className="qrTitle">📱 Scan QR untuk Download</h2>
              <button
                className="closeBtn"
                onClick={() => setShowDownloadModal(false)}
              >
                <span className="icon">close</span>
              </button>
            </div>
            <div className="qrBody qrBodyDual">
              <div className="qrItem">
                <h3>QR Foto</h3>
                {qrCodes.photo ? (
                  <img src={qrCodes.photo} alt="QR Foto" className="qrCodeImage" />
                ) : (
                  <div className="qrPlaceholder">
                    <div className="spinner"></div>
                  </div>
                )}
              </div>
              <div className="qrItem">
                <h3>QR GIF</h3>
                {qrCodes.gif ? (
                  <img src={qrCodes.gif} alt="QR GIF" className="qrCodeImage" />
                ) : (
                  <div className="qrPlaceholder">
                    <div className="spinner"></div>
                  </div>
                )}
              </div>
            </div>
            <div className="qrActions">
              <button 
                className="btn btnSecondary"
                onClick={() => setShowDownloadModal(false)}
              >
                <span className="icon">close</span>
                Tutup
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
              <button 
                className="desktopModeClose"
                onClick={() => setShowDesktopModeSelector(false)}
              >
                <span className="icon">close</span>
              </button>
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
                <span>✏️</span> 
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
              <p style={{marginBottom: '8px'}}>✏️ Click to set a custom prompt</p>
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

