import type { ReactNode } from 'react';

export function Panel({
  title,
  subtitle,
  icon,
  action,
  tone,
  className,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
  tone?: 'danger' | 'warning' | 'success' | 'info';
  className?: string;
  children: ReactNode;
}) {
  return (
    <article className={`panel ${tone ? `panel-tone-${tone}` : ''} ${className || ''}`}>
      {title || action ? (
        <div className="panel-header">
          <div>
            {title ? (
              <h2>
                {icon ? <span className="panel-icon">{icon}</span> : null}
                {title}
              </h2>
            ) : null}
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          {action ? <div className="panel-actions">{action}</div> : null}
        </div>
      ) : null}
      {children}
    </article>
  );
}