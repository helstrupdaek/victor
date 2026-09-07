import { SOCIAL_LINKS } from '@/data/siteConfig'

/**
 * "Follow Victor" — two icon links, and nothing else.
 *
 * Deliberately no embeds, no follower counts and no platform scripts. Both
 * Instagram's and TikTok's official embed widgets load third-party JavaScript
 * that tracks every visitor to the page, which is not a reasonable thing to do
 * to people who came to read a party invitation. Two links cost nothing, load
 * nothing, and do the same job.
 *
 * The brand glyphs are inlined as paths rather than pulled from an icon
 * package: lucide, which the rest of the site uses, dropped its brand icons,
 * and adding a whole icon library for two shapes is not worth the dependency.
 */

/** Official Instagram glyph. */
function InstagramIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  )
}

/** Official TikTok glyph. */
function TikTokIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z" />
    </svg>
  )
}

const ICONS = { instagram: InstagramIcon, tiktok: TikTokIcon }

export function SocialLinks() {
  return (
    <div className="flex flex-col items-center gap-3">
      <p className="text-sm text-ink-600">Følg med hos Victor</p>
      <ul className="flex items-center gap-3">
        {SOCIAL_LINKS.map((link) => {
          const Icon = ICONS[link.icon]
          return (
            <li key={link.icon}>
              <a
                href={link.href}
                // noreferrer as well as noopener: without it the destination
                // gets the invitation's URL in its Referer header, and this
                // page is a private family invitation.
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${link.label} (åbner i nyt vindue)`}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-900/10 text-ink-600 transition-colors hover:border-ink-900/20 hover:bg-ink-900/[0.04] hover:text-ink-900"
              >
                <Icon className="h-[18px] w-[18px]" />
              </a>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
