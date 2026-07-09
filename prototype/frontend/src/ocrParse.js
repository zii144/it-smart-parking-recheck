// Best-effort extraction of parking-ticket fields from raw OCR text. OCR output
// is noisy, so every field is optional — whatever can't be found is left blank
// for the inspector to fill in on the 確認 screen. The ticket number is the most
// valuable field (it encodes the issue time that drives the overdue judgement)
// and is also the most OCR-friendly (fixed alphanumeric shape).

function pad(n) {
  return String(n).padStart(2, "0");
}

export function parseTicketText(rawText) {
  const text = rawText || "";
  const upper = text.toUpperCase();

  // Ticket no: Q + 14 alphanumerics. OCR may sprinkle spaces, so match against
  // a whitespace-stripped copy.
  const compact = upper.replace(/\s+/g, "");
  const ticketMatch = compact.match(/Q[0-9A-Z]{14}/);
  const ticket_no = ticketMatch ? ticketMatch[0] : "";

  // Plate: 2–3 letters + 3–4 digits, optional dash (e.g. ABC-1234).
  const plateMatch = upper.match(/[A-Z]{2,3}-?\d{3,4}/);
  const plate_no = plateMatch ? plateMatch[0] : "";

  // Amount: a number tagged with a currency/label cue (avoids grabbing a date).
  const amountMatch = text.match(/(?:NT\$?|\$|金額|應繳|AMOUNT|AMT|FEE)\s*[:：]?\s*([0-9]{2,6})/i);
  const amount = amountMatch ? amountMatch[1] : "";

  const dates = [];
  for (const m of text.matchAll(/(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/g)) {
    dates.push(`${m[1]}-${pad(m[2])}-${pad(m[3])}`);
  }
  const times = [];
  for (const m of text.matchAll(/(\d{1,2}):(\d{2})/g)) {
    times.push(`${pad(m[1])}:${m[2]}`);
  }

  const parking_date = dates[0] || "";
  const due_date = dates[1] || "";
  const start = times[0] || "";
  const end = times[1] || "";

  return {
    ticket_no,
    plate_no,
    amount,
    due_date,
    parking_date,
    parking_start: parking_date && start ? `${parking_date}T${start}:00` : "",
    parking_end: parking_date && end ? `${parking_date}T${end}:00` : "",
  };
}
