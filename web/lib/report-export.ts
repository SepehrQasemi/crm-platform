type DashboardExportPayload = {
  range: "7d" | "30d" | "90d";
  kpis: {
    totalLeads: number;
    wonLeads: number;
    lostLeads: number;
    conversionRate: number;
    pipelineValue: number;
    weightedPipelineValue?: number;
    overdueTasks: number;
    dueSoonTasks: number;
    emailsSent: number;
    emailOpenRate: number;
    emailClickRate: number;
  };
  stageMetrics: Array<{
    stageId: string;
    stageName: string;
    count: number;
    value: number;
  }>;
  leadsBySource: Array<{ source: string; count: number }>;
  leaderboard: Array<{ userId: string; name: string; amount: number }>;
};

function escapeCsvValue(value: string | number) {
  const text = String(value ?? "");
  if (/[,"\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildDashboardCsvReport(payload: DashboardExportPayload) {
  const lines: string[] = [];
  const generatedAt = new Date().toISOString();

  lines.push("Section,Key,Value");
  lines.push(`meta,generated_at,${escapeCsvValue(generatedAt)}`);
  lines.push(`meta,range,${escapeCsvValue(payload.range)}`);
  lines.push("");

  lines.push("KPI,Value");
  lines.push(`total_leads,${payload.kpis.totalLeads}`);
  lines.push(`won_leads,${payload.kpis.wonLeads}`);
  lines.push(`lost_leads,${payload.kpis.lostLeads}`);
  lines.push(`conversion_rate_percent,${payload.kpis.conversionRate}`);
  lines.push(`pipeline_value,${payload.kpis.pipelineValue}`);
  lines.push(`weighted_pipeline_value,${payload.kpis.weightedPipelineValue ?? 0}`);
  lines.push(`overdue_tasks,${payload.kpis.overdueTasks}`);
  lines.push(`due_soon_tasks,${payload.kpis.dueSoonTasks}`);
  lines.push(`emails_sent,${payload.kpis.emailsSent}`);
  lines.push(`email_open_rate_percent,${payload.kpis.emailOpenRate}`);
  lines.push(`email_click_rate_percent,${payload.kpis.emailClickRate}`);
  lines.push("");

  lines.push("Stage,Lead Count,Stage Value");
  for (const stage of payload.stageMetrics) {
    lines.push(
      `${escapeCsvValue(stage.stageName)},${escapeCsvValue(stage.count)},${escapeCsvValue(stage.value)}`,
    );
  }
  lines.push("");

  lines.push("Lead Source,Count");
  for (const source of payload.leadsBySource) {
    lines.push(`${escapeCsvValue(source.source)},${escapeCsvValue(source.count)}`);
  }
  lines.push("");

  lines.push("Sales Rep,Amount");
  for (const entry of payload.leaderboard) {
    lines.push(`${escapeCsvValue(entry.name)},${escapeCsvValue(entry.amount)}`);
  }

  return lines.join("\n");
}

function escapePdfText(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function buildPdfBufferFromLines(lines: string[]) {
  const truncatedLines = lines.slice(0, 48);
  if (lines.length > 48) {
    truncatedLines.push("... report truncated for one-page PDF export");
  }

  const textLines = truncatedLines.map((line, index) => {
    const safe = escapePdfText(line);
    if (index === 0) return `(${safe}) Tj`;
    return `T* (${safe}) Tj`;
  });

  const contentStream = [
    "BT",
    "/F1 11 Tf",
    "50 760 Td",
    "14 TL",
    ...textLines,
    "ET",
  ].join("\n");

  const objects: string[] = [];
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [3 0 R] /Count 1 >>";
  objects[3] =
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>";
  objects[4] = `<< /Length ${Buffer.byteLength(contentStream, "utf8")} >>\nstream\n${contentStream}\nendstream`;
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 1; i <= 5; i += 1) {
    offsets[i] = Buffer.byteLength(pdf, "utf8");
    pdf += `${i} 0 obj\n${objects[i]}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "utf8");
  pdf += "xref\n0 6\n";
  pdf += "0000000000 65535 f \n";
  for (let i = 1; i <= 5; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += "trailer\n<< /Size 6 /Root 1 0 R >>\n";
  pdf += `startxref\n${xrefOffset}\n%%EOF`;

  return Buffer.from(pdf, "utf8");
}

export function buildDashboardPdfReport(payload: DashboardExportPayload) {
  const lines: string[] = [
    "CRM Platform - Dashboard Report",
    `Generated at: ${new Date().toISOString()}`,
    `Range: ${payload.range}`,
    "",
    "KPI Summary",
    `Total leads: ${payload.kpis.totalLeads}`,
    `Won / Lost: ${payload.kpis.wonLeads} / ${payload.kpis.lostLeads}`,
    `Conversion rate: ${payload.kpis.conversionRate}%`,
    `Pipeline value: ${payload.kpis.pipelineValue} EUR`,
    `Weighted pipeline value: ${payload.kpis.weightedPipelineValue ?? 0} EUR`,
    `Overdue tasks: ${payload.kpis.overdueTasks}`,
    `Due soon tasks: ${payload.kpis.dueSoonTasks}`,
    `Sent emails: ${payload.kpis.emailsSent}`,
    `Email open rate: ${payload.kpis.emailOpenRate}%`,
    `Email click rate: ${payload.kpis.emailClickRate}%`,
    "",
    "Pipeline Stages",
    ...payload.stageMetrics.map(
      (stage) => `${stage.stageName}: ${stage.count} leads, ${stage.value} EUR`,
    ),
    "",
    "Leads by Source",
    ...payload.leadsBySource.map((entry) => `${entry.source}: ${entry.count}`),
    "",
    "Leaderboard",
    ...payload.leaderboard.map((entry) => `${entry.name}: ${entry.amount} EUR`),
  ];

  return buildPdfBufferFromLines(lines);
}
