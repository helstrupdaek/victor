import { FlagTriangleRight, Menu, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '@/components/Button'
import { Container } from '@/components/Container'
import { NAV_SECTIONS } from '@/data/siteConfig'
import { useScrolled } from '@/hooks/useScrolled'
import { cn, scrollToSection } from '@/lib/utils'

export function Navigation() {
  const scrolled = useScrolled(32)
  const [menuOpen, setMenuOpen] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    if (!menuOpen) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('keydown', handleKeyDown)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [menuOpen])

  function handleNavigate(section: { id: string; to?: string }) {
    setMenuOpen(false)
    // Minigolf is a route, not a section — see NAV_SECTIONS.
    if (section.to) navigate(section.to)
    else scrollToSection(section.id)
  }

  return (
    <header
      className={cn(
        'fixed inset-x-0 top-0 z-50 transition-all duration-300',
        scrolled || menuOpen
          ? 'glass-panel border-b border-ink-900/[0.06] shadow-sm'
          : 'bg-transparent',
      )}
    >
      <Container
        as="nav"
        className="relative flex h-20 items-center justify-end"
        aria-label="Hovednavigation"
      >
        <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-1 rounded-full bg-ink-900/45 px-2 py-2 backdrop-blur-md md:flex">
          {NAV_SECTIONS.map((section) => (
            <li key={section.id}>
              <button
                onClick={() => handleNavigate(section)}
                className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-white/15"
              >
                {/* The one entry that leaves the page carries a flagstick, the
                    same shape as the one standing in the cup in the game. */}
                {section.to && <FlagTriangleRight size={15} strokeWidth={2.25} aria-hidden />}
                {section.label}
              </button>
            </li>
          ))}
        </ul>

        <div className="hidden md:block">
          <Button
            variant="primary"
            className="!px-5 !py-2.5 text-sm"
            onClick={() => handleNavigate({ id: 'tilmelding' })}
          >
            Tilmeld jer
          </Button>
        </div>

        <button
          onClick={() => setMenuOpen((open) => !open)}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          aria-label={menuOpen ? 'Luk menu' : 'Åbn menu'}
          className="-mr-2 ml-4 rounded-full p-2 text-ink-900 md:hidden"
        >
          {menuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </Container>

      {menuOpen && (
        <div
          id="mobile-menu"
          className="glass-panel border-t border-ink-900/[0.06] md:hidden"
        >
          <ul className="flex flex-col px-6 py-4">
            {NAV_SECTIONS.map((section) => (
              <li key={section.id}>
                <button
                  onClick={() => handleNavigate(section)}
                  className="flex w-full items-center gap-2 py-3 text-left text-base font-medium text-ink-900"
                >
                  {section.to && <FlagTriangleRight size={17} strokeWidth={2.25} aria-hidden />}
                  {section.label}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </header>
  )
}
