import React from 'react';

interface LogoProps {
  className?: string;
}

export const Logo: React.FC<LogoProps> = ({ className = "w-6 h-6" }) => {
  return (
    <img 
      src="components/Logo.ico" 
      alt="Eduvane AI" 
      className={`${className} object-contain`} 
    />
  );
};