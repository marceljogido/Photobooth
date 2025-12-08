import React from 'react'
import c from 'clsx'

export default function ResultScreen({
  activeResultTab,
  setActiveResultTab,
  RESULT_TAB_OPTIONS,
  renderResultSection,
  currentPhoto,
  gifInProgress,
  gifUrl,
  handleDownloadClick,
  retakePhoto,
  photos,
  currentPhotoId,
  isUploading
}) {
  return (
    <div className="resultsPage">
      <div className="resultContent">
        {renderResultSection(activeResultTab)}
      </div>
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
  )
}
