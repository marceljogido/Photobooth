import React from 'react'

export default function LandingScreen({onClose, digiohUrl}) {
  return (
    <div className="landingScreen">
      <div className="landingBackdrop landingBackdrop--left" />
      <div className="landingBackdrop landingBackdrop--right" />
      <div className="landingCard">
        <div className="landingBadge">Profesional Event Experience</div>
        <div className="landingLogo">
          <img src="/DIGIOH_Logomark.svg" alt="digiSelfie AI" />
          <div>
            <p className="landingLogoTitle">digiSelfie AI</p>
            <span>Powered by DigiOH</span>
          </div>
        </div>
        <h1 className="landingTitle">
          <span>Selamat</span>
          <span>Datang</span>
        </h1>
        <p className="landingSubtitle">
          Pilih destinasi sebelum memulai pengalaman photobooth Anda bersama DigiOH.
        </p>
        <div className="landingActions">
          <button
            type="button"
            className="landingButton secondary"
            onClick={() => window.open(digiohUrl, '_blank', 'noopener,noreferrer')}
          >
            <span className="icon">language</span>
            Profile DigiOH
          </button>
          <button
            type="button"
            className="landingButton primary"
            onClick={onClose}
          >
            <span className="icon">camera_enhance</span>
            PHOTOBOOTH AI
          </button>
        </div>
      </div>
    </div>
  )
}
