import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { format } from "date-fns";

type Report = {
  id: string;
  type: string;
  data: Record<string, any>;
  ai_summary?: string | null;
  created_at: string;
};
type Campaign = {
  id: string;
  name: string;
  university_name: string;
  client_country?: string | null;
  type: string;
  status: string;
  objectives?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  paid_budget?: number | null;
};
type Attachment = { id: string; file_name: string; url: string };

export async function exportCampaignPdf(campaign: Campaign, reports: Report[], attachments: Record<string, Attachment[]>) {
  const doc = new jsPDF();
  doc.setFontSize(20);
  doc.text(campaign.name, 14, 20);
  doc.setFontSize(11);
  doc.setTextColor(110);
  doc.text(`${campaign.university_name}${campaign.client_country ? " · " + campaign.client_country : ""}`, 14, 28);
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 36,
    theme: "plain",
    styles: { fontSize: 9 },
    body: [
      ["Type", campaign.type],
      ["Status", campaign.status],
      ["Window", `${campaign.start_date ?? "—"} → ${campaign.end_date ?? "—"}`],
      ["Budget", campaign.paid_budget ? `$${Number(campaign.paid_budget).toLocaleString()}` : "—"],
      ["Objectives", campaign.objectives ?? "—"],
    ],
  });

  for (const r of reports) {
    doc.addPage();
    doc.setFontSize(14);
    doc.text(`${r.type.toUpperCase()} report`, 14, 18);
    doc.setFontSize(9);
    doc.setTextColor(110);
    doc.text(format(new Date(r.created_at), "PPP"), 14, 24);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 30,
      head: [["Metric", "Value"]],
      body: Object.entries(r.data ?? {}).map(([k, v]) => [k.replaceAll("_", " "), String(v)]),
      headStyles: { fillColor: [30, 30, 30] },
      styles: { fontSize: 9 },
    });

    if (r.ai_summary) {
      const y = (doc as any).lastAutoTable.finalY + 8;
      doc.setFontSize(11);
      doc.text("AI summary", 14, y);
      doc.setFontSize(9);
      const lines = doc.splitTextToSize(r.ai_summary.replace(/[*#]/g, ""), 180);
      doc.text(lines, 14, y + 6);
    }

    const atts = attachments[r.id] ?? [];
    for (const a of atts) {
      try {
        const blob = await (await fetch(a.url)).blob();
        const dataUrl: string = await new Promise((res, rej) => {
          const fr = new FileReader();
          fr.onload = () => res(fr.result as string);
          fr.onerror = rej;
          fr.readAsDataURL(blob);
        });
        doc.addPage();
        doc.setFontSize(10);
        doc.text(a.file_name, 14, 14);
        const fmt = a.file_name.toLowerCase().endsWith(".png") ? "PNG" : "JPEG";
        doc.addImage(dataUrl, fmt, 14, 20, 180, 0);
      } catch {
        // skip broken images
      }
    }
  }

  doc.save(`${campaign.name.replace(/\s+/g, "_")}.pdf`);
}

export function exportCampaignExcel(campaign: Campaign, reports: Report[]) {
  const wb = XLSX.utils.book_new();
  const overview = XLSX.utils.aoa_to_sheet([
    ["Campaign", campaign.name],
    ["Client", campaign.university_name],
    ["Country", campaign.client_country ?? ""],
    ["Type", campaign.type],
    ["Status", campaign.status],
    ["Start", campaign.start_date ?? ""],
    ["End", campaign.end_date ?? ""],
    ["Budget", campaign.paid_budget ?? ""],
    ["Objectives", campaign.objectives ?? ""],
  ]);
  XLSX.utils.book_append_sheet(wb, overview, "Overview");

  const grouped: Record<string, Report[]> = {};
  reports.forEach((r) => {
    (grouped[r.type] ||= []).push(r);
  });
  Object.entries(grouped).forEach(([type, rs]) => {
    const keys = Array.from(new Set(rs.flatMap((r) => Object.keys(r.data ?? {}))));
    const rows = rs.map((r) => ({
      submitted: format(new Date(r.created_at), "yyyy-MM-dd"),
      ...Object.fromEntries(keys.map((k) => [k, r.data?.[k] ?? ""])),
      ai_summary: (r.ai_summary ?? "").replace(/\s+/g, " "),
    }));
    const sheet = XLSX.utils.json_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, sheet, type.slice(0, 28));
  });

  XLSX.writeFile(wb, `${campaign.name.replace(/\s+/g, "_")}.xlsx`);
}
