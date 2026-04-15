import { getDefaultClassNames, DayPicker } from 'react-day-picker';
import type { DayPickerProps } from 'react-day-picker';
import { cn } from '@/lib/utils';

export type CalendarProps = DayPickerProps;

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
    const defaultClassNames = getDefaultClassNames();

    return (
        <DayPicker
            showOutsideDays={showOutsideDays}
            className={cn('p-3', className)}
            classNames={{
                ...defaultClassNames,
                root: cn(defaultClassNames.root, 'w-full font-sans text-sm'),
                months: cn(defaultClassNames.months, 'relative'),
                month_caption: cn(defaultClassNames.month_caption, 'flex justify-center items-center mb-2 h-7'),
                caption_label: cn(defaultClassNames.caption_label, 'text-sm font-semibold text-slate-900 dark:text-white'),
                nav: cn(defaultClassNames.nav, 'absolute inset-x-0 top-0 flex justify-between px-1'),
                button_previous: cn(
                    defaultClassNames.button_previous,
                    'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 opacity-70 hover:opacity-100 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-opacity disabled:pointer-events-none',
                ),
                button_next: cn(
                    defaultClassNames.button_next,
                    'inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 opacity-70 hover:opacity-100 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-opacity disabled:pointer-events-none',
                ),
                month_grid: cn(defaultClassNames.month_grid, 'w-full border-collapse'),
                weekdays: cn(defaultClassNames.weekdays, ''),
                weekday: cn(defaultClassNames.weekday, 'w-9 text-center text-[0.75rem] font-normal text-slate-400 dark:text-slate-500 pb-1'),
                week: cn(defaultClassNames.week, ''),
                day: cn(defaultClassNames.day, 'relative p-0 text-center'),
                day_button: cn(
                    defaultClassNames.day_button,
                    'h-9 w-9 rounded-md text-sm font-normal text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary/40',
                ),
                selected: cn(
                    defaultClassNames.selected,
                    '[&>button]:bg-primary [&>button]:text-white [&>button]:hover:bg-primary/90 [&>button]:font-semibold',
                ),
                today: cn(
                    defaultClassNames.today,
                    '[&>button]:border [&>button]:border-primary/50 [&>button]:text-primary [&>button]:font-semibold dark:[&>button]:text-primary',
                ),
                outside: cn(defaultClassNames.outside, '[&>button]:text-slate-300 dark:[&>button]:text-slate-600 [&>button]:opacity-50'),
                disabled: cn(defaultClassNames.disabled, '[&>button]:text-slate-300 dark:[&>button]:text-slate-600 [&>button]:opacity-40 [&>button]:cursor-not-allowed [&>button]:hover:bg-transparent'),
                chevron: cn(defaultClassNames.chevron, 'h-4 w-4 fill-current'),
                ...classNames,
            }}
            {...props}
        />
    );
}

export { Calendar };
