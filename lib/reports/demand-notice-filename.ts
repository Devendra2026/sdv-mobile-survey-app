/** Build a safe bulk-export filename for demand notice PDFs. */

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function buildBulkDemandNoticeFilename(args: { ulbName?: string; wardNo?: string }): string {
  const parts = ['demand-notices'];
  if (args.ulbName?.trim()) parts.push(slugify(args.ulbName));
  if (args.wardNo?.trim()) parts.push(`ward-${slugify(args.wardNo)}`);
  parts.push(new Date().toISOString().slice(0, 10));
  return `${parts.join('-')}.pdf`;
}
