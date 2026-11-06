/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, FormEvent } from 'react';
import { Download, Film, Music, Loader2, Search, AlertCircle, CheckCircle2, X, FileVideo, FileAudio } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────
type DownloadState =
  | { phase: 'idle' }
  | { phase: 'preparing'; label: string }
  | { phase: 'ready'; id: string; filename: string; label: string }
  | { phase: 'error'; message: string; label: string };

// ─── Download modal ───────────────────────────────────────────────────────────
function DownloadModal({
  state,
  onClose,
}: {
  state: Exclude<DownloadState, { phase: 'idle' }>;
  onClose: () => void;
}) {
  const handleDownload = () => {
    if (state.phase !== 'ready') return;
    const link = document.createElement('a');
    link.href = `/api/serve/${state.id}`;
    link.download = state.filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    onClose();
  };

  const isAudio = state.label.toLowerCase().includes('mp3');

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 40, scale: 0.96 }}
        transition={{ type: 'spring', stiffness: 400, damping: 30 }}
        className="w-full max-w-sm overflow-hidden rounded-3xl bg-white shadow-2xl"
      >
        {/* Top bar */}
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <span className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
            {state.label}
          </span>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-col items-center px-6 py-8 text-center">
          <AnimatePresence mode="wait">

            {/* Preparing */}
            {state.phase === 'preparing' && (
              <motion.div
                key="preparing"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="flex flex-col items-center gap-5"
              >
                {/* Animated ring */}
                <div className="relative flex h-20 w-20 items-center justify-center">
                  <svg className="absolute inset-0 h-full w-full -rotate-90" viewBox="0 0 80 80">
                    <circle cx="40" cy="40" r="34" fill="none" stroke="#f3f4f6" strokeWidth="6" />
                    <motion.circle
                      cx="40" cy="40" r="34"
                      fill="none"
                      stroke="#111"
                      strokeWidth="6"
                      strokeLinecap="round"
                      strokeDasharray="213"
                      animate={{ strokeDashoffset: [213, 0, 213] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                    />
                  </svg>
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-50">
                    {isAudio
                      ? <FileAudio className="h-5 w-5 text-gray-600" />
                      : <FileVideo className="h-5 w-5 text-gray-600" />
                    }
                  </div>
                </div>

                <div>
                  <p className="text-lg font-semibold text-gray-900">Creating your download link</p>
                  <p className="mt-1 text-sm text-gray-400">
                    This can take a minute for longer videos…
                  </p>
                </div>

                {/* Animated dots */}
                <div className="flex gap-1.5">
                  {[0, 1, 2].map((i) => (
                    <motion.span
                      key={i}
                      className="h-2 w-2 rounded-full bg-gray-300"
                      animate={{ opacity: [0.3, 1, 0.3] }}
                      transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.2 }}
                    />
                  ))}
                </div>
              </motion.div>
            )}

            {/* Ready */}
            {state.phase === 'ready' && (
              <motion.div
                key="ready"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="flex flex-col items-center gap-5 w-full"
              >
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.05 }}
                  className="flex h-20 w-20 items-center justify-center rounded-full bg-green-50"
                >
                  <CheckCircle2 className="h-10 w-10 text-green-500" />
                </motion.div>

                <div>
                  <p className="text-lg font-semibold text-gray-900">Your link is ready!</p>
                  <p className="mt-1 text-sm text-gray-400 break-all">{state.filename}</p>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleDownload}
                  className="flex w-full items-center justify-center gap-2 rounded-2xl bg-black px-6 py-3.5 text-sm font-semibold text-white shadow-lg shadow-black/10 transition-colors hover:bg-gray-800"
                >
                  <Download className="h-4.5 w-4.5" />
                  Download File
                </motion.button>

                <p className="text-xs text-gray-400">Link expires in 30 minutes</p>
              </motion.div>
            )}

            {/* Error */}
            {state.phase === 'error' && (
              <motion.div
                key="error"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.85 }}
                className="flex flex-col items-center gap-5 w-full"
              >
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-red-50">
                  <AlertCircle className="h-10 w-10 text-red-400" />
                </div>

                <div>
                  <p className="text-lg font-semibold text-gray-900">Something went wrong</p>
                  <p className="mt-1 text-sm text-red-500">{state.message}</p>
                </div>

                <button
                  onClick={onClose}
                  className="rounded-2xl bg-gray-100 px-6 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-200 transition-colors"
                >
                  Close
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Main app ─────────────────────────────────────────────────────────────────
export default function App() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [metadata, setMetadata] = useState<any>(null);
  const [downloadState, setDownloadState] = useState<DownloadState>({ phase: 'idle' });

  const fetchMetadata = async (e: FormEvent) => {
    e.preventDefault();
    if (!url) return;

    setLoading(true);
    setError('');
    setMetadata(null);

    try {
      const res = await fetch('/api/metadata', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });

      if (!res.ok) {
        const ct = res.headers.get('content-type') || '';
        const data = ct.includes('application/json') ? await res.json() : null;
        throw new Error(data?.error || `Server error ${res.status}`);
      }

      const data = await res.json();
      setMetadata(data);
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePrepare = async (type: 'audio' | 'video', resolution?: string) => {
    if (!metadata) return;

    const label = type === 'audio'
      ? 'High Quality MP3'
      : `${resolution}p MP4`;

    setDownloadState({ phase: 'preparing', label });

    try {
      const res = await fetch('/api/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: metadata.webpage_url,
          type,
          resolution,
          title: metadata.title,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to prepare download');
      }

      setDownloadState({ phase: 'ready', id: data.id, filename: data.filename, label });
    } catch (err: any) {
      setDownloadState({ phase: 'error', message: err.message || 'Unknown error', label });
    }
  };

  const closeModal = () => setDownloadState({ phase: 'idle' });

  return (
    <div className="min-h-screen bg-[#F5F5F7] font-sans text-gray-900 selection:bg-black selection:text-white">

      {/* Download modal */}
      <AnimatePresence>
        {downloadState.phase !== 'idle' && (
          <DownloadModal state={downloadState} onClose={closeModal} />
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-200/50 bg-white/80 px-6 py-4 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center">
          <div className="flex items-center space-x-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-black text-white">
              <Download className="h-5 w-5" />
            </div>
            <span className="text-xl font-semibold tracking-tight">Downder</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12 sm:py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12 text-center"
        >
          <h1 className="mb-4 text-4xl font-semibold tracking-tight sm:text-5xl">
            Save what inspires you.
          </h1>
          <p className="text-lg text-gray-500">
            Paste a YouTube link below to convert and download.
          </p>
        </motion.div>

        {/* Search bar */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="mb-12 rounded-3xl bg-white p-2 shadow-sm ring-1 ring-gray-900/5"
        >
          <form onSubmit={fetchMetadata} className="relative flex items-center">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="url"
              required
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full bg-transparent py-4 pl-12 pr-32 text-lg outline-none placeholder:text-gray-400"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <button
              type="submit"
              disabled={loading || !url}
              className="absolute right-2 top-2 bottom-2 flex items-center justify-center rounded-2xl bg-black px-6 font-medium text-white transition-all hover:bg-gray-800 hover:scale-105 active:scale-95 disabled:pointer-events-none disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Analyze'}
            </button>
          </form>
        </motion.div>

        <AnimatePresence mode="wait">
          {/* Error */}
          {error && (
            <motion.div
              key="error"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mb-8 overflow-hidden rounded-2xl bg-red-50 p-4 ring-1 ring-red-500/20"
            >
              <div className="flex items-start space-x-3 text-red-700">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            </motion.div>
          )}

          {/* Results */}
          {metadata && !loading && (
            <motion.div
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="overflow-hidden rounded-3xl bg-white shadow-xl shadow-gray-200/50 ring-1 ring-gray-900/5"
            >
              <div className="flex flex-col sm:flex-row">
                {/* Thumbnail */}
                <div className="relative aspect-video w-full bg-black sm:w-2/5">
                  <img
                    src={metadata.thumbnail}
                    alt={metadata.title}
                    className="h-full w-full object-cover opacity-90 transition-opacity hover:opacity-100"
                  />
                  <div className="absolute bottom-2 right-2 rounded-lg bg-black/70 px-2 py-1 text-xs font-semibold text-white backdrop-blur-md">
                    {Math.floor(metadata.duration / 60)}:{(metadata.duration % 60).toString().padStart(2, '0')}
                  </div>
                </div>

                {/* Download options */}
                <div className="flex flex-1 flex-col justify-between p-6 sm:w-3/5">
                  <div className="mb-6">
                    <h2 className="mb-2 line-clamp-2 text-xl font-semibold leading-tight text-gray-900">
                      {metadata.title}
                    </h2>
                    <p className="text-sm text-gray-500">{metadata.uploader}</p>
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {/* Video */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold tracking-wide text-gray-400 uppercase">Video</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {['1080', '720', '480', '360'].map((res) => (
                          <motion.button
                            key={res}
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            onClick={() => handlePrepare('video', res)}
                            className="flex items-center justify-center space-x-1.5 rounded-xl bg-gray-50 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 active:bg-gray-200"
                          >
                            <Film className="h-4 w-4" />
                            <span>{res}p</span>
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {/* Audio */}
                    <div className="space-y-3">
                      <h3 className="text-sm font-semibold tracking-wide text-gray-400 uppercase">Audio</h3>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handlePrepare('audio')}
                        className="flex w-full items-center justify-center space-x-2 rounded-xl bg-blue-50 py-3 font-medium text-blue-600 transition-colors hover:bg-blue-100 active:bg-blue-200"
                      >
                        <Music className="h-5 w-5" />
                        <span>High Quality MP3</span>
                      </motion.button>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
