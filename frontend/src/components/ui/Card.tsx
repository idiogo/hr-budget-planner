import { ReactNode } from 'react';
import clsx from 'clsx';

interface CardProps {
  children: ReactNode;
  className?: string;
  title?: string;
  action?: ReactNode;
}

export default function Card({ children, className, title, action }: CardProps) {
  return (
    <div className={clsx('bg-white rounded-lg shadow', className)}>
      {(title || action) && (
        <div className="flex items-center justify-between px-4 py-3 border-b">
          {title && <h3 className="text-lg font-medium text-gray-900">{title}</h3>}
          {action}
        </div>
      )}
      <div className="p-4">{children}</div>
    </div>
  );
}
