import { useEffect } from 'react';

// Forces Chrome to repaint the tab favicon on theme change.
// Chrome ignores href changes on <link rel="icon"> — even when the element
// is removed and re-added. Loading the image through a canvas and exporting
// it as a data URI is the only reliable way to make Chrome repaint the tab.
export default function useFavicon() {
  useEffect(() => {
    const LIGHT = '/favicon-light.png';
    const DARK = '/favicon-dark.png';

    const applyViaCanvas = (src) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);

        document
          .querySelectorAll("link[rel='icon'], link[rel='shortcut icon']")
          .forEach((el) => el.remove());

        const link = document.createElement('link');
        link.rel = 'icon';
        link.type = 'image/png';
        link.href = canvas.toDataURL('image/png');
        document.head.appendChild(link);
      };
      img.src = `${src}?t=${Date.now()}`;
    };

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    applyViaCanvas(mq.matches ? DARK : LIGHT);

    const handler = (e) => applyViaCanvas(e.matches ? DARK : LIGHT);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
}
