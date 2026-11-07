import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

const KEY_STOP = new Set(["UPI","MMT","IMPS","NEFT","RTGS","INF","INFT","VSI","VIN","BIL","ICI","ICIC","TFR","TRF","FPI","FPO","DD","SO","BP","CHQ","REF","VISA","MASTERCARD","CONTACTLESS","POS","DEB","CR","DR","CARD","PURCHASE","ONLINE","INTL","INTERNATIONAL","THE","TO","MR","MRS","MS","LTD","PVT","PRIV","PRIVATE","LIMITED","HDFC","HDFCBANK","IDFB","IDFC","UTIB","AXIS","AXISBANK","BARB","CNRB","BKID","KKBK","SBIN","PUNB","PTHD","PTYE","PTY","PTA","PTSB","YBL","OKA","OKBI","OKICICI","OKHDFCBANK","OKAXIS","OKSBI","RBA","PPPL","IBL","AXL","PAYTM","APL","ICICI","BANK","INDIAN","INDUSIND","OF","AND"]);

/** Stable merchant key: uppercase words without digits, transaction/bank codes removed, first 3 tokens. */
export function normalizeMerchantKey(description: string): string {
  const tokens = description
    .toUpperCase()
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length > 1 && !/\d/.test(t) && !KEY_STOP.has(t));
  return tokens.slice(0, 3).join(" ");
}

export function titleCase(s: string) {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function pct(part: number, whole: number) {
  if (!whole) return 0;
  return Math.round((part / whole) * 1000) / 10;
}
