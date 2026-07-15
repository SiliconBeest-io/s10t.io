const BLOCK_END_TAG = /<\/(?:blockquote|div|h[1-6]|li|p)>/gi
const LINE_BREAK_TAG = /<br\s*\/?>/gi

/** Convert trusted or untrusted HTML markup into displayable plain text. */
export function htmlToPlainText(html: string): string {
  if (!html) return ''

  const htmlWithLineBreaks = html
    .replace(LINE_BREAK_TAG, '\n')
    .replace(BLOCK_END_TAG, '$&\n')

  if (typeof DOMParser === 'undefined') {
    return htmlWithLineBreaks.replace(/<[^>]*>/g, '').trim()
  }

  const document = new DOMParser().parseFromString(htmlWithLineBreaks, 'text/html')
  document.body.querySelectorAll('script, style, template').forEach(element => element.remove())
  return (document.body.textContent ?? '').trim()
}
