import PDFDocument from 'pdfkit';

/** Standard contractual SLA target shown on reports. */
export const SLA_TARGET_PERCENT = 99.9;

export interface SlaReportIncident {
  title: string;
  hostname: string;
  severity: string;
  status: string;
  openedAt: string;
  resolvedAt: string | null;
  durationMinutes: number | null;
}

export interface SlaReportPdfData {
  tenantName: string;
  period: string;
  overallUptimePercent: number;
  totalDowntimeMinutes: number;
  incidentCount: number;
  mttrMinutes: number;
  services: Array<{
    hostname: string;
    uptimePercent: number;
    downtimeMinutes: number;
    incidentCount: number;
  }>;
  incidents: SlaReportIncident[];
  generatedAt: Date;
  generatedBy: string;
}

const COLORS = {
  primary: '#1e3a5f',
  accent: '#2563eb',
  success: '#16a34a',
  danger: '#dc2626',
  warn: '#d97706',
  muted: '#64748b',
  border: '#e2e8f0',
  rowAlt: '#f8fafc',
  white: '#ffffff',
};

function formatPeriodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number);
  if (!year || !month) return period;
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatDateTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return d.toLocaleString('en-US', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function slaStatus(uptime: number): { label: string; color: string } {
  if (uptime >= SLA_TARGET_PERCENT) {
    return { label: 'Met', color: COLORS.success };
  }
  return { label: 'Missed', color: COLORS.danger };
}

function ensureSpace(doc: InstanceType<typeof PDFDocument>, needed: number): void {
  if (doc.y + needed > doc.page.height - 70) {
    doc.addPage();
    drawPageHeader(doc, false);
  }
}

function drawPageHeader(doc: InstanceType<typeof PDFDocument>, isFirst: boolean): void {
  const top = isFirst ? 50 : 40;
  doc
    .save()
    .rect(50, top - 10, doc.page.width - 100, 28)
    .fill(COLORS.primary);
  doc
    .fillColor(COLORS.white)
    .font('Helvetica-Bold')
    .fontSize(isFirst ? 14 : 11)
    .text('MAAS Dashboard Pro — SLA Report', 60, top - 2, {
      width: doc.page.width - 120,
    });
  doc.restore();
  doc.y = top + 28;
  doc.moveDown(0.5);
}

function drawSectionTitle(doc: InstanceType<typeof PDFDocument>, title: string): void {
  ensureSpace(doc, 36);
  doc
    .fillColor(COLORS.primary)
    .font('Helvetica-Bold')
    .fontSize(12)
    .text(title);
  doc
    .moveTo(50, doc.y + 4)
    .lineTo(doc.page.width - 50, doc.y + 4)
    .strokeColor(COLORS.accent)
    .lineWidth(1.5)
    .stroke();
  doc.moveDown(0.8);
}

function drawKpiRow(
  doc: InstanceType<typeof PDFDocument>,
  items: Array<{ label: string; value: string; color?: string }>,
): void {
  ensureSpace(doc, 72);
  const startX = 50;
  const gap = 12;
  const colW = (doc.page.width - 100 - gap * (items.length - 1)) / items.length;
  const y = doc.y;

  items.forEach((item, index) => {
    const x = startX + index * (colW + gap);
    doc
      .roundedRect(x, y, colW, 58, 6)
      .fillAndStroke(COLORS.rowAlt, COLORS.border);
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(8)
      .text(item.label.toUpperCase(), x + 10, y + 10, { width: colW - 20 });
    doc
      .fillColor(item.color ?? COLORS.primary)
      .font('Helvetica-Bold')
      .fontSize(16)
      .text(item.value, x + 10, y + 26, { width: colW - 20 });
  });

  doc.y = y + 68;
}

function drawTable(
  doc: InstanceType<typeof PDFDocument>,
  columns: Array<{ header: string; width: number; align?: 'left' | 'right' | 'center' }>,
  rows: string[][],
): void {
  const tableWidth = doc.page.width - 100;
  const startX = 50;
  const rowHeight = 22;
  const headerHeight = 26;

  const drawHeader = () => {
    ensureSpace(doc, headerHeight + rowHeight);
    const y = doc.y;
    doc.rect(startX, y, tableWidth, headerHeight).fill(COLORS.primary);
    let x = startX;
    doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(9);
    columns.forEach((col) => {
      doc.text(col.header, x + 6, y + 8, {
        width: col.width - 12,
        align: col.align ?? 'left',
      });
      x += col.width;
    });
    doc.y = y + headerHeight;
  };

  drawHeader();

  rows.forEach((row, rowIndex) => {
    if (doc.y + rowHeight > doc.page.height - 70) {
      doc.addPage();
      drawPageHeader(doc, false);
      drawHeader();
    }

    const y = doc.y;
    const fill = rowIndex % 2 === 0 ? COLORS.white : COLORS.rowAlt;
    doc.rect(startX, y, tableWidth, rowHeight).fill(fill);

    let x = startX;
    doc.fillColor('#0f172a').font('Helvetica').fontSize(9);
    row.forEach((cell, colIndex) => {
      const col = columns[colIndex];
      doc.text(cell, x + 6, y + 6, {
        width: col.width - 12,
        align: col.align ?? 'left',
        ellipsis: true,
      });
      x += col.width;
    });

    doc
      .moveTo(startX, y + rowHeight)
      .lineTo(startX + tableWidth, y + rowHeight)
      .strokeColor(COLORS.border)
      .lineWidth(0.5)
      .stroke();

    doc.y = y + rowHeight;
  });

  doc.moveDown(0.6);
}

export function buildSlaPdf(data: SlaReportPdfData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 50, bottom: 60, left: 50, right: 50 },
      bufferPages: true,
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const overallStatus = slaStatus(data.overallUptimePercent);
    const periodLabel = formatPeriodLabel(data.period);

    drawPageHeader(doc, true);

    // Cover metadata
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(10)
      .text(`Generated ${formatDateTime(data.generatedAt)}`, { align: 'right' });
    doc.text(`Prepared by ${data.generatedBy}`, { align: 'right' });
    doc.moveDown(1);

    doc
      .fillColor(COLORS.primary)
      .font('Helvetica-Bold')
      .fontSize(20)
      .text(data.tenantName);
    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(12)
      .text(`Service Level Report — ${periodLabel}`);
    doc.moveDown(1.2);

    drawSectionTitle(doc, 'Executive summary');
    drawKpiRow(doc, [
      {
        label: 'Overall uptime',
        value: `${data.overallUptimePercent.toFixed(2)}%`,
        color: overallStatus.color,
      },
      {
        label: 'Total downtime',
        value: `${data.totalDowntimeMinutes} min`,
      },
      {
        label: 'Incidents',
        value: String(data.incidentCount),
      },
      {
        label: 'MTTR',
        value: `${data.mttrMinutes} min`,
      },
    ]);

    doc
      .fillColor(COLORS.muted)
      .font('Helvetica')
      .fontSize(9)
      .text(
        `SLA target: ${SLA_TARGET_PERCENT}% monthly uptime. Overall status: `,
        { continued: true },
      );
    doc.fillColor(overallStatus.color).font('Helvetica-Bold').text(overallStatus.label);

    drawSectionTitle(doc, 'Per-service availability');

    if (data.services.length === 0) {
      doc
        .fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(10)
        .text('No monitored servers for this tenant in the selected period.');
    } else {
      const tableWidth = doc.page.width - 100;
      drawTable(
        doc,
        [
          { header: 'Server', width: tableWidth * 0.34 },
          { header: 'Uptime %', width: tableWidth * 0.16, align: 'right' },
          { header: 'Downtime', width: tableWidth * 0.16, align: 'right' },
          { header: 'Incidents', width: tableWidth * 0.14, align: 'right' },
          { header: 'SLA', width: tableWidth * 0.2, align: 'center' },
        ],
        data.services.map((service) => {
          const status = slaStatus(service.uptimePercent);
          return [
            service.hostname,
            `${service.uptimePercent.toFixed(2)}%`,
            `${service.downtimeMinutes} min`,
            String(service.incidentCount),
            status.label,
          ];
        }),
      );
    }

    drawSectionTitle(doc, 'Incidents during period');

    if (data.incidents.length === 0) {
      doc
        .fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(10)
        .text('No incidents were opened during this reporting period.');
    } else {
      const tableWidth = doc.page.width - 100;
      drawTable(
        doc,
        [
          { header: 'Opened', width: tableWidth * 0.18 },
          { header: 'Server', width: tableWidth * 0.18 },
          { header: 'Title', width: tableWidth * 0.28 },
          { header: 'Severity', width: tableWidth * 0.12 },
          { header: 'Duration', width: tableWidth * 0.12, align: 'right' },
          { header: 'Status', width: tableWidth * 0.12 },
        ],
        data.incidents.map((incident) => [
          formatDateTime(incident.openedAt).split(',')[0],
          incident.hostname,
          incident.title,
          incident.severity,
          incident.durationMinutes != null
            ? `${incident.durationMinutes} min`
            : '—',
          incident.status,
        ]),
      );
    }

    // Footer page numbers
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .fillColor(COLORS.muted)
        .font('Helvetica')
        .fontSize(8)
        .text(
          `MAAS Dashboard Pro · Confidential · Page ${i - range.start + 1} of ${range.count}`,
          50,
          doc.page.height - 40,
          { align: 'center', width: doc.page.width - 100 },
        );
    }

    doc.end();
  });
}
