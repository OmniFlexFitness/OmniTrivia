import React from 'react';

interface AvatarDisplayProps {
  avatar: string;
  color: string;
  accessory: string;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  className?: string;
}

const AvatarDisplay: React.FC<AvatarDisplayProps> = ({ avatar, color, accessory, size = 'md', className = '' }) => {
  const sizeClasses = {
    sm: 'w-8 h-8 text-lg',
    md: 'w-12 h-12 text-2xl',
    lg: 'w-16 h-16 text-4xl',
    xl: 'w-24 h-24 text-5xl',
    '2xl': 'w-32 h-32 text-7xl'
  };

  return (
    <div className={`relative rounded-full flex items-center justify-center border-2 border-white/20 shadow-lg shrink-0 ${color} ${sizeClasses[size]} ${className}`}>
      <span className="relative z-10 select-none">{avatar}</span>
      {accessory && (
        <span className="absolute -top-1 -right-1 z-20 text-[0.5em] filter drop-shadow-md transform rotate-12 select-none">
          {accessory}
        </span>
      )}
    </div>
  );
};

export default AvatarDisplay;