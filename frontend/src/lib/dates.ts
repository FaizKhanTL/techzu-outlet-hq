export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

/** A yyyy-mm-dd from a date input, as the start of that day in the browser's time zone, in ISO with offset. */
export function startOfDayIso(date: string): string | undefined {
  if (!date) return undefined;
  return new Date(`${date}T00:00:00`).toISOString();
}

/** The day after a yyyy-mm-dd, so a "to" date includes the whole of that day (the API's "to" is exclusive). */
export function endOfDayExclusiveIso(date: string): string | undefined {
  if (!date) return undefined;
  const day = new Date(`${date}T00:00:00`);
  day.setDate(day.getDate() + 1);
  return day.toISOString();
}
