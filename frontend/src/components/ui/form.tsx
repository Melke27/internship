import {
  useEffect,
  type ButtonHTMLAttributes,
  type FormEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';

export function cx(...parts: Array<string | false | null | undefined | number>) {
  return parts.filter(Boolean).join(' ');
}

/* ─────────────────────────── Form field system ─────────────────────────── */

interface FieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactNode;
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  return (
    <label className={cx('form-field', error && 'has-error', className)}>
      {label ? (
        <span className="form-label">
          {label}
          {required ? <em className="req-dot" aria-hidden /> : null}
        </span>
      ) : null}
      {children}
      {hint ? <span className="form-hint">{hint}</span> : null}
      {error ? <span className="form-error-text" role="alert">{error}</span> : null}
    </label>
  );
}

interface CheckFieldProps {
  label?: ReactNode;
  hint?: ReactNode;
  className?: string;
  children: ReactNode;
}

export function CheckField({ label, hint, className, children }: CheckFieldProps) {
  return (
    <label className={cx('check-field', className)}>
      <span className="check-node">{children}</span>
      {label ? <span className="check-copy"><strong>{label}</strong>{hint ? <small>{hint}</small> : null}</span> : null}
    </label>
  );
}

export function TextInput({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('form-input', className)} {...props} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('form-input', 'form-textarea', className)} {...props} />;
}

export function SelectInput({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('form-input', 'form-select', className)} {...props} />;
}

interface FormGridProps extends HTMLAttributes<HTMLDivElement> {
  cols?: number;
}

export function FormGrid({ cols, className, style, ...props }: FormGridProps) {
  return (
    <div
      className={cx('form-grid', className)}
      style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : style}
      {...props}
    />
  );
}

/* ───────────────────────────── Dialog / Modal ──────────────────────────── */

interface DialogProps {
  title: ReactNode;
  kicker?: ReactNode;
  description?: ReactNode;
  onClose: () => void;
  onSubmit?: (event: FormEvent<HTMLFormElement>) => void;
  footer?: ReactNode;
  children?: ReactNode;
  wide?: boolean;
  className?: string;
}

export function Dialog({
  title,
  kicker,
  description,
  onClose,
  onSubmit,
  footer,
  children,
  wide,
  className,
}: DialogProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const panelClass = cx('dialog-panel', wide && 'dialog-wide', className);
  const content = (
    <>
      <header className="dialog-header">
        <div>
          {kicker ? <p className="dialog-kicker">{kicker}</p> : null}
          <h2>{title}</h2>
          {description ? <p className="dialog-description">{description}</p> : null}
        </div>
        <button type="button" className="icon-button dialog-close" onClick={onClose} aria-label="Close dialog">
          ×
        </button>
      </header>
      {children ? <div className="dialog-body">{children}</div> : null}
      {footer ? <footer className="dialog-footer">{footer}</footer> : null}
    </>
  );

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      {onSubmit ? (
        <form
          className={panelClass}
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
          onSubmit={onSubmit}
        >
          {content}
        </form>
      ) : (
        <div
          className={panelClass}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dialog-title"
          onClick={(event) => event.stopPropagation()}
        >
          {content}
        </div>
      )}
    </div>
  );
}

interface DiffFooterProps {
  cancelLabel?: string;
  submitLabel: string;
  onCancel: () => void;
  submitDisabled?: boolean;
  submitting?: boolean;
  submittingLabel?: string;
  danger?: boolean;
}

export function DialogFooterActions({
  cancelLabel = 'Cancel',
  submitLabel,
  onCancel,
  submitDisabled,
  submitting,
  submittingLabel,
  danger,
}: DiffFooterProps) {
  return (
    <>
      <button type="button" className="button secondary" onClick={onCancel}>
        {cancelLabel}
      </button>
      <button className={cx('button', danger ? 'danger' : 'primary')} disabled={submitting || submitDisabled}>
        {submitting ? submittingLabel || `${submitLabel}…` : submitLabel}
      </button>
    </>
  );
}

/* ──────────────────────────── Confirmation ─────────────────────────────── */

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'warning';
  confirming?: boolean;
  confirmPendingLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
  children?: ReactNode;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  tone = 'danger',
  confirming,
  confirmPendingLabel,
  onConfirm,
  onClose,
  children,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <Dialog
      title={title}
      onClose={() => { if (!confirming) onClose(); }}
      footer={
        <button type="button" className={cx('button', tone === 'danger' ? 'danger' : 'primary')} onClick={onConfirm} disabled={confirming}>
          {confirming ? confirmPendingLabel || `${confirmLabel}…` : confirmLabel}
        </button>
      }
    >
      {description ? <p className="confirm-text">{description}</p> : null}
      {children}
    </Dialog>
  );
}

/* ─────────────────────────────── Buttons ───────────────────────────────── */

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';

interface AppButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: 'sm' | 'md';
}

export function AppButton({ variant = 'primary', size = 'md', className, ...props }: AppButtonProps) {
  return <button className={cx('app-btn', `app-btn-${variant}`, `app-btn-${size}`, className)} {...props} />;
}