import { Info } from 'lucide-react';
import React, { useState } from 'react';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from "./ui/tooltip";

interface InfoTooltipProps {
    message?: string;
    content?: string;
    size?: number;
    maxWidth?: string;
    children?: React.ReactNode;
}

export const InfoTooltip: React.FC<InfoTooltipProps> = ({
    message,
    content,
    size = 14,
    maxWidth = '250px',
    children
}) => {
    const [open, setOpen] = useState(false);
    const tooltipText = message || content;

    const handleClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        setOpen((prev) => !prev);
    };

    return (
        <Tooltip open={open} onOpenChange={setOpen} delayDuration={1000}>
            <TooltipTrigger asChild>
                <span 
                    className="relative inline-flex cursor-pointer transition-opacity hover:opacity-80"
                    onClick={handleClick}
                >
                    {children || <Info size={size} className="text-slate-400 hover:text-slate-500 dark:text-slate-500 dark:hover:text-slate-400 transition-colors" />}
                </span>
            </TooltipTrigger>
            <TooltipContent
                showArrow={false}
                className="p-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl"
                style={{ maxWidth }}
                onPointerDownOutside={() => setOpen(false)}
            >
                <p className="text-[12px] text-slate-800 dark:text-slate-300 text-center leading-relaxed">
                    {tooltipText}
                </p>
            </TooltipContent>
        </Tooltip>
    );
};
