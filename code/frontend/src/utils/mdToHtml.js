// Small markdown-to-HTML renderer for report.md (headings, tables, lists, bold, italics, code).
// Everything is HTML-escaped first, so report text can never inject markup into the PDF window.

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function inline(text) {
  return escapeHtml(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s).,]|$)/g, '$1<em>$2</em>');
}

function splitRow(line) {
  return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

const isTableSep = (line) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line);

export function mdToHtml(markdown) {
  const lines = String(markdown || '').split('\n');
  const out = [];
  let i = 0;
  let listDepth = 0;

  const closeLists = () => {
    while (listDepth > 0) { out.push('</ul>'); listDepth -= 1; }
  };

  while (i < lines.length) {
    const line = lines[i];

    if (line.trim().startsWith('|') && i + 1 < lines.length && isTableSep(lines[i + 1])) {
      closeLists();
      const head = splitRow(line);
      out.push('<table><thead><tr>' + head.map((c) => `<th>${inline(c)}</th>`).join('') + '</tr></thead><tbody>');
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        out.push('<tr>' + splitRow(lines[i]).map((c) => `<td>${inline(c)}</td>`).join('') + '</tr>');
        i += 1;
      }
      out.push('</tbody></table>');
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      closeLists();
      const level = Math.min(heading[1].length + 1, 5); // report "##" becomes <h3> inside the PDF
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }

    const bullet = line.match(/^(\s*)-\s+(.*)$/);
    if (bullet) {
      const depth = Math.floor(bullet[1].length / 2) + 1;
      while (listDepth < depth) { out.push('<ul>'); listDepth += 1; }
      while (listDepth > depth) { out.push('</ul>'); listDepth -= 1; }
      out.push(`<li>${inline(bullet[2])}</li>`);
      i += 1;
      continue;
    }

    if (line.trim() === '') {
      closeLists();
      i += 1;
      continue;
    }

    closeLists();
    out.push(`<p>${inline(line)}</p>`);
    i += 1;
  }
  closeLists();
  return out.join('\n');
}

// The part of report.md under one "## Heading", without the heading line itself.
export function reportSection(markdown, heading) {
  const lines = String(markdown || '').split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (start < 0) return '';
  let end = lines.findIndex((l, idx) => idx > start && /^## /.test(l));
  if (end < 0) end = lines.length;
  return lines.slice(start + 1, end).join('\n').trim();
}
