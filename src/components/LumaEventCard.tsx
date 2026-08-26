import { Calendar, ExternalLink, MapPin } from "lucide-react";
import { formatLumaDateRange } from "../lib/lumaDates";

export type LumaPublicEvent = {
  _id: string;
  name: string;
  url: string;
  coverUrl?: string;
  description?: string;
  location?: string;
  startAt?: number;
  endAt?: number;
  showThumbnail: boolean;
  showName: boolean;
  showDates: boolean;
  showDescription: boolean;
};

export function LumaEventCard({
  event,
  compact = false,
}: {
  event: LumaPublicEvent;
  compact?: boolean;
}) {
  const dates = event.showDates
    ? formatLumaDateRange(event.startAt, event.endAt)
    : null;
  const size = compact ? 108 : 144;

  return (
    <a
      href={event.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-2 rounded-md p-1 -m-1 hover:bg-surface-hover transition-colors"
    >
      {event.showThumbnail && event.coverUrl && (
        <img
          src={event.coverUrl}
          alt=""
          width={size}
          height={size}
          className="rounded-md object-cover border border-hairline bg-surface-alt shrink-0"
          style={{ width: size, height: size }}
          loading="lazy"
          decoding="async"
        />
      )}
      <div className="min-w-0">
        {event.showName && (
          <p className="app-title-sm text-ink group-hover:underline line-clamp-2">
            {event.name}
          </p>
        )}
        {dates && (
          <p className="mt-1 flex items-start gap-1.5 text-[13px] text-soft tabular-nums">
            <Calendar
              className="size-3.5 mt-0.5 shrink-0 text-faint"
              aria-hidden="true"
            />
            <span>{dates}</span>
          </p>
        )}
        {event.location && (
          <p className="mt-0.5 flex items-start gap-1.5 text-[13px] text-soft line-clamp-1">
            <MapPin
              className="size-3.5 mt-0.5 shrink-0 text-faint"
              aria-hidden="true"
            />
            <span>{event.location}</span>
          </p>
        )}
        {event.showDescription && event.description && (
          <p className="text-[13px] text-copy mt-0.5 line-clamp-1">
            {event.description}
          </p>
        )}
        <span className="mt-1 inline-flex items-center gap-1 text-[13px] text-copy group-hover:text-ink">
          View event
          <ExternalLink className="size-3" aria-hidden="true" />
        </span>
      </div>
    </a>
  );
}
