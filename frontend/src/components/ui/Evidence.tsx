import { useMemo, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';

const ALLOWED = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_BYTES = 8 * 1024 * 1024;

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EvidenceUpload({
  file,
  onChange,
  hint = 'Add photos showing the ATM issue if available. JPG, PNG or WEBP.',
}: {
  file: File | null;
  onChange: (file: File | null) => void;
  hint?: string;
}) {
  const [error, setError] = useState('');
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);

  function pick(next: File | null) {
    setError('');
    if (!next) {
      onChange(null);
      return;
    }
    if (!ALLOWED.includes(next.type) && !/\.(jpe?g|png|webp)$/i.test(next.name)) {
      setError('Unsupported file type. Use JPG, PNG or WEBP.');
      return;
    }
    if (next.size > MAX_BYTES) {
      setError('File is too large. Maximum size is 8 MB.');
      return;
    }
    onChange(next);
  }

  return (
    <div className="evidence-upload">
      <p className="helper-text">{hint}</p>
      {!file ? (
        <label className="evidence-dropzone">
          <ImagePlus size={22} />
          <strong>Upload Photo</strong>
          <span>Drag and drop or choose a photo</span>
          <input
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            onChange={(event) => pick(event.target.files?.[0] || null)}
          />
        </label>
      ) : (
        <div className="evidence-preview">
          {preview ? <img src={preview} alt={file.name} /> : null}
          <div>
            <strong>{file.name}</strong>
            <small>{formatSize(file.size)}</small>
          </div>
          <button type="button" className="icon-button" aria-label="Remove photo" onClick={() => pick(null)}>
            <X size={16} />
          </button>
        </div>
      )}
      {error ? <div className="form-error">{error}</div> : null}
    </div>
  );
}

export function EvidenceThumb({
  url,
  label = 'Evidence',
  onOpen,
}: {
  url: string | null | undefined;
  label?: string;
  onOpen?: () => void;
}) {
  if (!url) {
    return <p className="empty-inline">No evidence uploaded.</p>;
  }
  const href = url.startsWith('http') || url.startsWith('/') ? url : `/media/${url}`;
  return (
    <button type="button" className="evidence-thumb" onClick={onOpen} title={label}>
      <img src={href} alt={label} loading="lazy" />
    </button>
  );
}

export function EvidenceLightbox({
  url,
  meta,
  onClose,
}: {
  url: string;
  meta?: { filename?: string; uploadedBy?: string; uploadedAt?: string };
  onClose: () => void;
}) {
  const href = url.startsWith('http') || url.startsWith('/') ? url : `/media/${url}`;
  return (
    <div className="lightbox-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="lightbox-panel" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="icon-button lightbox-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        <img src={href} alt={meta?.filename || 'Evidence'} className="lightbox-image" />
        <div className="lightbox-meta">
          {meta?.filename ? <strong>{meta.filename}</strong> : null}
          {meta?.uploadedBy ? <small>Uploaded by {meta.uploadedBy}</small> : null}
          {meta?.uploadedAt ? <small>{new Date(meta.uploadedAt).toLocaleString()}</small> : null}
        </div>
      </div>
    </div>
  );
}
