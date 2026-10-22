// Saves a downloaded file (a Blob) to the person's computer.
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // free the memory a moment later (some browsers need the link alive while the download starts)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
