# F-8091 CONCIERGE · Reception, Check-in and Badges

Standalone and offline, with zero npm dependencies (the one vendored browser file is MIT-licensed `qrcode-generator`). Its line: "It knew my name before I spoke."

## Run

```
set ADMIN_PIN=choose-a-pin
set PRINTER_HOST=192.168.1.50      (optional: Zebra on the network)
set HOST_WEBHOOK=https://...       (optional: VIP alerts to your automation tool)
npm start
```

| Screen | URL |
|---|---|
| Kiosk | http://localhost:8091 |
| Staff: VIP arrivals (with a chime), arrivals feed, reprint, CSV import and export, print queue | http://localhost:8091/admin.html |

`start-concierge.bat` asks for the PIN and printer IP, then opens Chrome in kiosk mode with silent printing.

## Check-in paths

1. **QR scan.** A USB or Bluetooth 2D scanner in keyboard mode types the code and presses Enter; the scan field always keeps focus. The server-side check-in measured about 1.5 ms. [Certain]
2. **Find me.** The visitor enters an exact email or mobile (matched on the last 8 digits, so +973 and 00973 both work). Nobody can browse the attendee list.
3. **Walk-in.** Name, plus email or mobile. The visitor gets a new 8-character code. Registering the same email twice gives "welcome back", never a duplicate.

The first scan prints one badge; later scans show "welcome back" and don't reprint. Reprints go through staff.

## Printing

- **Zebra (recommended).** Raw ZPL goes to port 9100 with no driver. The badge is 4 × 3 in at 203 dpi, with a QR of the attendee code. Names are hex-escaped (`^FH`), so a name containing `^` or `~` can't corrupt the label.
- **Durable queue.** Jobs are saved first and sent in the background. If the printer is off, jobs wait and retry up to 5 times, then show under "Print failures" with a "Retry" button.
- **No printer set.** The badge opens as a print-ready page (`badge.html`) for any office printer.
- **Arabic names on Zebra** need an Arabic TTF font loaded on the printer; Zebra Setup Utilities does this once. Browser printing handles Arabic already.

## VIP alerts

The staff console chimes and shows the host's name and contact. If `HOST_WEBHOOK` is set, each VIP arrival is also POSTed as JSON (name, company, host, host contact, time) with retries. Point it at Make, Zapier or Power Automate to send WhatsApp, Teams or email.

## Import format

See `sample-attendees.csv`. Columns: `name` (required), `company`, `email`, `mobile`, `category` (ATTENDEE, VIP, SPEAKER, EXHIBITOR, MEDIA, STAFF), `code`, `host_name`, `host_contact`. Re-importing updates people by code or email.

## Tests

`npm test` runs 10 tests. They cover:
- the CSV parser edge cases
- ZPL injection safety
- import and update
- all three check-in paths
- no duplicate badges or alerts
- the print queue's retry and failure path
- **real TCP delivery to a fake Zebra**, and a dead printer keeping jobs queued
- webhook retries
- HTTP round trip under 300 ms
- the staff lock

## Not in this version

Business-card OCR (Tesseract needs a 10 MB+ language download and is unreliable on Arabic cards) and camera QR scanning (Chrome's BarcodeDetector isn't available on Windows). A USB scanner costs less and is faster and more reliable.
