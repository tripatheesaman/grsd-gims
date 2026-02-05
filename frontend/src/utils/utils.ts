import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}
export const processItemName = (name: string) => {
    if (name.includes(',')) {
        return name.split(',')[0].trim();
    }
    return name;
};
