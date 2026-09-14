const BUCKET = 'inbody_images';

function extractObjectPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith(`${BUCKET}/`)) return raw;

  try {
    const url = new URL(raw);
    const markers = [
      `/storage/v1/object/public/${BUCKET}/`,
      `/storage/v1/object/sign/${BUCKET}/`,
      `/storage/v1/object/${BUCKET}/`,
    ];
    for (const marker of markers) {
      const index = url.pathname.indexOf(marker);
      if (index >= 0) {
        return `${BUCKET}/${decodeURIComponent(url.pathname.slice(index + marker.length))}`;
      }
    }
  } catch (error) {
    return '';
  }
  return '';
}

function privateImageUrl(recordId) {
  return recordId ? `/api/inbody-image?id=${encodeURIComponent(recordId)}` : null;
}

module.exports = { BUCKET, extractObjectPath, privateImageUrl };
