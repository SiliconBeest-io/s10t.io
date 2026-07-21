export type EmojiLike = {
  shortcode: string
  url: string
  static_url?: string
}

function dedupeEmojis(emojis?: EmojiLike[]): EmojiLike[] {
  if (!emojis?.length) return []
  const seen = new Set<string>()
  const result: EmojiLike[] = []
  for (const emoji of emojis) {
    if (!emoji.shortcode || !emoji.url || seen.has(emoji.shortcode)) continue
    seen.add(emoji.shortcode)
    result.push(emoji)
  }
  return result
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildShortcodePattern(emojis: EmojiLike[]): RegExp | null {
  if (emojis.length === 0) return null
  const names = emojis
    .map((emoji) => escapeRegExp(emoji.shortcode))
    .sort((a, b) => b.length - a.length)
    .join('|')
  return new RegExp(`(^|[^\\p{L}\\p{N}_:\\r\\n])\\u200B?:(${names}):\\u200B?(?=$|[^\\p{L}\\p{N}_:\\r\\n])`, 'gu')
}

function makeEmojiImage(emoji: EmojiLike, className: string): HTMLImageElement {
  const img = document.createElement('img')
  img.src = emoji.url
  img.alt = `:${emoji.shortcode}:`
  img.title = emoji.shortcode
  img.className = className
  img.draggable = false
  img.loading = 'lazy'
  img.addEventListener('error', () => {
    img.replaceWith(document.createTextNode(`:${emoji.shortcode}:`))
  }, { once: true })
  return img
}

function replaceTextNode(node: Text, pattern: RegExp, emojiByShortcode: Map<string, EmojiLike>, className: string) {
  const text = node.data
  pattern.lastIndex = 0
  let match = pattern.exec(text)
  if (!match) return

  const fragment = document.createDocumentFragment()
  let lastIndex = 0
  while (match) {
    const prefix = match[1] ?? ''
    const shortcode = match[2] ?? ''
    const emoji = emojiByShortcode.get(shortcode)
    if (emoji) {
      fragment.append(document.createTextNode(text.slice(lastIndex, match.index + prefix.length)))
      fragment.append(makeEmojiImage(emoji, className))
      lastIndex = match.index + match[0].length
    }
    match = pattern.exec(text)
  }
  fragment.append(document.createTextNode(text.slice(lastIndex)))
  node.replaceWith(fragment)
}

export function emojifyHtml(html: string, emojis?: EmojiLike[], className = 'custom-emoji'): string {
  const unique = dedupeEmojis(emojis)
  if (!html || unique.length === 0 || typeof document === 'undefined') return html

  const emojiByShortcode = new Map(unique.map((emoji) => [emoji.shortcode, emoji]))
  const pattern = buildShortcodePattern(unique)
  if (!pattern) return html

  const template = document.createElement('template')
  template.innerHTML = html

  const walker = document.createTreeWalker(template.content, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  let current = walker.nextNode()
  while (current) {
    const parent = current.parentElement
    if (!parent?.closest('code, pre')) {
      textNodes.push(current as Text)
    }
    current = walker.nextNode()
  }

  for (const node of textNodes) {
    replaceTextNode(node, pattern, emojiByShortcode, className)
  }

  return template.innerHTML
}

export function emojifyPlainText(text: string, emojis?: EmojiLike[], className = 'custom-emoji'): string {
  return emojifyHtml(escapeHtml(text), emojis, className)
}

