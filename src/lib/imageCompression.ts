/**
 * Resizes an image file down to `maxDimension` on its longest side and
 * re-encodes it, so uploads (barber avatars, shop logo) stay small and
 * consistent regardless of how big the original photo was. PNGs stay PNG
 * (keeps transparency, e.g. for logos) — everything else gets re-encoded
 * as JPEG at `jpegQuality`, since quality compression only helps lossy
 * formats.
 */
export function compressImage(file: File, maxDimension = 400, jpegQuality = 0.82): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Gagal membaca file gambar.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Gagal memuat gambar — pastikan file yang dipilih adalah gambar.'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas tidak didukung browser ini.'));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = file.type === 'image/png'
          ? canvas.toDataURL('image/png')
          : canvas.toDataURL('image/jpeg', jpegQuality);
        resolve(dataUrl);
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
}
