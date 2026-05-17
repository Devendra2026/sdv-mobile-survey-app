export function timeAgo(iso: string | number | Date): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hr ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} day${day === 1 ? '' : 's'} ago`;
  const wk = Math.floor(day / 7);
  if (wk < 4) return `${wk} week${wk === 1 ? '' : 's'} ago`;
  return new Date(iso).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('en-IN').format(n);
}

export function formatArea(sqft: number): string {
  return `${formatNumber(Math.round(sqft))} sq ft`;
}

export function capitalize(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1);
}

export function humanizeRole(role?: string): string {
  if (!role) return '—';
  return capitalize(role.replace(/_/g, ' '));
}

export function humanizeUlbBodyType(bodyType?: string): string {
  if (!bodyType) return '—';
  const labels: Record<string, string> = {
    municipal_council: 'Municipal Council',
    town_panchayat: 'Town Panchayat',
    nagar_palika: 'Nagar Palika',
    mahanagar: 'Mahanagar',
  };
  return labels[bodyType] ?? humanizeRole(bodyType);
}
