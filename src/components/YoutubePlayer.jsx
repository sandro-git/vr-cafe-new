// src/components/YoutubePlayer.jsx
import React, { useState, useRef, useEffect } from "react";

function YoutubePlayer({ videoId }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);
  const iframeRef = useRef(null);

  // Construire l'URL YouTube avec des paramètres
  const youtubeUrl = `https://www.youtube.com/embed/${videoId}?rel=0&showinfo=0&autoplay=1`;

  // Essayer d'abord la version haute qualité, puis se rabattre sur la qualité standard en cas d'erreur
  const primaryThumbnail = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  const fallbackThumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

  const thumbnailUrl = thumbnailError ? fallbackThumbnail : primaryThumbnail;

  const handleThumbnailError = () => {
    setThumbnailError(true);
  };

  const handleClick = () => {
    setIsPlaying(true);
  };

  // Gérer le passage en plein écran après le chargement de l'iframe
  useEffect(() => {
    if (isPlaying && iframeRef.current) {
      // Petit délai pour s'assurer que l'iframe est bien chargée
      setTimeout(() => {
        try {
          // Essayer de mettre l'élément iframe en plein écran
          if (iframeRef.current.requestFullscreen) {
            iframeRef.current.requestFullscreen();
          } else if (iframeRef.current.webkitRequestFullscreen) {
            /* Safari */
            iframeRef.current.webkitRequestFullscreen();
          } else if (iframeRef.current.msRequestFullscreen) {
            /* IE11 */
            iframeRef.current.msRequestFullscreen();
          }
        } catch (e) {
          console.error("Impossible de passer en plein écran:", e);
        }
      }, 1000);
    }
  }, [isPlaying]);

  return (
    <div className="youtube-container w-full aspect-video relative rounded-lg overflow-hidden">
      {!isPlaying ? (
        <div
          className="cursor-pointer relative w-full h-full"
          onClick={handleClick}
        >
          <img
            src={thumbnailUrl}
            alt="Miniature YouTube"
            onError={handleThumbnailError}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="play-button w-16 h-16 bg-red-600 rounded-full flex items-center justify-center">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-8 w-8 text-white"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M8 5v14l11-7z" />
              </svg>
            </div>
          </div>
          <div className="absolute bottom-0 left-0 right-0 text-center py-2 bg-black bg-opacity-50 text-white">
            Cliquez pour lancer la vidéo en plein écran
          </div>
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          src={youtubeUrl}
          className="w-full h-full absolute top-0 left-0"
          allowFullScreen
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        ></iframe>
      )}
    </div>
  );
}

export default YoutubePlayer;
