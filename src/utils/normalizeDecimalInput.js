export const normalizeDecimalInput = (rawValue) => {
    if (rawValue == null) return '';
    const raw = String(rawValue).trim();
    if (raw === '') return '';

    const cleaned = raw.replace(/\s+/g, '').replace(/[^\d.,]/g, '');
    if (cleaned === '') return '';

    const lastComma = cleaned.lastIndexOf(',');
    const lastDot = cleaned.lastIndexOf('.');
    const separatorIndex = Math.max(lastComma, lastDot);

    if (separatorIndex === -1) {
        return cleaned.replace(/\D/g, '');
    }

    const intPart = cleaned.slice(0, separatorIndex).replace(/\D/g, '');
    const fracPart = cleaned.slice(separatorIndex + 1).replace(/\D/g, '');
    const hasTrailingSeparator = separatorIndex === cleaned.length - 1;
    const normalizedInt = intPart === '' ? '0' : intPart;

    if (hasTrailingSeparator) return `${normalizedInt}.`;
    if (fracPart === '') return normalizedInt;
    return `${normalizedInt}.${fracPart}`;
};