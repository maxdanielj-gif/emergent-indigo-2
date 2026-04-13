import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { Download, Trash2, Copy, Upload, FileArchive, Loader2, Maximize2, CheckSquare, Square, X } from 'lucide-react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import ImageModal from '../components/ImageModal';

const GalleryItemCard: React.FC<{
    item: any;
    mediaType: string;
    isSelectionMode: boolean;
    selectedIds: string[];
    toggleSelectImage: (id: string) => void;
    setSelectedItem: (item: any) => void;
    handleDelete: (id: string) => void;
    handleCopyPrompt: (prompt: string) => void;
    activeTab: string;
    timeZone: string;
}> = ({ item, mediaType, isSelectionMode, selectedIds, toggleSelectImage, setSelectedItem, handleDelete, handleCopyPrompt, activeTab, timeZone }) => {

    return (
        <div className={`bg-gray-100 dark:bg-indigo-800 rounded-lg shadow-sm hover:shadow-md transition-all flex flex-col group relative border-2 ${selectedIds.includes(item.id) ? 'border-indigo-500 ring-2 ring-indigo-200' : 'border-transparent'}`}>
            <div 
                className="aspect-square overflow-hidden rounded-t-lg cursor-pointer relative"
                onClick={() => isSelectionMode ? toggleSelectImage(item.id) : setSelectedItem({ url: item.url, prompt: item.prompt })}
            >
                <img src={item.url} alt="Gallery Item" className="w-full h-full object-cover" loading="lazy" />
                
                {isSelectionMode ? (
                    <div className="absolute top-2 right-2 p-1 bg-white dark:bg-indigo-900 rounded-full shadow-md">
                    {selectedIds.includes(item.id) ? (
                        <CheckSquare className="w-6 h-6 text-indigo-600" />
                    ) : (
                        <Square className="w-6 h-6 text-gray-300 dark:text-indigo-600" />
                    )}
                    </div>
                ) : (
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-all flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <Maximize2 className="w-8 h-8 text-white drop-shadow-lg" />
                    </div>
                )}
            </div>
            
            <div className="flex items-center justify-center space-x-4 p-3 bg-gray-50 dark:bg-indigo-950 border-t border-gray-200 dark:border-indigo-700">
                <a 
                    href={item.url} 
                    download={`${activeTab}-${item.id}.png`}
                    className="p-3 bg-white dark:bg-indigo-900 text-gray-800 dark:text-indigo-100 rounded-full hover:bg-gray-100 dark:hover:bg-indigo-800 transition-colors shadow-sm min-h-[44px] min-w-[44px] flex items-center justify-center" 
                    title="Download"
                >
                    <Download className="w-6 h-6" />
                </a>
                <button
                    onClick={() => handleDelete(item.id)}
                    className="p-3 bg-white dark:bg-indigo-900 text-red-500 rounded-full hover:bg-red-100 dark:hover:bg-red-900 transition-colors shadow-sm min-h-[44px] min-w-[44px] flex items-center justify-center"
                    title="Delete Image"
                >
                    <Trash2 className="w-6 h-6" />
                </button>
                {item.prompt && (
                    <button
                        onClick={() => handleCopyPrompt(item.prompt!)}
                        className="p-3 bg-white dark:bg-indigo-900 text-gray-800 dark:text-indigo-100 rounded-full hover:bg-gray-100 dark:hover:bg-indigo-800 transition-colors shadow-sm min-h-[44px] min-w-[44px] flex items-center justify-center"
                        title="Copy Prompt"
                    >
                        <Copy className="w-6 h-6" />
                    </button>
                )}
            </div>
            <div className="px-2 pb-2 flex justify-between items-center bg-gray-50 dark:bg-indigo-950">
                <span className="text-[10px] text-gray-400 dark:text-indigo-500">
                    {new Date(item.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric', timeZone })}
                </span>
                {item.prompt && (
                    <div className="text-gray-700 dark:text-indigo-200 text-[10px] truncate max-w-[100px]">
                        {item.prompt}
                    </div>
                )}
            </div>
        </div>
    );
};

const GalleryScreen: React.FC = () => {
  const { 
    gallery, deleteImageFromGallery, deleteImagesFromGallery, addToGallery, timeZone, 
    addToast,
    galleryLoaded, loadGallery
  } = useApp();

  const [activeTab, setActiveTab] = useState<'generated' | 'uploaded'>('generated');
  const [mediaFilter, setMediaFilter] = useState<'all' | 'image' | 'video'>('all');
  const [selectedItem, setSelectedItem] = useState<{ url: string; mediaType?: 'image' | 'video'; prompt?: string } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!galleryLoaded) {
      loadGallery();
    }
  }, [galleryLoaded, loadGallery]);

  if (!galleryLoaded) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 dark:bg-indigo-950">
        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
      </div>
    );
  }

  const filteredGallery = (Array.isArray(gallery) ? gallery : []).filter(item => {
    const matchesTab = item.type === activeTab;
    const itemMediaType = getItemMediaType(item);
    const matchesFilter = mediaFilter === 'all' || itemMediaType === mediaFilter;
    return matchesTab && matchesFilter;
  });

  function getItemMediaType(item: any) {
    if (item.mediaType) return item.mediaType;
    // Fallback detection for legacy items or missing metadata
    const url = item.url || '';
    if (url.startsWith('data:video/') || url.includes('.mp4') || url.includes('.webm') || url.includes('blob:')) {
        return 'video';
    }
    return 'image';
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode(!isSelectionMode);
    setSelectedIds([]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === filteredGallery.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredGallery.map(item => item.id));
    }
  };

  const toggleSelectImage = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.length === 0) return;
    
    if (window.confirm(`Are you sure you want to delete ${selectedIds.length} selected items?`)) {
      addToast({ title: "Gallery", message: `Deleting ${selectedIds.length} items...`, type: "info" });
      await new Promise(resolve => setTimeout(resolve, 500));
      deleteImagesFromGallery(selectedIds);
      setSelectedIds([]);
      setIsSelectionMode(false);
      addToast({ title: "Gallery", message: "Batch delete successful.", type: "success" });
    }
  };

  const handleUploadImages = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addToast({ title: "Gallery", message: "Processing uploaded media...", type: "info" });
      const files = Array.from(e.target.files);
      
      for (const file of files) {
        if (file.name.endsWith('.zip')) {
          // Handle ZIP upload
          try {
            const zip = await JSZip.loadAsync(file);
            const imageExtensions = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
            const videoExtensions = ['.mp4', '.webm', '.mov'];
            
            const mediaFiles = Object.keys(zip.files).filter(name => 
              (imageExtensions.some(ext => name.toLowerCase().endsWith(ext)) || 
               videoExtensions.some(ext => name.toLowerCase().endsWith(ext))) && 
              !zip.files[name].dir
            );

            if (mediaFiles.length > 0) {
              addToast({ title: "ZIP Upload", message: `Extracting ${mediaFiles.length} items from ZIP...`, type: "info" });
              for (const name of mediaFiles) {
                const isVideo = videoExtensions.some(ext => name.toLowerCase().endsWith(ext));
                const blob = await zip.files[name].async('blob');
                const base64 = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.readAsDataURL(blob);
                });

                addToGallery({
                  id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  type: 'uploaded',
                  mediaType: isVideo ? 'video' : 'image',
                  url: base64,
                  timestamp: Date.now()
                });
              }
              addToast({ title: "ZIP Upload", message: `Successfully uploaded ${mediaFiles.length} items from ZIP.`, type: "success" });
            }
          } catch (err) {
            console.error("Failed to process ZIP upload:", err);
            addToast({ title: "Upload Failed", message: "Failed to process the ZIP file.", type: "error" });
          }
        } else {
          // Handle normal image/video upload
          const isVideo = file.type.startsWith('video/');
          const reader = new FileReader();
          reader.onload = (event) => {
            if (event.target?.result) {
              addToGallery({
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                type: 'uploaded',
                mediaType: isVideo ? 'video' : 'image',
                url: event.target.result as string,
                timestamp: Date.now()
              });
            }
          };
          reader.readAsDataURL(file);
        }
      }
      setActiveTab('uploaded');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleDownloadAll = async (mediaType?: 'image' | 'video') => {
    addToast({ title: "Gallery", message: `Preparing your ${mediaType || 'gallery'} for download...`, type: "info" });
    await new Promise(resolve => setTimeout(resolve, 800));
    const zip = new JSZip();
    const items = mediaType ? gallery.filter(item => getItemMediaType(item) === mediaType) : filteredGallery;
    
    if (items.length === 0) {
      addToast({ title: "Download", message: `No ${mediaType || 'gallery'} items to download.`, type: "warning" });
      return;
    }

    for (const item of items) {
      try {
        const response = await fetch(item.url);
        const blob = await response.blob();
        const itemType = getItemMediaType(item);
        const extension = itemType === 'video' ? 'mp4' : 'png';
        zip.file(`${item.type}-${item.id}.${extension}`, blob);
      } catch (err) {
        console.error(`Failed to fetch item ${item.id} for ZIP:`, err);
      }
    }
    
    const content = await zip.generateAsync({ type: 'blob' });
    const timestamp = new Date().toISOString().split('T')[0];
    saveAs(content, `gallery-${mediaType || activeTab}-${timestamp}.zip`);
  };

  const handleCopyPrompt = (prompt: string) => {
    navigator.clipboard.writeText(prompt).then(() => {
      alert("Prompt copied to clipboard!");
    }).catch(err => {
      console.error("Failed to copy prompt: ", err);
    });
  };

  const handleDelete = async (id: string) => {
    if (window.confirm("Are you sure you want to delete this image from the gallery?")) {
      addToast({ title: "Gallery", message: "Deleting image...", type: "info" });
      await new Promise(resolve => setTimeout(resolve, 500));
      deleteImageFromGallery(id);
    }
  };

  return (
    <div className="p-6 bg-transparent transition-colors duration-500 rounded-lg shadow-md min-h-[80vh]">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
        <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-bold text-indigo-600 dark:text-indigo-300 mr-2">Gallery</h2>
            <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center px-4 py-2 bg-indigo-50 dark:bg-indigo-800 text-indigo-700 dark:text-indigo-200 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-700 transition-colors text-sm font-medium min-h-[44px]"
            >
                <Upload className="w-5 h-5 mr-2" />
                Upload Media
            </button>
            <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleUploadImages} 
                accept="image/*,video/*,.zip" 
                multiple
                className="hidden" 
            />
            <button
                onClick={() => handleDownloadAll()}
                disabled={filteredGallery.length === 0}
                className="flex items-center px-4 py-2 bg-gray-50 dark:bg-indigo-800 text-gray-700 dark:text-indigo-200 rounded-lg hover:bg-gray-100 dark:hover:bg-indigo-700 transition-colors text-sm font-medium disabled:opacity-50 min-h-[44px]"
            >
                <FileArchive className="w-5 h-5 mr-2" />
                Download Zip
            </button>
            
            <button
                onClick={toggleSelectionMode}
                className={`flex items-center px-4 py-2 rounded-lg transition-colors text-sm font-medium min-h-[44px] ${
                  isSelectionMode ? 'bg-indigo-600 text-white' : 'bg-gray-50 dark:bg-indigo-800 text-gray-700 dark:text-indigo-200 hover:bg-gray-100 dark:hover:bg-indigo-700'
                }`}
            >
                {isSelectionMode ? <X className="w-5 h-5 mr-2" /> : <CheckSquare className="w-5 h-5 mr-2" />}
                {isSelectionMode ? "Cancel Selection" : "Select Multiple"}
            </button>

            {isSelectionMode && (
              <>
                <button
                    onClick={toggleSelectAll}
                    className="flex items-center px-4 py-2 bg-gray-50 dark:bg-indigo-800 text-gray-700 dark:text-indigo-200 rounded-lg hover:bg-gray-100 dark:hover:bg-indigo-700 transition-colors text-sm font-medium min-h-[44px]"
                >
                    {selectedIds.length === filteredGallery.length ? "Deselect All" : "Select All"}
                </button>
                <button
                    onClick={handleBatchDelete}
                    disabled={selectedIds.length === 0}
                    className="flex items-center px-4 py-2 bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-100 dark:hover:bg-red-800 transition-colors text-sm font-medium disabled:opacity-50 min-h-[44px]"
                >
                    <Trash2 className="w-5 h-5 mr-2" />
                    Delete ({selectedIds.length})
                </button>
              </>
            )}
        </div>
        <div className="flex flex-col gap-2 w-full sm:w-auto">
          <div className="flex space-x-1 bg-gray-100 dark:bg-indigo-800 p-1 rounded-lg">
              <button
                  onClick={() => setActiveTab('generated')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
                      activeTab === 'generated' ? 'bg-white dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-gray-500 dark:text-indigo-400 hover:text-gray-700 dark:hover:text-indigo-200'
                  }`}
              >
                  Generated
              </button>
              <button
                  onClick={() => setActiveTab('uploaded')}
                  className={`flex-1 px-4 py-2 rounded-md text-sm font-medium transition-colors min-h-[44px] ${
                      activeTab === 'uploaded' ? 'bg-white dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300 shadow-sm' : 'text-gray-500 dark:text-indigo-400 hover:text-gray-700 dark:hover:text-indigo-200'
                  }`}
              >
                  Uploaded
              </button>
          </div>
        </div>
      </div>

      {filteredGallery.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-gray-400 border-2 border-dashed border-gray-200 rounded-lg">
            <p>No {activeTab} images yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filteredGallery.map((item) => (
            <GalleryItemCard 
                key={item.id}
                item={item}
                mediaType={getItemMediaType(item)}
                isSelectionMode={isSelectionMode}
                selectedIds={selectedIds}
                toggleSelectImage={toggleSelectImage}
                setSelectedItem={setSelectedItem}
                handleDelete={handleDelete}
                handleCopyPrompt={handleCopyPrompt}
                activeTab={activeTab}
                timeZone={timeZone}
            />
          ))}
        </div>
      )}

      <ImageModal
        isOpen={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        imageUrl={selectedItem?.url || ''}
        mediaType={selectedItem?.mediaType}
        prompt={selectedItem?.prompt}
        onCopyPrompt={handleCopyPrompt}
      />
    </div>
  );
};

export default GalleryScreen;
