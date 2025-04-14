import React from 'react';
import { cn } from '@/lib/utils'; // Assuming shadcn/ui utility

interface UserIconProps {
  className?: string;
}

// Basic placeholder User Icon component
// TODO: Replace with actual icon (e.g., from lucide-react or an SVG)
const UserIcon: React.FC<UserIconProps> = ({ className }) => {
  return (
    <div
      className={cn(
        'w-6 h-6 rounded-full bg-blue-300 flex items-center justify-center text-blue-800 text-xs font-semibold ml-2 flex-shrink-0', // Example styling - adjust as needed
        className
      )}
      aria-label="User icon"
    >
      {/* Placeholder: Could be initials or a generic icon character */}
      U
    </div>
  );
};

export default UserIcon;
