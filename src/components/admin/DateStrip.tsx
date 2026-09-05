import Link from "next/link";
import { dateToKey, keyToDate, todayKeyART } from "@/lib/format";

const DIAS_CORTO = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES_CORTO = [
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
];

function shiftKey(key: string, days: number): string {
  const d = keyToDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToKey(d);
}

export default function DateStrip({
  selectedKey,
  countByDate,
  basePath,
}: {
  selectedKey: string;
  countByDate: Record<string, number>;
  basePath: string;
}) {
  const todayKey = todayKeyART();
  const days: string[] = [];
  for (let i = -2; i <= 2; i++) days.push(shiftKey(selectedKey, i));

  return (
    <div className="date-strip">
      <div className="date-strip-nav">
        <Link href={`${basePath}?date=${shiftKey(selectedKey, -7)}`} className="date-strip-jump" aria-label="Semana anterior">
          «
        </Link>
        <Link href={`${basePath}?date=${shiftKey(selectedKey, -1)}`} className="date-strip-jump" aria-label="Día anterior">
          ‹
        </Link>
      </div>

      <div className="date-strip-days">
        {days.map((key) => {
          const d = keyToDate(key);
          const isSelected = key === selectedKey;
          const isToday = key === todayKey;
          const count = countByDate[key] || 0;
          return (
            <Link
              key={key}
              href={`${basePath}?date=${key}`}
              className={`date-strip-day${isSelected ? " selected" : ""}${isToday ? " today" : ""}`}
            >
              <span className="date-strip-month">{MESES_CORTO[d.getUTCMonth()]}</span>
              <span className="date-strip-dow">{DIAS_CORTO[d.getUTCDay()]}</span>
              <span className="date-strip-num">{d.getUTCDate()}</span>
              {count > 0 && <span className="date-strip-dot" />}
            </Link>
          );
        })}
      </div>

      <div className="date-strip-nav">
        <Link href={`${basePath}?date=${shiftKey(selectedKey, 1)}`} className="date-strip-jump" aria-label="Día siguiente">
          ›
        </Link>
        <Link href={`${basePath}?date=${shiftKey(selectedKey, 7)}`} className="date-strip-jump" aria-label="Semana siguiente">
          »
        </Link>
      </div>
    </div>
  );
}
