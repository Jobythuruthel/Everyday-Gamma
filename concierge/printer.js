// Zebra badge printing: raw ZPL over TCP port 9100. No driver needed.
import net from 'node:net';

// ^FH lets any character be sent as _XX hex, so ZPL control characters in names print instead of breaking the label.
export function zplField(text) {
  return String(text ?? '').replace(/[\u0000-\u001f]/g, ' ').replace(/[_^~\\]/g, c => '_' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0'));
}

// 4 x 3 inch badge at 203 dpi (812 x 609 dots).
export function badgeZpl({ name, company, category, code }) {
  return [
    '^XA', '^CI28', '^PW812', '^LL609',
    `^FO40,40^A0N,34,34^FH^FD${zplField(category)}^FS`,
    `^FO40,110^A0N,64,64^FB560,2,0,L^FH^FD${zplField(name)}^FS`,
    `^FO40,270^A0N,36,36^FB560,2,0,L^FH^FD${zplField(company)}^FS`,
    `^FO600,360^BQN,2,6^FH^FDQA,${zplField(code)}^FS`,
    '^FO40,560^A0N,22,22^FDF-8091 CONCIERGE^FS',
    '^PQ1,0,1,Y', '^XZ'
  ].join('\n');
}

export function sendZpl(host, port, zpl, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host, port });
    const fail = err => { socket.destroy(); reject(err); };
    socket.setTimeout(timeoutMs, () => fail(new Error('printer_timeout')));
    socket.on('error', fail);
    socket.on('connect', () => socket.end(Buffer.from(zpl, 'utf8')));
    socket.on('close', hadError => { if (!hadError) resolve(true); });
  });
}
