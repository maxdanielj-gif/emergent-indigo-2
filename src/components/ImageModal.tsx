import React from 'react';
import { X, Download, Copy } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ImageModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageUrl: string;
  mediaType?: 'image' | 'video';
  prompt?: string;
  onCopyPrompt?: (prompt: string) => void;
}

const ImageModal: React.FC<ImageModalProps> = ({ isOpen, onClose, imageUrl, mediaType: initialMediaType, prompt, onCopyPrompt }) => {
  const [videoUrl, setVideoUrl] = React.useState<string | null>(null);
  const [isConverting, setIsConverting] = React.useState(false);

  const mediaType = initialMediaType || (
    (imageUrl.startsWith('data:video/') || imageUrl.includes('.mp4') || imageUrl.includes('.webm') || imageUrl.includes('blob:')) 
    ? 'video' 
    : 'image'
  );

  React.useEffect(() => {
    let currentUrl: string | null = null;

    const convertToBlob = async () => {
      if (!isOpen) return;

      if (mediaType === 'video' && imageUrl.startsWith('data:')) {
        setIsConverting(true);
        try {
          const response = await fetch(imageUrl);
          const blob = await response.blob();
          currentUrl = URL.createObjectURL(blob);
          setVideoUrl(currentUrl);
        } catch (err) {
          console.error("Failed to convert data URL to blob URL", err);
          setVideoUrl(imageUrl);
        } finally {
          setIsConverting(false);
        }
      } else {
        setVideoUrl(imageUrl);
      }
    };

    convertToBlob();

    return () => {
      if (currentUrl && currentUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentUrl);
      }
    };
  }, [imageUrl, mediaType, isOpen]);
  
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 md:p-8"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative max-w-5xl w-full max-h-[95vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onClose}
            className="absolute top-3 right-3 z-10 p-1 text-white/80 hover:text-white transition-colors"
          >
            <X className="w-8 h-8" />
          </button>

          {/* Scrollable content area */}
          <div className="overflow-y-auto overscroll-contain flex flex-col items-center">
            <div className="relative group w-full flex flex-col items-center">
            {isConverting ? (
              <div className="w-full aspect-video flex flex-col items-center justify-center bg-indigo-100 dark:bg-indigo-900 rounded-lg">
                <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-indigo-900 dark:text-indigo-100 font-medium">Preparing video...</p>
              </div>
            ) : mediaType === 'video' ? (
              <video
                src={videoUrl || imageUrl}
                controls
                autoPlay
                playsInline
                className="max-w-full max-h-[60vh] rounded-lg shadow-2xl"
              />
            ) : (
              <img
                src={imageUrl}
                alt="Full view"
                className="max-w-full max-h-[60vh] object-contain rounded-lg shadow-2xl"
              />
            )}
            
            <div className="mt-4 flex flex-wrap justify-center gap-4">
              <a
                href={videoUrl || imageUrl}
                download={mediaType === 'video' ? "video.mp4" : "image.png"}
                className={`flex items-center px-6 py-3 bg-indigo-100 dark:bg-indigo-900 text-indigo-900 dark:text-indigo-100 rounded-full font-bold hover:bg-indigo-200 dark:hover:bg-indigo-800 transition-all shadow-lg ${isConverting ? 'opacity-50 pointer-events-none' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                <Download className="w-5 h-5 mr-2" />
                Download
              </a>
              
              {prompt && onCopyPrompt && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onCopyPrompt(prompt);
                  }}
                  className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-full font-bold hover:bg-indigo-700 transition-all shadow-lg"
                >
                  <Copy className="w-5 h-5 mr-2" />
                  Copy Prompt
                </button>
              )}
            </div>

            {prompt && (
              <div className="mt-6 mb-4 p-4 bg-indigo-100/50 dark:bg-indigo-900/50 backdrop-blur-md rounded-xl border border-indigo-200 dark:border-indigo-800 max-w-2xl w-full max-h-48 overflow-y-auto">
                <h4 className="text-xs font-bold text-indigo-900/60 dark:text-indigo-100/60 uppercase tracking-wider mb-2">Prompt</h4>
                <p className="text-sm text-indigo-900 dark:text-indigo-100 leading-relaxed italic">
                  "{prompt}"
                </p>
              </div>
            )}
          </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default ImageModal;
