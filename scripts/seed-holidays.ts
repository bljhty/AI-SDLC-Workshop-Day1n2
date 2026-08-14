// Seeds Singapore public holidays. Run with `npm run seed:holidays`.
//
// Fixed-date holidays (New Year's Day, Labour Day, National Day, Christmas)
// are exact. Lunar/lunisolar-dependent holidays (Chinese New Year, Hari Raya
// Puasa, Hari Raya Haji, Vesak Day, Deepavali) are best-effort for a demo
// seed — verify against the official MOM gazette before relying on them.
import { holidayDB } from "../lib/db";

const HOLIDAYS: { date: string; name: string }[] = [
  // 2025
  { date: "2025-01-01", name: "New Year's Day" },
  { date: "2025-01-29", name: "Chinese New Year" },
  { date: "2025-01-30", name: "Chinese New Year (Day 2)" },
  { date: "2025-03-31", name: "Hari Raya Puasa" },
  { date: "2025-04-18", name: "Good Friday" },
  { date: "2025-05-01", name: "Labour Day" },
  { date: "2025-05-12", name: "Vesak Day" },
  { date: "2025-06-07", name: "Hari Raya Haji" },
  { date: "2025-08-09", name: "National Day" },
  { date: "2025-10-20", name: "Deepavali" },
  { date: "2025-12-25", name: "Christmas Day" },

  // 2026
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-02-17", name: "Chinese New Year" },
  { date: "2026-02-18", name: "Chinese New Year (Day 2)" },
  { date: "2026-03-20", name: "Hari Raya Puasa" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-05-01", name: "Labour Day" },
  { date: "2026-05-25", name: "Vesak Day (observed)" },
  { date: "2026-05-27", name: "Hari Raya Haji" },
  { date: "2026-08-09", name: "National Day" },
  { date: "2026-08-10", name: "National Day (observed)" },
  { date: "2026-11-09", name: "Deepavali (observed)" },
  { date: "2026-12-25", name: "Christmas Day" },
];

holidayDB.bulkInsert(HOLIDAYS);
console.log(`Seeded ${HOLIDAYS.length} holidays.`);
