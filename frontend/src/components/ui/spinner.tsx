'use client';
import { cn } from "@/utils/utils";
interface SpinnerProps {
    size?: 'sm' | 'md' | 'lg';
    variant?: 'primary' | 'secondary' | 'white';
    className?: string;
}
export function Spinner({ size = 'md', variant = 'primary', className }: SpinnerProps) {
    const sizeClasses = {
        sm: 'h-4 w-4',
        md: 'h-8 w-8',
        lg: 'h-12 w-12'
    };
    const variantClasses = {
        primary: 'border-[#003594] border-t-[#d2293b]',
        secondary: 'border-gray-200 border-t-gray-600',
        white: 'border-white/20 border-t-white'
    };
    return (<div className={cn('animate-spin rounded-full border-2 border-t-transparent', sizeClasses[size], variantClasses[variant], className)}/>);
}
export function FullPageSpinner() {
    return (<div className="fixed inset-0 flex items-center justify-center bg-white/80 z-50">
      <Spinner size="lg"/>
    </div>);
}
export function ContentSpinner() {
    return (<div className="flex items-center justify-center py-12">
      <Spinner size="lg"/>
    </div>);
}
