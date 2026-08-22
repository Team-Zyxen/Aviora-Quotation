/**
 * Helper to download array of records as a clean CSV file in the browser.
 * Prefixes UTF-8 BOM (\uFEFF) so Excel, Google Sheets, & Numbers open with perfect character encoding.
 */
export function exportToCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  if (typeof window === 'undefined') return

  const csvContent = [
    headers.map((h) => `"${String(h).replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) =>
      row
        .map((cell) => {
          const str = cell === null || cell === undefined ? '' : String(cell)
          return `"${str.replace(/"/g, '""')}"`
        })
        .join(',')
    ),
  ].join('\n')

  // Add \uFEFF UTF-8 Byte Order Mark (BOM) so Excel reads CSV in UTF-8 mode without garbled characters
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `${filename.replace(/\.csv$/, '')}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  setTimeout(() => URL.revokeObjectURL(url), 100)
}
