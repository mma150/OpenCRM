// Sentences the route files of the four record types share in their OpenAPI descriptions,
// so the custom field filters and the CSV exports are described once.

export const CUSTOM_FIELD_FILTERS =
  "Custom field filters go in the query string beside the others, named after the field's id: cf.<field id>=text for a TEXT field (contains, whatever the case) or a DROPDOWN field (is exactly that option), cf.<field id>.min and cf.<field id>.max for a NUMBER field, cf.<field id>.from and cf.<field id>.to (days such as 2026-11-15) for a DATE field; all bounds are inclusive. A record without a value never matches. An id that is not a custom field in use of this record type, a form that does not fit the field's type, or a bad value is VALIDATION_FAILED naming the parameter; a parameter sent empty is ignored.";

export const CSV_EXPORT =
  "The list itself as a file: the same search, filters (custom field filters included), sort and visibility, without paging (page and pageSize are ignored). Every role that can see the list can export it. UTF-8 with a byte order mark, one header row, CRLF line ends. Times are written as YYYY-MM-DD HH:mm in the time zone tz (UTC when left out), and the file is named after the viewer's today. At most 10,000 rows: a longer list is cut off there, in the sort order asked for, and X-Export-Truncated is true. A text cell that starts with =, +, -, @, a tab or a carriage return gets a leading apostrophe, so no spreadsheet runs it as a formula.";
