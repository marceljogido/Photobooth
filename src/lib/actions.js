/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
import {GIFEncoder, quantize, applyPalette} from 'https://unpkg.com/gifenc'
import useStore from './store'
import imageData from './imageData'
import gen from './llm'
import modes from './modes'

const get = useStore.getState
const set = useStore.setState
const gifSize = 512
const WATERMARK_SOURCE = '/logowatermark.png'

const loadImage = src =>
  new Promise((resolve, reject) => {
    if (typeof Image === 'undefined') {
      reject(new Error('Image constructor unavailable'))
      return
    }
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })

let watermarkImagePromise = null

const getWatermarkImage = async () => {
  if (!watermarkImagePromise) {
    watermarkImagePromise = loadImage(WATERMARK_SOURCE).catch(error => {
      watermarkImagePromise = null
      throw error
    })
  }
  return watermarkImagePromise
}
const model = 'gemini-2.5-flash-preview-image-generation'

export const init = () => {
  if (get().didInit) {
    return
  }

  set(state => {
    state.didInit = true
  })
}

// ...existing code...
export const snapPhoto = async b64 => {
  const id = crypto.randomUUID()
  const {activeMode, customPrompt} = get()
  imageData.inputs[id] = b64

  set(state => {
    state.photos.unshift({id, mode: activeMode, isBusy: true})
  })

  try {
    const result = await gen({
      model,
      prompt: activeMode === 'custom' ? customPrompt : modes[activeMode].prompt,
      inputFile: b64
    })
    
    imageData.outputs[id] = result

    set(state => {
      state.photos = state.photos.map(photo =>
        photo.id === id ? {...photo, isBusy: false} : photo
      )
    })
    
    return id // Return the photo ID
  } catch (error) {
    console.error('Error processing photo:', error)
    set(state => {
      state.photos = state.photos.map(photo =>
        photo.id === id ? {...photo, isBusy: false, error: error.message} : photo
      )
    })
    alert('Gagal memproses foto: ' + error.message)
    return id // Still return ID even on error
  }
}
// ...existing code...

export const deletePhoto = id => {
  set(state => {
    state.photos = state.photos.filter(photo => photo.id !== id)
  })

  delete imageData.inputs[id]
  delete imageData.outputs[id]
}

export const setMode = mode =>
  set(state => {
    state.activeMode = mode
  })

const processImageToCanvas = async (base64Data, size, withWatermark = false) => {
  const img = new Image()
  await new Promise((resolve, reject) => {
    img.onload = resolve
    img.onerror = reject
    img.src = base64Data
  })

  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  canvas.width = size
  canvas.height = size

  const imgAspect = img.width / img.height
  const canvasAspect = 1

  let drawWidth
  let drawHeight
  let drawX
  let drawY

  if (imgAspect > canvasAspect) {
    drawHeight = size
    drawWidth = drawHeight * imgAspect
    drawX = (size - drawWidth) / 2
    drawY = 0
  } else {
    drawWidth = size
    drawHeight = drawWidth / imgAspect
    drawX = 0
    drawY = (size - drawHeight) / 2
  }

  ctx.clearRect(0, 0, size, size)
  ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight)

  if (withWatermark) {
    try {
      const watermark = await getWatermarkImage()
      if (watermark && watermark.width && watermark.height) {
        const desiredWidth = size * 0.2
        const aspect = watermark.width / watermark.height
        const desiredHeight = desiredWidth / aspect
        const margin = Math.max(10, Math.round(size * 0.04))
        const x = size - desiredWidth - margin
        const y = size - desiredHeight - margin
        ctx.drawImage(watermark, x, y, desiredWidth, desiredHeight)
      }
    } catch (error) {
      console.warn('Failed to apply watermark to GIF frame:', error)
    }
  }

  return ctx.getImageData(0, 0, size, size)
}

const addFrameToGif = (gif, imageData, size, delay) => {
  const palette = quantize(imageData.data, 256)
  const indexed = applyPalette(imageData.data, palette)

  gif.writeFrame(indexed, size, size, {
    palette,
    delay
  })
}

export const makeGif = async () => {
  const {photos, gifUrl: previousGifUrl} = get()

  set(state => {
    state.gifInProgress = true
  })

  try {
    const readyPhotos = photos.filter(photo => !photo.isBusy)
    if (readyPhotos.length === 0) {
      console.warn('makeGif called without any ready photos')
      return null
    }

    const [latestPhoto] = readyPhotos
    const latestId = latestPhoto.id

    const gif = new GIFEncoder()

    const inputBase64 = imageData.inputs[latestId]
    const outputBase64 = imageData.outputs[latestId]

    if (!inputBase64 || !outputBase64) {
      console.warn('Missing input or output image data for GIF generation')
      return null
    }

    const inputImageData = await processImageToCanvas(inputBase64, gifSize, true)
    addFrameToGif(gif, inputImageData, gifSize, 333)

    const outputImageData = await processImageToCanvas(outputBase64, gifSize, true)
    addFrameToGif(gif, outputImageData, gifSize, 833)

    gif.finish()

    if (previousGifUrl && typeof previousGifUrl === 'string' && previousGifUrl.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(previousGifUrl)
      } catch (error) {
        console.warn('Failed to revoke previous GIF URL:', error)
      }
    }

    const gifUrl = URL.createObjectURL(
      new Blob([gif.buffer], {type: 'image/gif'})
    )

    // Hanya pertahankan data foto terbaru
    Object.keys(imageData.inputs).forEach(key => {
      if (key !== latestId) {
        delete imageData.inputs[key]
      }
    })
    Object.keys(imageData.outputs).forEach(key => {
      if (key !== latestId) {
        delete imageData.outputs[key]
      }
    })

    set(state => {
      state.gifUrl = gifUrl
      state.photos = state.photos.filter(photo => photo.id === latestId)
    })

    return gifUrl
  } catch (error) {
    console.error('Error creating GIF:', error)
    return null
  } finally {
    set(state => {
      state.gifInProgress = false
    })
  }
}

export const resetSession = () => {
  const {gifUrl} = get()

  // Bersihkan semua data foto yang tersimpan
  Object.keys(imageData.inputs).forEach(key => {
    delete imageData.inputs[key]
  })
  Object.keys(imageData.outputs).forEach(key => {
    delete imageData.outputs[key]
  })

  if (gifUrl && typeof gifUrl === 'string' && gifUrl.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(gifUrl)
    } catch (error) {
      console.warn('Failed to revoke GIF object URL:', error)
    }
  }

  set(state => {
    state.photos = []
    state.gifUrl = null
    state.gifInProgress = false
  })
}

export const hideGif = () =>
  set(state => {
    state.gifUrl = null
  })

export const setCustomPrompt = prompt =>
  set(state => {
    state.customPrompt = prompt
  })
