/**
 * Starts a download of a same-origin file. Call it from a click so the
 * browser treats it as the visitor's own action.
 */
export function download(href: string, file: string) {
  const link = document.createElement('a');
  link.href = href;
  link.download = file;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
