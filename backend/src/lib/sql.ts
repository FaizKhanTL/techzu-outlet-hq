/**
 * Makes text safe to put inside a LIKE / ILIKE pattern: `%`, `_` and the escape character itself match only
 * themselves. Use with `ESCAPE '\'` in the SQL.
 */
export const escapeLike = (value: string) => value.replace(/[\\%_]/g, (char) => `\\${char}`);
