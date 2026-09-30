// xls-loader.js
// Reads the "Informe de fabricaciones" report and turns it into clean ticket objects.
// Depends on SheetJS (xlsx.full.min.js) being loaded BEFORE this file.
// Exposes a single global function: loadTicketData(file, onLoaded, onError)

(function () {
  const HEADER_MARKER = 'Código'; // first column of the real header row; also used to spot repeated headers from page breaks

  function toNumber(value) {
    if (value === undefined || value === null || value === '') return null;
    const n = Number(value);
    return isNaN(n) ? null : n;
  }

  function parseWorkbookToTickets(workbook) {
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // header:1 -> array of arrays instead of auto-guessed objects, so WE decide where the header row is
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' });

    let headerRowIndex = -1;
    let headers = [];
    const tickets = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const firstCell = String(row[0] || '').trim();

      // First time we see "Código" -> that's the real header row.
      // Every later time we see it -> it's a repeated header from a page break. Skip it, don't parse it as data.
      if (firstCell === HEADER_MARKER) {
        if (headerRowIndex === -1) {
          headerRowIndex = i;
          headers = row.map(h => String(h || '').trim());
        }
        continue;
      }

      if (headerRowIndex === -1) continue; // still inside the title/date block above the table
      if (row.every(cell => String(cell || '').trim() === '')) continue; // blank spacer row

      const get = (headerName) => {
        const idx = headers.indexOf(headerName);
        return idx === -1 ? '' : row[idx];
      };

      tickets.push({
        codigo: String(get('Código') || '').trim(),
        descripcion: String(get('Descripción') || '').trim(),
        cliente: String(get('Cliente') || '').trim(),
        articulo: String(get('Artículo') || '').trim(),
        fecha: get('Fecha'),
        fechaEntrega: get('Fecha entrega'),
        cantidad: toNumber(get('Cantidad')),
        artsFabricados: toNumber(get('Arts.Fabricados'))
      });
    }

    return tickets;
  }

  function loadTicketData(file, onLoaded, onError) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const tickets = parseWorkbookToTickets(workbook);
        onLoaded(tickets);
      } catch (err) {
        if (onError) onError(err);
        else console.error('Error parsing xls file:', err);
      }
    };
    reader.onerror = (err) => {
      if (onError) onError(err);
    };
    reader.readAsArrayBuffer(file);
  }

  window.loadTicketData = loadTicketData; // exposed for app.js
})();
