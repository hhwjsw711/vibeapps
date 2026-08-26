import * as React from "react";
import { CalendarClock, X } from "lucide-react";
import { format, startOfDay } from "date-fns";

import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SimpleSelect } from "@/components/ui/SimpleSelect";

interface DateTimePickerProps {
  value: Date | undefined;
  onChange: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

// Minute steps shown in the minute dropdown
const MINUTE_OPTIONS = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];

// Default delivery time when a day is first picked: next full hour for today,
// 9:00 AM for future days
function defaultTimeFor(day: Date): { hours: number; minutes: number } {
  const now = new Date();
  if (startOfDay(day).getTime() === startOfDay(now).getTime()) {
    return { hours: Math.min(now.getHours() + 1, 23), minutes: 0 };
  }
  return { hours: 9, minutes: 0 };
}

/**
 * Single date and time picker built from the site Calendar, Popover, and
 * SimpleSelect components. Replaces native datetime inputs so scheduling
 * controls match the design system in all three themes.
 */
export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick a date and time",
  disabled,
  className,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);
  const hasValue = Boolean(value);

  // Derive 12-hour parts from the current value for the time dropdowns
  const hour24 = value ? value.getHours() : 9;
  const meridiem: "AM" | "PM" = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  const minuteValue = value
    ? String(Math.floor(value.getMinutes() / 5) * 5).padStart(2, "0")
    : "00";

  const applyTime = (base: Date, h12: number, minutes: number, mer: "AM" | "PM") => {
    const next = new Date(base);
    const h24 = mer === "PM" ? (h12 % 12) + 12 : h12 % 12;
    next.setHours(h24, minutes, 0, 0);
    onChange(next);
  };

  const handleDaySelect = (day: Date | undefined) => {
    if (!day) {
      onChange(undefined);
      return;
    }
    const next = new Date(day);
    if (value) {
      // Keep the previously chosen time when switching days
      next.setHours(value.getHours(), value.getMinutes(), 0, 0);
    } else {
      const { hours, minutes } = defaultTimeFor(day);
      next.setHours(hours, minutes, 0, 0);
    }
    onChange(next);
  };

  const handleClear = (e: React.MouseEvent | React.KeyboardEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onChange(undefined);
  };

  const timeZone =
    Intl.DateTimeFormat().resolvedOptions().timeZone ?? "local time";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label="Pick a date and time"
          className={cn(
            "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-md border border-hairline bg-surface px-3 text-sm transition-colors",
            "hover:bg-surface-hover focus:outline-none focus:ring-1 focus:ring-ink",
            "disabled:cursor-not-allowed disabled:opacity-50",
            hasValue ? "text-ink" : "text-soft",
            className,
          )}
        >
          <CalendarClock className="h-4 w-4 text-soft" />
          {hasValue && value
            ? format(value, "EEE, MMM d, yyyy 'at' h:mm a")
            : placeholder}
          {hasValue && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear scheduled date and time"
              onClick={handleClear}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") handleClear(e);
              }}
              className="ml-1 -mr-1 flex h-5 w-5 items-center justify-center rounded hover:bg-surface-hover"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleDaySelect}
          defaultMonth={value ?? new Date()}
          disabled={{ before: new Date() }}
          classNames={{
            selected:
              "[&>button]:bg-cta [&>button]:text-on-cta [&>button]:font-medium [&>button]:hover:bg-cta",
          }}
        />
        {/* Time row: hour / minute / AM-PM, enabled once a day is chosen */}
        <div className="border-t border-hairline p-3">
          <div className="flex items-center gap-2">
            <SimpleSelect
              aria-label="Hour"
              value={value ? String(hour12) : ""}
              onChange={(h) =>
                value && applyTime(value, Number(h), value.getMinutes(), meridiem)
              }
              options={Array.from({ length: 12 }, (_, i) => ({
                value: String(i + 1),
                label: String(i + 1),
              }))}
              placeholder="--"
              disabled={!value}
              className="h-8 w-[64px]"
            />
            <span className="text-sm text-faint">:</span>
            <SimpleSelect
              aria-label="Minutes"
              value={value ? minuteValue : ""}
              onChange={(m) =>
                value && applyTime(value, hour12, Number(m), meridiem)
              }
              options={MINUTE_OPTIONS.map((m) => ({ value: m, label: m }))}
              placeholder="--"
              disabled={!value}
              className="h-8 w-[68px]"
            />
            <SimpleSelect
              aria-label="AM or PM"
              value={value ? meridiem : ""}
              onChange={(mer) =>
                value &&
                applyTime(value, hour12, value.getMinutes(), mer as "AM" | "PM")
              }
              options={[
                { value: "AM", label: "AM" },
                { value: "PM", label: "PM" },
              ]}
              placeholder="--"
              disabled={!value}
              className="h-8 w-[70px]"
            />
          </div>
          <p className="mt-2 text-xs text-faint">
            {value
              ? `Sends ${format(value, "MMM d 'at' h:mm a")} (${timeZone})`
              : "Pick a day first, then set the time"}
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}
