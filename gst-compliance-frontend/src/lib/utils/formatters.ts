import { format } from "date-fns";

export function formatDate(dateValue: string) {
  return format(new Date(dateValue), "dd MMM yyyy");
}

export function initialsFromName(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
