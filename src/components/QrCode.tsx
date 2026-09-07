import QRCode from 'qrcode'
import { useEffect, useState } from 'react'

/**
 * A QR code as a plain <img>. Rendered client-side by the `qrcode` package —
 * the one new dependency in the guest camera — as a data URL, so no request
 * leaves the page to draw it and nothing about it can be tracked.
 */
export function QrCode({ value, size = 192, className }: { value: string; size?: number; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    QRCode.toDataURL(value, { width: size, margin: 1, color: { dark: '#1f1f1c', light: '#ffffff' } })
      .then((url) => { if (!cancelled) setSrc(url) })
    return () => { cancelled = true }
  }, [value, size])
  if (!src) return <div style={{ width: size, height: size }} className={className} aria-hidden />
  return <img src={src} width={size} height={size} alt={`QR-kode til ${value}`} className={className} />
}

/** A 1024 px PNG for printing, handed to the browser as a download. */
export async function downloadQrPng(value: string, filename: string): Promise<void> {
  const url = await QRCode.toDataURL(value, { width: 1024, margin: 2, color: { dark: '#1f1f1c', light: '#ffffff' } })
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
}
