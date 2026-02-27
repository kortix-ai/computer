import React from 'react';
import Image from 'next/image';
import { Plug } from 'lucide-react';

export const AppLogo = ({
  app,
  size = 'md',
}: {
  app: { imgSrc?: string; name: string };
  size?: 'sm' | 'md' | 'lg';
}) => {
  const sizeClasses = {
    sm: 'w-7 h-7 rounded-lg',
    md: 'w-9 h-9 rounded-[10px]',
    lg: 'w-12 h-12 rounded-xl',
  };
  const iconSizes = {
    sm: 'h-3.5 w-3.5',
    md: 'h-5 w-5',
    lg: 'h-6 w-6',
  };

  return (
    <div className={`${sizeClasses[size]} bg-muted/50 border border-border/40 flex items-center justify-center shrink-0 overflow-hidden`}>
      {app.imgSrc ? (
        <Image
          src={app.imgSrc}
          alt={app.name}
          width={size === 'lg' ? 24 : size === 'md' ? 20 : 14}
          height={size === 'lg' ? 24 : size === 'md' ? 20 : 14}
          className={`${iconSizes[size]} object-contain`}
          unoptimized
        />
      ) : (
        <Plug className={`${iconSizes[size]} text-muted-foreground`} />
      )}
    </div>
  );
};
