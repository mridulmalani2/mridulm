
import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Album } from '../types';
import { fetchAlbums } from '../services/csvService';
import { ChevronLeft, Maximize2 } from 'lucide-react';

const Hobbies: React.FC = () => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [selectedAlbum, setSelectedAlbum] = useState<Album | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetchAlbums()
      .then(setAlbums)
      .finally(() => setIsLoading(false));
  }, []);

  const openAlbum = (album: Album) => {
    setSelectedAlbum(album);
    document.getElementById('hobbies')?.scrollIntoView({ behavior: 'smooth' });
  };

  const closeAlbum = () => {
    setSelectedAlbum(null);
    document.getElementById('hobbies')?.scrollIntoView({ behavior: 'smooth' });
  };

  if (isLoading) {
    return (
      <section id="hobbies" className="min-h-screen py-32 px-6 bg-[#050505] flex items-center justify-center">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-64 h-80 bg-white/5 animate-pulse rounded-2xl" />
          ))}
        </div>
      </section>
    );
  }

  return (
    <div id="hobbies" className="min-h-screen py-32 px-6 bg-[#050505] text-[#f4ead5] relative transition-all duration-700">
      <div className="max-w-7xl mx-auto">
        <AnimatePresence mode="wait">
          {!selectedAlbum ? (
            <motion.div
              key="album-list"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            >
              {/* Header */}
              <div className="mb-24">
                <motion.div
                  initial={{ opacity: 0, x: -30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 1 }}
                  viewport={{ once: true }}
                  className="space-y-4"
                >
                  <h2 className="font-montserrat text-amber-500/60 tracking-widest text-xs font-bold uppercase">PHOTOGRAPHY</h2>
                  <h3 className="font-playfair text-5xl md:text-8xl italic leading-none tracking-tighter">Through My Lens</h3>
                </motion.div>
              </div>

              {/* Album Stacks Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-20 gap-x-12">
                {albums.map((album, i) => (
                  <motion.div
                    key={`${album.name}-${i}`}
                    initial={{ opacity: 0, y: 40 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.1, duration: 0.8 }}
                    viewport={{ once: true }}
                    className="group cursor-pointer flex flex-col items-center"
                    onClick={() => openAlbum(album)}
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${album.name} album with ${album.images.length} images`}
                    onKeyDown={(e) => e.key === 'Enter' && openAlbum(album)}
                  >
                    <div className="relative w-full aspect-[4/5] mb-8">
                      {/* Stack Visuals */}
                      <div className="absolute inset-0 bg-white/5 border border-white/10 rounded-2xl translate-y-4 -rotate-2 scale-[0.98] transition-transform duration-700 group-hover:translate-y-6 group-hover:-rotate-4" />
                      <div className="absolute inset-0 bg-white/5 border border-white/10 rounded-2xl translate-y-2 rotate-1 scale-[0.99] transition-transform duration-700 group-hover:translate-y-3 group-hover:rotate-2" />

                      {/* Top Card */}
                      <div className="relative h-full w-full overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 shadow-2xl transition-transform duration-700 group-hover:scale-[1.03]">
                        <img
                          src={album.coverImageUrl}
                          alt={album.name}
                          loading="lazy"
                          decoding="async"
                          className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-80" />
                        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-500">
                          <div className="p-4 rounded-full bg-black/40 backdrop-blur-md border border-white/20">
                            <Maximize2 size={24} className="text-white" />
                          </div>
                        </div>
                        <div className="absolute bottom-6 left-6 right-6">
                          <p className="font-montserrat text-[9px] tracking-widest text-amber-500 uppercase font-bold mb-1">{album.images.length} CAPTURES</p>
                          <h4 className="font-playfair text-xl md:text-2xl italic text-white">{album.name}</h4>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="album-expanded"
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="min-h-screen"
            >
              {/* Back Nav and Header */}
              <div className="mb-20 flex flex-col md:flex-row justify-between items-start md:items-end gap-8">
                <div className="space-y-4">
                  <motion.button
                    onClick={closeAlbum}
                    className="flex items-center gap-3 group mb-6 text-amber-500/80 hover:text-amber-500 transition-colors min-h-[48px]"
                    aria-label="Back to albums"
                  >
                    <ChevronLeft size={20} className="group-hover:-translate-x-1 transition-transform" />
                    <span className="font-montserrat text-[10px] font-bold tracking-widest uppercase">BACK TO ALBUMS</span>
                  </motion.button>
                  <h3 className="font-playfair text-5xl md:text-7xl italic leading-none">{selectedAlbum.name}</h3>
                  <p className="font-montserrat text-sm md:text-xl text-white/60 max-w-2xl font-light italic tracking-wide">
                    "{selectedAlbum.footerText}"
                  </p>
                </div>
                <div className="hidden md:block">
                  <div className="px-4 py-2 border border-white/10 rounded-full bg-white/5">
                    <span className="font-montserrat text-[10px] tracking-widest font-bold text-white/50 uppercase">
                      GALLERY: {selectedAlbum.images.length} IMAGES
                    </span>
                  </div>
                </div>
              </div>

              {/* Easy Cards Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {selectedAlbum.images.map((img, idx) => (
                  <motion.div
                    key={`${selectedAlbum.name}-img-${idx}`}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: idx * 0.05, duration: 0.6 }}
                    className="relative aspect-[4/5] rounded-2xl overflow-hidden border border-white/5 group bg-neutral-900"
                  >
                    <img
                      src={img}
                      alt={`${selectedAlbum.name} photo ${idx + 1}`}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent pointer-events-none" />
                  </motion.div>
                ))}
              </div>

              {/* Bottom Return Button */}
              <div className="mt-24 flex justify-center">
                <motion.button
                  onClick={closeAlbum}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  className="px-12 py-4 border border-white/20 rounded-full font-montserrat text-[10px] tracking-widest font-bold text-white/60 hover:text-white hover:border-white transition-all uppercase min-h-[48px]"
                >
                  Back to Albums
                </motion.button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Hobbies;
