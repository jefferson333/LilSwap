import { format } from 'date-fns';
import { CalendarIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '@/lib/utils';
import { Button } from './button';
import { Calendar } from './calendar';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

interface DatePickerProps {
    value?: Date;
    onChange?: (date: Date | undefined) => void;
    placeholder?: string;
    disabled?: boolean;
    toDate?: Date;
    className?: string;
}

export function DatePicker({ value, onChange, placeholder = 'Pick a date', disabled, toDate, className }: DatePickerProps) {
    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    className={cn(
                        'w-full justify-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-left text-xs font-normal hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800/60 dark:hover:bg-slate-800',
                        !value ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white',
                        className,
                    )}
                    disabled={disabled}
                >
                    <CalendarIcon className="h-3.5 w-3.5 shrink-0 opacity-70" />
                    {value ? format(value, 'PPP') : <span>{placeholder}</span>}
                </Button>
            </PopoverTrigger>
            <PopoverContent
                className="w-auto p-0 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl rounded-xl overflow-hidden"
                align="start"
            >
                <Calendar
                    mode="single"
                    selected={value}
                    onSelect={onChange}
                    disabled={(date) => date > (toDate ?? new Date()) || date < new Date('2020-01-01')}
                    autoFocus
                />
            </PopoverContent>
        </Popover>
    );
}
