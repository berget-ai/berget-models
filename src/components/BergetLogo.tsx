import React from 'react';
import { cn } from '@/lib/utils';

interface BergetLogoProps {
  size?: 'sm' | 'md' | 'lg' | number;
  inverted?: boolean;
  variant?: 'icon' | 'full' | 'horizontal';
  withText?: boolean;
  backgroundColor?: string;
  className?: string;
}

const BergetLogo: React.FC<BergetLogoProps> = ({
  size = 'md',
  inverted = false,
  variant = 'icon',
  withText = false,
  backgroundColor,
  className
}) => {
  const getSizeValue = () => {
    if (typeof size === 'number') return size;
    switch (size) {
      case 'sm': return 32;
      case 'md': return 64;
      case 'lg': return 128;
      default: return 64;
    }
  };

  const sizeValue = getSizeValue();
  const iconColor = inverted ? '#FFFFFF' : '#1A1A1A';

  // Berget AI Logo SVG - simplified mountain/triangle icon
  const LogoIcon = () => (
    <svg
      width={sizeValue}
      height={sizeValue}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("transition-all duration-300", className)}
      style={{ backgroundColor }}
    >
      {/* Mountain/Peak shape representing "Berget" (Mountain in Swedish) */}
      <path
        d="M32 8L52 48H12L32 8Z"
        fill={iconColor}
        fillRule="evenodd"
        clipRule="evenodd"
      />
      {/* AI circuit pattern overlay */}
      <path
        d="M32 16L24 32H40L32 16Z"
        fill={inverted ? '#52B788' : '#74C69D'}
        opacity="0.8"
      />
      <circle
        cx="32"
        cy="24"
        r="2"
        fill={inverted ? '#74C69D' : '#52B788'}
      />
      <path
        d="M28 28H36M30 32H34"
        stroke={iconColor}
        strokeWidth="1"
        opacity="0.6"
      />
    </svg>
  );

  const LogoWithText = () => (
    <div className={cn("flex items-center gap-3", className)}>
      <LogoIcon />
      <div className="flex flex-col">
        <span 
          className="font-inter font-semibold tracking-tight"
          style={{ 
            color: iconColor,
            fontSize: sizeValue * 0.25
          }}
        >
          Berget AI
        </span>
        {variant === 'full' && (
          <span 
            className="font-inter font-normal opacity-80"
            style={{ 
              color: iconColor,
              fontSize: sizeValue * 0.15
            }}
          >
            AI Solutions
          </span>
        )}
      </div>
    </div>
  );

  if (withText || variant === 'full' || variant === 'horizontal') {
    return <LogoWithText />;
  }

  return <LogoIcon />;
};

export default BergetLogo;