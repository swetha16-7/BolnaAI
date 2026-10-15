import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDateTime(isoString: string) {
  const d = new Date(isoString);
  const pad = (n: number) => n < 10 ? '0' + n : n;
  
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const date = d.getDate();
  let hours = d.getHours();
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12; // hour 0 should be 12
  
  return `${month}/${date}/${year}, ${hours}:${pad(minutes)}:${pad(seconds)} ${ampm}`;
}
