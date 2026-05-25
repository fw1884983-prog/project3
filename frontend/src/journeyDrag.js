export const MIME = {
  KEYWORD: "application/x-journey-keyword",
  TEXT: "application/x-journey-text",
  IMAGE: "application/x-journey-image",
};

export function setDragData(e, mime, payload) {
  e.dataTransfer.setData(mime, JSON.stringify(payload));
  e.dataTransfer.effectAllowed = "copy";
}

export function getDragData(e, mime) {
  const raw = e.dataTransfer.getData(mime);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function newItemId() {
  return `it_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
